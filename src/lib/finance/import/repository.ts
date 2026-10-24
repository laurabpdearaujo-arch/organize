import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, importBatches, importRules, transactions } from "@/db/schema";
import { pdfToLines } from "./pdf-lines";
import { parseStatement, type Reconciliation } from "./statement";
import { findReversals, fingerprintSource, occurrences, patternOf, suggest, type Rule, type Suggestion, type TxKind } from "./prepare";

/*
 * Importação de extratos. O PDF é lido em memória e descartado: só o hash fica registrado,
 * para avisar se o mesmo arquivo for importado de novo.
 */

const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
const MAX_ROWS = 1000;

export type PreviewRow = {
  index: number;
  date: string;
  description: string;
  amountCents: number;
  occurrence: number;
  /** "duplicate": já importado (mesma chave). "possible_duplicate": lançamento parecido já existe. */
  status: "new" | "duplicate" | "possible_duplicate";
  hint: string | null;
  reversalOf: number | null;
  suggestion: Suggestion;
};

export type Preview = {
  accountId: string;
  fileName: string;
  fileHash: string;
  period: { start: string; end: string } | null;
  reconciliation: Reconciliation;
  warnings: string[];
  alreadyImportedAt: string | null;
  rows: PreviewRow[];
};

function shortDate(d: string) {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

export async function buildPreview(
  userId: string,
  accountId: string,
  fileName: string,
  bytes: Uint8Array,
  today: string,
): Promise<Preview | { error: string }> {
  const [acc] = await db.select().from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));
  if (!acc) return { error: "Conta não encontrada." };
  if (acc.type === "cash") return { error: "Dinheiro em espécie não tem extrato. Escolha uma conta de banco ou um cartão." };

  const fileHash = sha256(bytes);
  let parsed;
  try {
    const { lines } = await pdfToLines(bytes);
    // Conta de cartão → o PDF é uma fatura (compra sem sinal = saída; crédito com "-").
    parsed = parseStatement(lines, { fallbackYear: Number(today.slice(0, 4)), mode: acc.type === "credit_card" ? "card" : "bank" });
  } catch {
    return { error: "Não consegui ler este PDF. Ele pode estar protegido por senha ou ser uma imagem escaneada." };
  }
  if (parsed.rows.length === 0) return { error: parsed.warnings[0] ?? "Nenhum lançamento encontrado neste PDF." };
  if (parsed.rows.length > MAX_ROWS) return { error: `Extrato com mais de ${MAX_ROWS} lançamentos. Importe um período menor.` };

  const rows = parsed.rows;
  const occ = occurrences(rows);
  const fps = rows.map((r, i) => sha256(fingerprintSource(accountId, r, occ[i])));

  const minDate = rows[0].date;
  const maxDate = rows[rows.length - 1].date;
  const shift = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);

  const [existingFp, nearby, ruleRows, cards, prior] = await Promise.all([
    db
      .select({ fingerprint: transactions.fingerprint })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), inArray(transactions.fingerprint, fps))),
    db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          or(eq(transactions.accountId, accountId), eq(transactions.toAccountId, accountId)),
          gte(transactions.date, shift(minDate, -3)),
          lte(transactions.date, shift(maxDate, 3)),
        ),
      ),
    db.select().from(importRules).where(eq(importRules.userId, userId)),
    db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.type, "credit_card"), eq(accounts.currency, acc.currency), isNull(accounts.archivedAt))),
    db
      .select({ createdAt: importBatches.createdAt })
      .from(importBatches)
      .where(and(eq(importBatches.userId, userId), eq(importBatches.accountId, accountId), eq(importBatches.fileHash, fileHash)))
      .orderBy(desc(importBatches.createdAt))
      .limit(1),
  ]);

  const known = new Set(existingFp.map((r) => r.fingerprint));
  const rules = new Map<string, Rule>(ruleRows.map((r) => [r.pattern, r]));
  const ctx = { rules, accountType: acc.type, cardAccountIds: cards.filter((c) => c.id !== accountId).map((c) => c.id) };

  // Lançamentos parecidos já existentes (ex.: lançados à mão): mesmo valor/direção, até 3 dias de diferença.
  const candidates = nearby
    .filter((t) => !t.fingerprint || !fps.includes(t.fingerprint))
    .map((t) => ({ t, signed: t.accountId === accountId ? (t.type === "income" ? t.amountCents : -t.amountCents) : t.amountCents }));
  const usedCandidates = new Set<string>();

  const reversals = findReversals(rows);
  const reversalOf = new Map<number, number>();
  for (const [a, b] of reversals) {
    reversalOf.set(a, b);
    reversalOf.set(b, a);
  }

  const previewRows: PreviewRow[] = rows.map((r, i) => {
    let status: PreviewRow["status"] = known.has(fps[i]) ? "duplicate" : "new";
    let hint: string | null = status === "duplicate" ? "Já importado antes" : null;
    if (status === "new") {
      const match = candidates.find(
        ({ t, signed }) => !usedCandidates.has(t.id) && signed === r.amountCents && Math.abs(Date.parse(t.date) - Date.parse(r.date)) <= 3 * 86_400_000,
      );
      if (match) {
        usedCandidates.add(match.t.id);
        status = "possible_duplicate";
        hint = `Parecido com “${match.t.description}” de ${shortDate(match.t.date)}`;
      }
    }
    const rev = reversalOf.get(i);
    if (rev !== undefined && !hint) hint = "Estorno: se anula com outro lançamento";
    return {
      index: i,
      date: r.date,
      description: r.description,
      amountCents: r.amountCents,
      occurrence: occ[i],
      status,
      hint,
      reversalOf: rev ?? null,
      suggestion: suggest(r, ctx),
    };
  });

  return {
    accountId,
    fileName,
    fileHash,
    period: parsed.period,
    reconciliation: parsed.reconciliation,
    warnings: parsed.warnings,
    alreadyImportedAt: prior[0]?.createdAt.toISOString() ?? null,
    rows: previewRows,
  };
}

