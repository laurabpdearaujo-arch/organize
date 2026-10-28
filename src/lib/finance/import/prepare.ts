import type { ParsedRow } from "./statement";
import { norm } from "./statement";

/*
 * Preparação da pré-visualização da importação (funções puras, testadas em tests/import-prepare.test.ts).
 */

export type TxKind = "income" | "expense" | "transfer";

/** Descrição "normalizada" usada para regras e duplicatas: sem acento, números ou pontuação. */
export function patternOf(description: string) {
  return norm(description)
    .replace(/[0-9]/g, " ")
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Chave estável de um lançamento importado: conta + data + valor + descrição normalizada + nº da ocorrência
 * (dois cafés iguais no mesmo dia são lançamentos diferentes). Reimportar o mesmo extrato gera as mesmas chaves.
 */
export function fingerprintSource(accountId: string, row: { date: string; amountCents: number; description: string }, occurrence: number) {
  return `${accountId}|${row.date}|${row.amountCents}|${patternOf(row.description)}|${occurrence}`;
}

/** Nº da ocorrência de cada linha entre as idênticas (mesma data, valor e descrição normalizada). */
export function occurrences(rows: ParsedRow[]) {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const k = `${r.date}|${r.amountCents}|${patternOf(r.description)}`;
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return n;
  });
}

export type Rule = { pattern: string; type: TxKind; categoryId: string | null; toAccountId: string | null };
export type Suggestion = { type: TxKind; categoryId: string | null; toAccountId: string | null; source: "rule" | "keyword" | "sign" };

const CARD_PAYMENT = /\b(FATUR\w*|PAG\w* (DE )?CART\w*|CARTAO \w* ?PAG\w*|DEB AUT FATUR|PAGAMENTO RECEBIDO)\b/;
const INVESTMENT = /\b(APLICACAO|APLIC|RESGATE|POUPANCA|INVEST\w*|CDB|TESOURO)\b/;

/**
 * Sugestão para uma linha: 1º regra aprendida (se compatível com o sinal), 2º palavras-chave
 * (pagamento de fatura → transferência para o cartão), 3º sinal do valor.
 */
export function suggest(
  row: ParsedRow,
  ctx: { rules: Map<string, Rule>; accountType: string; cardAccountIds: string[]; linkedCardIds?: string[]; payerAccountId?: string | null },
): Suggestion {
  const p = patternOf(row.description);
  const rule = ctx.rules.get(p);
  const signType: TxKind = row.amountCents >= 0 ? "income" : "expense";
  if (rule && (rule.type === "transfer" || rule.type === signType)) {
    return { type: rule.type, categoryId: rule.type === "transfer" ? null : rule.categoryId, toAccountId: rule.type === "transfer" ? rule.toAccountId : null, source: "rule" };
  }
  if (CARD_PAYMENT.test(p) && ctx.accountType !== "credit_card" && row.amountCents < 0) {
    // vai para o cartão pago por esta conta; sem vínculo, para o único cartão que existir
    const linked = ctx.linkedCardIds ?? [];
    const to = linked.length === 1 ? linked[0] : linked.length === 0 && ctx.cardAccountIds.length === 1 ? ctx.cardAccountIds[0] : null;
    return { type: "transfer", categoryId: null, toAccountId: to, source: "keyword" };
  }
  // Na fatura, o pagamento aparece como crédito ("PAGTO. POR DEB EM C/C", "PAGAMENTO RECEBIDO"):
  // é a transferência da conta corrente para o cartão, não uma receita.
  if (ctx.accountType === "credit_card" && row.amountCents > 0 && (CARD_PAYMENT.test(p) || /\bPAG(TO|AMENTO)?\b/.test(p))) {
    // veio da conta que paga a fatura (se o cartão estiver ligado a uma)
    return { type: "transfer", categoryId: null, toAccountId: ctx.payerAccountId ?? null, source: "keyword" };
  }
  if (INVESTMENT.test(p)) return { type: "transfer", categoryId: null, toAccountId: null, source: "keyword" };
  return { type: signType, categoryId: null, toAccountId: null, source: "sign" };
}

const REVERSAL = /\b(EST|ESTORNO|ESTORNADO|DEVOLUCAO|DEVOL)\b/;

/**
 * Estornos: linha marcada como estorno + outra de mesmo valor e sinal oposto em até 7 dias.
 * Devolve os pares de índices (os dois se anulam e, por padrão, não são importados).
 */
export function findReversals(rows: ParsedRow[]): [number, number][] {
  const used = new Set<number>();
  const pairs: [number, number][] = [];
  const dayMs = 86_400_000;
  rows.forEach((r, i) => {
    if (used.has(i) || !REVERSAL.test(patternOf(r.description))) return;
    let best = -1;
    let bestDist = Infinity;
    rows.forEach((o, j) => {
      if (j === i || used.has(j) || o.amountCents !== -r.amountCents) return;
      const dist = Math.abs(Date.parse(o.date) - Date.parse(r.date));
      if (dist <= 7 * dayMs && dist < bestDist) {
        best = j;
        bestDist = dist;
      }
    });
    if (best >= 0) {
      used.add(i).add(best);
      pairs.push([Math.min(i, best), Math.max(i, best)]);
    }
  });
  return pairs;
}
