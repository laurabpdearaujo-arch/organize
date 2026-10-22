import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { investmentMovements, investments, investmentValuations } from "@/db/schema";
import type { Currency } from "./money";
import type { InvestmentKind, MovementType } from "./investments";

/* Investimentos. Todas as funções recebem o userId (de getCurrentUser) e filtram por ele. */

export async function listInvestments(userId: string) {
  const [rows, moves, vals] = await Promise.all([
    db.select().from(investments).where(eq(investments.userId, userId)).orderBy(asc(investments.createdAt)),
    db.select().from(investmentMovements).where(eq(investmentMovements.userId, userId)).orderBy(asc(investmentMovements.date)),
    db.select().from(investmentValuations).where(eq(investmentValuations.userId, userId)).orderBy(asc(investmentValuations.date)),
  ]);
  return rows.map((r) => ({
    ...r,
    movements: moves.filter((m) => m.investmentId === r.id),
    valuations: vals.filter((v) => v.investmentId === r.id),
  }));
}
export type InvestmentList = Awaited<ReturnType<typeof listInvestments>>;

export type InvestmentValues = {
  name: string;
  kind: InvestmentKind;
  subtype: string | null;
  ticker: string | null;
  institution: string | null;
  currency: Currency;
  color: string;
};

async function owned(userId: string, id: string) {
  const [r] = await db.select().from(investments).where(and(eq(investments.id, id), eq(investments.userId, userId)));
  return r ?? null;
}

export async function createInvestment(userId: string, v: InvestmentValues) {
  await db.insert(investments).values({ ...v, userId });
}

export type UpdateResult = "ok" | "not_found" | "kind_locked";

/** O tipo (por valor × por cotas) não muda depois que há movimentações, para não corromper o histórico. */
export async function updateInvestment(userId: string, id: string, v: InvestmentValues): Promise<UpdateResult> {
  const inv = await owned(userId, id);
  if (!inv) return "not_found";
  if ((inv.kind === "stock") !== (v.kind === "stock")) {
    const moves = await db.select({ id: investmentMovements.id }).from(investmentMovements).where(eq(investmentMovements.investmentId, id)).limit(1);
    if (moves.length) return "kind_locked";
  }
  await db.update(investments).set(v).where(and(eq(investments.id, id), eq(investments.userId, userId)));
  return "ok";
}

export async function setInvestmentArchived(userId: string, id: string, archived: boolean) {
  const r = await db
    .update(investments)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(investments.id, id), eq(investments.userId, userId)))
    .returning({ id: investments.id });
  return r.length > 0;
}

export async function deleteInvestment(userId: string, id: string) {
  const r = await db.delete(investments).where(and(eq(investments.id, id), eq(investments.userId, userId))).returning({ id: investments.id });
  return r.length > 0;
}

export type MovementResult = "ok" | "not_found" | "quantity_required" | "quantity_exceeds";

export async function addMovement(
  userId: string,
  investmentId: string,
  m: { date: string; type: MovementType; amountCents: number; quantity: number | null; notes: string | null },
): Promise<MovementResult> {
  const inv = await owned(userId, investmentId);
  if (!inv) return "not_found";
  const needsQty = inv.kind === "stock" && m.type !== "income";
  if (needsQty && !m.quantity) return "quantity_required";
  if (m.type === "withdrawal" && inv.kind === "stock") {
    const moves = await db.select().from(investmentMovements).where(eq(investmentMovements.investmentId, investmentId));
    const held = moves.reduce((q, x) => (x.quantity === null ? q : x.type === "withdrawal" ? q - x.quantity : x.type === "income" ? q : q + x.quantity), 0);
    if ((m.quantity ?? 0) > held + 1e-9) return "quantity_exceeds";
  }
  await db.insert(investmentMovements).values({ ...m, quantity: needsQty ? m.quantity : null, userId, investmentId });
  return "ok";
}

export async function deleteMovement(userId: string, id: string) {
  const r = await db
    .delete(investmentMovements)
    .where(and(eq(investmentMovements.id, id), eq(investmentMovements.userId, userId)))
    .returning({ id: investmentMovements.id });
  return r.length > 0;
}

/** Atualização de valor (uma por dia: atualizar de novo no mesmo dia substitui). */
export async function setValuation(userId: string, investmentId: string, date: string, cents: number) {
  const inv = await owned(userId, investmentId);
  if (!inv) return false;
  const values = inv.kind === "stock" ? { priceCents: cents, valueCents: null } : { valueCents: cents, priceCents: null };
  await db
    .insert(investmentValuations)
    .values({ userId, investmentId, date, ...values })
    .onConflictDoUpdate({ target: [investmentValuations.investmentId, investmentValuations.date], set: { ...values, updatedAt: new Date() } });
  return true;
}

export async function deleteValuation(userId: string, id: string) {
  const r = await db
    .delete(investmentValuations)
    .where(and(eq(investmentValuations.id, id), eq(investmentValuations.userId, userId)))
    .returning({ id: investmentValuations.id });
  return r.length > 0;
}
