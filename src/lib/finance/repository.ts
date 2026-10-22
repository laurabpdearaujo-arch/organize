import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, goalContributions, profiles, savingsGoals, transactions } from "@/db/schema";
import { DEFAULT_CATEGORIES } from "./constants";
import type { Currency } from "./money";
import { addMonths } from "./summary";
import type { TxInput } from "./schemas";

/*
 * Acesso a dados financeiros. Todas as funções recebem o userId (de getCurrentUser)
 * e validam que contas/categorias/metas referenciadas pertencem a ele.
 */

export type FinanceData = Awaited<ReturnType<typeof loadFinance>>;

/**
 * Cria as categorias padrão e a "Carteira (dinheiro)" UMA única vez por usuária.
 * A página faz várias leituras ao mesmo tempo; por isso a "reserva" é feita no banco
 * (UPDATE … WHERE finance_setup_at IS NULL só dá certo para a primeira requisição).
 * Se a pessoa apagar a carteira depois, ela não é recriada.
 */
export async function ensureDefaults(userId: string) {
  await db.insert(profiles).values({ userId }).onConflictDoNothing();
  const claimed = await db
    .update(profiles)
    .set({ financeSetupAt: new Date() })
    .where(and(eq(profiles.userId, userId), isNull(profiles.financeSetupAt)))
    .returning({ userId: profiles.userId });
  if (claimed.length === 0) return;

  await db
    .insert(categories)
    .values(DEFAULT_CATEGORIES.map((c) => ({ ...c, userId })))
    .onConflictDoNothing();
  // Dinheiro vivo é uma "conta" própria: gasto em espécie não sai do banco.
  await db.insert(accounts).values({ userId, name: "Carteira (dinheiro)", type: "cash", color: "green" });
}

/**
 * "Ajustar saldo": informa o saldo real de hoje e corrige o saldo inicial da conta,
 * sem criar receita/despesa falsa.
 */
export async function adjustBalance(userId: string, accountId: string, targetCents: number) {
  const [acc] = await db.select().from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));
  if (!acc) return false;
  const [{ delta }] = await db.execute<{ delta: string | null }>(sql`
    select coalesce(sum(case
      when account_id = ${accountId} and type = 'income' then amount_cents
      when account_id = ${accountId} then -amount_cents
      when to_account_id = ${accountId} then amount_cents end), 0) as delta
    from ${transactions} where user_id = ${userId} and (account_id = ${accountId} or to_account_id = ${accountId})`);
  const current = acc.initialBalanceCents + Number(delta ?? 0);
  await db
    .update(accounts)
    .set({ initialBalanceCents: acc.initialBalanceCents + (targetCents - current) })
    .where(eq(accounts.id, accountId));
  return true;
}

/** Tudo que a tela de finanças precisa para o mês escolhido (e os 5 anteriores, para o gráfico). */
export async function loadFinance(userId: string, month: string) {
  await ensureDefaults(userId);
  const from = `${addMonths(month, -5)}-01`;
  const to = `${addMonths(month, 1)}-01`;

  const [accs, cats, txs, balances, goals, contributions] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.userId, userId)).orderBy(asc(accounts.createdAt)),
    db.select().from(categories).where(eq(categories.userId, userId)).orderBy(asc(categories.name)),
    db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, userId), gte(transactions.date, from), lte(transactions.date, to)))
      .orderBy(desc(transactions.date), desc(transactions.createdAt)),
    // Saldo atual de cada conta, calculado no banco sobre todo o histórico
    db.execute<{ account_id: string; delta: string }>(sql`
      select account_id, sum(case when type = 'income' then amount_cents else -amount_cents end) as delta
        from ${transactions} where user_id = ${userId} group by account_id
      union all
      select to_account_id, sum(amount_cents)
        from ${transactions} where user_id = ${userId} and type = 'transfer' group by to_account_id`),
    db.select().from(savingsGoals).where(eq(savingsGoals.userId, userId)).orderBy(asc(savingsGoals.createdAt)),
    db.select().from(goalContributions).where(eq(goalContributions.userId, userId)).orderBy(desc(goalContributions.date)),
  ]);

  const delta = new Map<string, number>();
  for (const r of balances) delta.set(r.account_id, (delta.get(r.account_id) ?? 0) + Number(r.delta));

  return {
    accounts: accs.map((a) => ({ ...a, balanceCents: a.initialBalanceCents + (delta.get(a.id) ?? 0) })),
    categories: cats,
    transactions: txs.filter((t) => t.date < to),
    goals: goals.map((g) => {
      const own = contributions.filter((c) => c.goalId === g.id);
      return { ...g, savedCents: own.reduce((s, c) => s + c.amountCents, 0), contributions: own };
    }),
  };
}

// ---------- contas ----------

type AccountValues = {
  name: string;
  type: "checking" | "savings" | "cash" | "investment" | "credit_card";
  currency: Currency;
  initialBalanceCents: number;
  color: string;
  closingDay: number | null;
  dueDay: number | null;
};

export async function createAccount(userId: string, v: AccountValues) {
  const [row] = await db.insert(accounts).values({ ...v, userId }).returning({ id: accounts.id });
  return row.id;
}

export type AccountUpdateResult = "ok" | "not_found" | "currency_locked";