export type CommitRow = {
  date: string;
  originalDescription: string;
  description: string;
  amountCents: number;
  occurrence: number;
  type: TxKind;
  categoryId: string | null;
  toAccountId: string | null;
  remember: boolean;
};

function guessMethod(desc: string, type: TxKind, accountType: string) {
  const p = patternOf(desc);
  if (type === "transfer") return "transfer" as const;
  if (accountType === "credit_card") return "credit" as const;
  if (/\bPIX\b/.test(p)) return "pix" as const;
  if (/\bBOLETO\b/.test(p)) return "boleto" as const;
  if (/\bDEB AUT\b|\bDEBITO AUTOMATICO\b/.test(p)) return "auto_debit" as const;
  if (/\bTED\b|\bDOC\b|\bTRANSF/.test(p)) return "transfer" as const;
  if (/\bDEBITO\b|\bCOMPRA\b/.test(p)) return "debit" as const;
  return "other" as const;
}

export type CommitError = "account_not_found" | "category_invalid" | "transfer_invalid" | "sign_mismatch";

/** Grava os lançamentos confirmados. Duplicatas (mesma chave) são ignoradas pelo banco. */
export async function commitImport(
  userId: string,
  input: { accountId: string; fileName: string; fileHash: string; period: { start: string; end: string } | null; rows: CommitRow[] },
): Promise<{ imported: number; skipped: number } | { error: CommitError }> {
  const [acc] = await db.select().from(accounts).where(and(eq(accounts.id, input.accountId), eq(accounts.userId, userId)));
  if (!acc) return { error: "account_not_found" };

  const userAccounts = await db.select().from(accounts).where(eq(accounts.userId, userId));
  const userCats = await db.select().from(categories).where(eq(categories.userId, userId));
  const accById = new Map(userAccounts.map((a) => [a.id, a]));
  const catById = new Map(userCats.map((c) => [c.id, c]));

  for (const r of input.rows) {
    if (r.type === "transfer") {
      const other = r.toAccountId ? accById.get(r.toAccountId) : null;
      if (!other || other.id === acc.id || other.currency !== acc.currency) return { error: "transfer_invalid" };
    } else {
      if ((r.type === "income") !== r.amountCents > 0) return { error: "sign_mismatch" };
      if (r.categoryId && catById.get(r.categoryId)?.kind !== r.type) return { error: "category_invalid" };
    }
  }

  return db.transaction(async (tx) => {
    // O lote é criado antes para que cada lançamento saiba de onde veio (permite desfazer a importação).
    const [batch] = await tx
      .insert(importBatches)
      .values({
        userId,
        accountId: acc.id,
        fileHash: input.fileHash,
        fileName: input.fileName.slice(0, 200),
        periodStart: input.period?.start ?? null,
        periodEnd: input.period?.end ?? null,
      })
      .returning({ id: importBatches.id });
    let imported = 0;
    for (const r of input.rows) {
      const fingerprint = sha256(fingerprintSource(acc.id, { date: r.date, amountCents: r.amountCents, description: r.originalDescription }, r.occurrence));
      const out = r.amountCents < 0;
      const base = {
        userId,
        amountCents: Math.abs(r.amountCents),
        date: r.date,
        description: r.description.slice(0, 200) || r.originalDescription.slice(0, 200),
        paymentMethod: guessMethod(r.originalDescription, r.type, acc.type),
        notes: `Importado de ${input.fileName}`.slice(0, 1000),
        fingerprint,
        importBatchId: batch.id,
      };
      const values =
        r.type === "transfer"
          ? { ...base, type: "transfer" as const, accountId: out ? acc.id : r.toAccountId!, toAccountId: out ? r.toAccountId! : acc.id, categoryId: null }
          : { ...base, type: r.type, accountId: acc.id, toAccountId: null, categoryId: r.categoryId };
      const res = await tx.insert(transactions).values(values).onConflictDoNothing().returning({ id: transactions.id });
      imported += res.length;

      if (r.remember) {
        const pattern = patternOf(r.originalDescription);
        if (pattern) {
          const rule = { type: r.type, categoryId: r.type === "transfer" ? null : r.categoryId, toAccountId: r.type === "transfer" ? r.toAccountId : null };
          await tx
            .insert(importRules)
            .values({ userId, pattern, ...rule })
            .onConflictDoUpdate({ target: [importRules.userId, importRules.pattern], set: { ...rule, updatedAt: new Date() } });
        }
      }
    }
    const skipped = input.rows.length - imported;
    await tx.update(importBatches).set({ rowsImported: imported, rowsSkipped: skipped }).where(eq(importBatches.id, batch.id));
    return { imported, skipped };
  });
}

/** Importações feitas, com quantos lançamentos ainda existem de cada uma. */
export async function listImports(userId: string) {
  const rows = await db
    .select({
      id: importBatches.id,
      accountId: importBatches.accountId,
      fileName: importBatches.fileName,
      periodStart: importBatches.periodStart,
      periodEnd: importBatches.periodEnd,
      createdAt: importBatches.createdAt,
      // nome qualificado de propósito: sem ele, "id" seria o id do lançamento dentro da subconsulta
      remaining: sql<number>`(select count(*)::int from transactions t where t.import_batch_id = "import_batches"."id")`,
    })
    .from(importBatches)
    .where(eq(importBatches.userId, userId))
    .orderBy(desc(importBatches.createdAt));
  return rows;
}

/** Desfaz uma importação: apaga o lote e, em cascata, todos os lançamentos que vieram dele. */
export async function undoImport(userId: string, batchId: string) {
  const deleted = await db
    .delete(importBatches)
    .where(and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)))
    .returning({ id: importBatches.id });
  return deleted.length > 0;
}
