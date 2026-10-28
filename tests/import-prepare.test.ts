import { describe, expect, it } from "vitest";
import { findReversals, fingerprintSource, occurrences, patternOf, suggest, type Rule } from "@/lib/finance/import/prepare";

const row = (date: string, description: string, amountCents: number) => ({ date, description, amountCents });

describe("descrição normalizada e chave de duplicata", () => {
  it("ignora acentos, números e pontuação", () => {
    expect(patternOf("TRANSFERENCIA PIX · DES: Padaria Boa 28/03")).toBe("TRANSFERENCIA PIX DES PADARIA BOA");
    expect(patternOf("PIX RECEB.OUTRA IF")).toBe("PIX RECEB OUTRA IF");
  });

  it("dois lançamentos idênticos no mesmo dia têm chaves diferentes; reimportar gera as mesmas", () => {
    const rows = [row("2026-10-01", "CAFE", -500), row("2026-10-01", "CAFE", -500), row("2026-10-02", "CAFE", -500)];
    const occ = occurrences(rows);
    expect(occ).toEqual([0, 1, 0]);
    const keys = rows.map((r, i) => fingerprintSource("acc", r, occ[i]));
    expect(new Set(keys).size).toBe(3);
    expect(rows.map((r, i) => fingerprintSource("acc", r, occurrences(rows)[i]))).toEqual(keys);
  });
});

describe("sugestões", () => {
  const rules = new Map<string, Rule>([
    ["PIX QR CODE DINAMICO DES MERCADO BOM", { pattern: "PIX QR CODE DINAMICO DES MERCADO BOM", type: "expense", categoryId: "cat-mercado", toAccountId: null }],
  ]);
  const ctx = { rules, accountType: "checking", cardAccountIds: ["card-1"] };

  it("usa a regra aprendida", () => {
    expect(suggest(row("2026-10-01", "PIX QR CODE DINAMICO · DES: Mercado Bom 01/10", -3000), ctx)).toEqual({
      type: "expense",
      categoryId: "cat-mercado",
      toAccountId: null,
      source: "rule",
    });
  });

  it("regra de despesa não vale para uma entrada (ex.: estorno da loja)", () => {
    expect(suggest(row("2026-10-01", "PIX QR CODE DINAMICO · DES: Mercado Bom 01/10", 3000), ctx).type).toBe("income");
  });

  it("pagamento de fatura vira transferência para o cartão (único cartão)", () => {
    expect(suggest(row("2026-10-13", "DEB AUT FATUR CART · Debito Automatico Cartao", -21398), ctx)).toMatchObject({
      type: "transfer",
      toAccountId: "card-1",
      source: "keyword",
    });
    // com dois cartões, a pessoa escolhe
    expect(suggest(row("2026-10-13", "PAGAMENTO FATURA CARTAO", -100), { ...ctx, cardAccountIds: ["a", "b"] }).toAccountId).toBeNull();
  });

  it("pagamento de fatura vai para o cartão pago por esta conta, mesmo havendo outros cartões", () => {
    const fatura = row("2026-10-13", "PAGAMENTO FATURA CARTAO", -100);
    expect(suggest(fatura, { ...ctx, cardAccountIds: ["a", "b"], linkedCardIds: ["b"] }).toAccountId).toBe("b");
    // dois cartões pagos pela mesma conta: a pessoa escolhe
    expect(suggest(fatura, { ...ctx, cardAccountIds: ["a", "b"], linkedCardIds: ["a", "b"] }).toAccountId).toBeNull();
    // nenhum cartão ligado a esta conta e um único cartão no total: vai para ele (como antes do vínculo)
    expect(suggest(fatura, { ...ctx, cardAccountIds: ["a"], linkedCardIds: [] }).toAccountId).toBe("a");
  });

  it("na fatura do cartão, o pagamento (crédito) vira transferência", () => {
    const cardCtx = { ...ctx, accountType: "credit_card" };
    expect(suggest(row("2026-05-11", "PAGTO. POR DEB EM C/C", 150000), cardCtx).type).toBe("transfer");
    expect(suggest(row("2026-05-12", "MERCADO BOM", -3000), cardCtx).type).toBe("expense");
    // cartão ligado a uma conta: o pagamento veio dela
    expect(suggest(row("2026-05-11", "PAGTO. POR DEB EM C/C", 150000), { ...cardCtx, payerAccountId: "bradesco" }).toAccountId).toBe("bradesco");
    expect(suggest(row("2026-05-11", "PAGTO. POR DEB EM C/C", 150000), cardCtx).toAccountId).toBeNull();
  });

  it("sem regra: pelo sinal", () => {
    expect(suggest(row("2026-10-01", "TARIFA BANCARIA", -1240), ctx).type).toBe("expense");
    expect(suggest(row("2026-10-01", "REMUNERACAO/SALARIO", 500000), ctx).type).toBe("income");
  });
});

describe("estornos", () => {
  it("débito e seu estorno se anulam", () => {
    const rows = [
      row("2024-08-12", "DÉB.CONV.DEM.EMPRES · MASTERCARD", -1065879),
      row("2024-08-12", "EST.DÉB.CONV.DEM.EM · MASTERCARD", 1065879),
      row("2024-08-13", "DEB AUT FATUR CART", -21398),
    ];
    expect(findReversals(rows)).toEqual([[0, 1]]);
  });

  it("valor igual sem a palavra estorno não é pareado", () => {
    expect(findReversals([row("2024-08-12", "PIX ENVIADO", -100), row("2024-08-12", "PIX RECEBIDO", 100)])).toEqual([]);
  });
});