export async function updateAccount(userId: string, id: string, v: AccountValues): Promise<AccountUpdateResult> {
  const [acc] = await db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
  if (!acc) return "not_found";
  if (acc.currency !== v.currency && (await countAccountTx(userId, id)) > 0) return "currency_locked";
  await db.update(accounts).set(v).where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
  return "ok";
}

async function countAccountTx(userId: string, accountId: string) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), sql`(${transactions.accountId} = ${accountId} or ${transactions.toAccountId} = ${accountId})`));
  return n;
}

export async function setAccountArchived(userId: string, id: string, archived: boolean) {
  const r = await db
    .update(accounts)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .returning({ id: accounts.id });
  return r.length > 0;
}

/** Só apaga conta sem lançamentos (para não sumir com histórico). */
export async function deleteAccount(userId: string, id: string): Promise<"ok" | "not_found" | "has_transactions"> {
  if ((await countAccountTx(userId, id)) > 0) return "has_transactions";
  const r = await db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, userId))).returning({ id: accounts.id });
  return r.length ? "ok" : "not_found";
}

// ---------- categorias ----------

export async function createCategory(userId: string, v: { name: string; kind: "expense" | "income"; color: string }) {
  const r = await db.insert(categories).values({ ...v, userId }).onConflictDoNothing().returning({ id: categories.id });
  return r.length > 0;
}

export async function updateCategory(userId: string, id: string, v: { name: string; color: string }) {
  const r = await db.update(categories).set(v).where(and(eq(categories.id, id), eq(categories.userId, userId))).returning({ id: categories.id });
  return r.length > 0;
}

export async function setCategoryArchived(userId: string, id: string, archived: boolean) {
  const r = await db
    .update(categories)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .returning({ id: categories.id });
  return r.length > 0;
}

// ---------- lançamentos ----------

export type TxCheck = "ok" | "account_not_found" | "category_invalid" | "currency_mismatch";

/** Confere que contas e categoria pertencem à usuária e são compatíveis com o tipo. */
async function checkTx(userId: string, v: TxInput): Promise<TxCheck> {
  const ids = [v.accountId, ...(v.toAccountId ? [v.toAccountId] : [])];
  const accs = await db.select().from(accounts).where(and(eq(accounts.userId, userId), inArray(accounts.id, ids)));
  if (accs.length !== new Set(ids).size) return "account_not_found";
  if (v.type === "transfer" && accs[0].currency !== accs[1].currency) return "currency_mismatch";
  if (v.categoryId) {
    if (v.type === "transfer") return "category_invalid";
    const [cat] = await db.select().from(categories).where(and(eq(categories.id, v.categoryId), eq(categories.userId, userId)));
    if (!cat || cat.kind !== v.type) return "category_invalid";
  }
  return "ok";
}

function txValues(v: TxInput) {
  return {
    type: v.type,
    accountId: v.accountId,
    toAccountId: v.type === "transfer" ? v.toAccountId : null,
    amountCents: v.amount,
    date: v.date,
    description: v.description,
    categoryId: v.type === "transfer" ? null : v.categoryId,
    paymentMethod: v.paymentMethod,
    notes: v.notes || null,
  };
}

export async function createTx(userId: string, v: TxInput): Promise<TxCheck> {
  const c = await checkTx(userId, v);
  if (c !== "ok") return c;
  await db.insert(transactions).values({ ...txValues(v), userId });
  return "ok";
}

export async function updateTx(userId: string, id: string, v: TxInput): Promise<TxCheck | "not_found"> {
  const c = await checkTx(userId, v);
  if (c !== "ok") return c;
  const r = await db
    .update(transactions)
    .set(txValues(v))
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .returning({ id: transactions.id });
  return r.length ? "ok" : "not_found";
}

export async function deleteTx(userId: string, id: string) {
  const r = await db.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId))).returning({ id: transactions.id });
  return r.length > 0;
}

// ---------- metas ----------

type GoalValues = { name: string; targetCents: number; currency: Currency; deadline: string | null; color: string };

export async function createGoal(userId: string, v: GoalValues) {
  await db.insert(savingsGoals).values({ ...v, userId });
}

export async function updateGoal(userId: string, id: string, v: GoalValues) {
  const r = await db.update(savingsGoals).set(v).where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId))).returning({ id: savingsGoals.id });
  return r.length > 0;
}

export async function setGoalArchived(userId: string, id: string, archived: boolean) {
  const r = await db
    .update(savingsGoals)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
    .returning({ id: savingsGoals.id });
  return r.length > 0;
}

export async function deleteGoal(userId: string, id: string) {
  const r = await db.delete(savingsGoals).where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId))).returning({ id: savingsGoals.id });
  return r.length > 0;
}

export async function addContribution(userId: string, goalId: string, amountCents: number, date: string, note: string | null) {
  const [g] = await db.select().from(savingsGoals).where(and(eq(savingsGoals.id, goalId), eq(savingsGoals.userId, userId)));
  if (!g) return false;
  await db.insert(goalContributions).values({ userId, goalId, amountCents, date, note });
  return true;
}

export async function deleteContribution(userId: string, id: string) {
  const r = await db
    .delete(goalContributions)
    .where(and(eq(goalContributions.id, id), eq(goalContributions.userId, userId)))
    .returning({ id: goalContributions.id });
  return r.length > 0;
}
