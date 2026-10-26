import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { accounts, billPayments, bills } from "@/db/schema";

/* Contas a pagar. Todas as funções recebem o userId (de getCurrentUser) e filtram por ele. */

export type BillValues = { name: string; amountCents: number | null; dueDay: number; autoDebit: boolean; accountId: string | null; notes: string | null };

export async function listBills(userId: string) {
  const [rows, pays] = await Promise.all([
    db.select().from(bills).where(eq(bills.userId, userId)).orderBy(asc(bills.dueDay), asc(bills.name)),
    db.select().from(billPayments).where(eq(billPayments.userId, userId)),
  ]);
  return rows.map((b) => ({ ...b, payments: pays.filter((p) => p.billId === b.id).map((p) => ({ month: p.month, paidOn: p.paidOn })) }));
}
export type BillList = Awaited<ReturnType<typeof listBills>>;

async function accountOk(userId: string, accountId: string | null) {
  if (!accountId) return true;
  const r = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));
  return r.length > 0;
}

export async function createBill(userId: string, v: BillValues) {
  if (!(await accountOk(userId, v.accountId))) return false;
  await db.insert(bills).values({ ...v, userId });
  return true;
}

export async function updateBill(userId: string, id: string, v: BillValues) {
  if (!(await accountOk(userId, v.accountId))) return false;
  const r = await db.update(bills).set(v).where(and(eq(bills.id, id), eq(bills.userId, userId))).returning({ id: bills.id });
  return r.length > 0;
}

export async function setBillArchived(userId: string, id: string, archived: boolean) {
  const r = await db
    .update(bills)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(bills.id, id), eq(bills.userId, userId)))
    .returning({ id: bills.id });
  return r.length > 0;
}

export async function deleteBill(userId: string, id: string) {
  const r = await db.delete(bills).where(and(eq(bills.id, id), eq(bills.userId, userId))).returning({ id: bills.id });
  return r.length > 0;
}

/** Marca (paidOn) ou desmarca (null) a conta como paga no mês "AAAA-MM". */
export async function setBillPaid(userId: string, billId: string, month: string, paidOn: string | null) {
  const [b] = await db.select({ id: bills.id }).from(bills).where(and(eq(bills.id, billId), eq(bills.userId, userId)));
  if (!b) return false;
  if (paidOn === null) {
    await db.delete(billPayments).where(and(eq(billPayments.billId, billId), eq(billPayments.month, month), eq(billPayments.userId, userId)));
  } else {
    await db
      .insert(billPayments)
      .values({ userId, billId, month, paidOn })
      .onConflictDoUpdate({ target: [billPayments.billId, billPayments.month], set: { paidOn, updatedAt: new Date() } });
  }
  return true;
}

/** Contas ativas sem débito automático + meses já pagos, para os lembretes do calendário. */
export async function billsForCalendar(userId: string) {
  const rows = await db.select().from(bills).where(and(eq(bills.userId, userId), eq(bills.autoDebit, false)));
  const active = rows.filter((b) => !b.archivedAt);
  if (active.length === 0) return [];
  const pays = await db.select().from(billPayments).where(and(eq(billPayments.userId, userId), inArray(billPayments.billId, active.map((b) => b.id))));
  return active.map((b) => ({ ...b, paidMonths: new Set(pays.filter((p) => p.billId === b.id).map((p) => p.month)) }));
}
