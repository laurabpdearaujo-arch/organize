import "server-only";
import { and, asc, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { habitGoals, habitLogs, habitPauses, habits } from "@/db/schema";
import { addDays } from "./dates";
import type { HabitData } from "./stats";
import type { normalizeGoal } from "./schemas";

/*
 * Acesso a dados dos hábitos. Todas as funções recebem o userId (vindo de getCurrentUser)
 * e conferem que o hábito pertence a ele antes de qualquer gravação.
 */

type Goal = ReturnType<typeof normalizeGoal>;

export async function loadHabits(userId: string): Promise<HabitData[]> {
  const [rows, goals, pauses, logs] = await Promise.all([
    db.select().from(habits).where(eq(habits.userId, userId)).orderBy(asc(habits.createdAt)),
    db.select().from(habitGoals).where(eq(habitGoals.userId, userId)).orderBy(asc(habitGoals.effectiveFrom)),
    db.select().from(habitPauses).where(eq(habitPauses.userId, userId)),
    db.select().from(habitLogs).where(eq(habitLogs.userId, userId)),
  ]);

  return rows.map((h) => ({
    id: h.id,
    name: h.name,
    direction: h.direction,
    measure: h.measure,
    unit: h.unit,
    category: h.category,
    color: h.color,
    createdOn: h.createdOn,
    archived: h.archivedAt !== null,
    versions: goals
      .filter((g) => g.habitId === h.id)
      .map((g) => ({
        effectiveFrom: g.effectiveFrom,
        scheduleType: g.scheduleType,
        weekdays: g.weekdays,
        timesPerWeek: g.timesPerWeek,
        target: g.target,
      })),
    pauses: pauses.filter((p) => p.habitId === h.id).map((p) => ({ start: p.startDate, end: p.endDate })),
    logs: Object.fromEntries(logs.filter((l) => l.habitId === h.id).map((l) => [l.date, l.value])),
  }));
}

async function ownedHabit(userId: string, habitId: string) {
  const [row] = await db
    .select()
    .from(habits)
    .where(and(eq(habits.id, habitId), eq(habits.userId, userId)));
  return row ?? null;
}

export async function createHabit(
  userId: string,
  values: { name: string; direction: "build" | "reduce"; measure: "boolean" | "quantity" | "duration"; unit: string | null; category: string; color: string },
  goal: Goal,
  startDate: string,
) {
  return db.transaction(async (tx) => {
    const [h] = await tx
      .insert(habits)
      .values({ ...values, userId, createdOn: startDate })
      .returning({ id: habits.id });
    await tx.insert(habitGoals).values({ ...goal, userId, habitId: h.id, effectiveFrom: startDate });
    return h.id;
  });
}

export type StartDateResult = "ok" | "not_found" | "logs_before";

/**
 * Muda a data de início. Para trás: a primeira meta passa a valer desde a nova data.
 * Para frente: só se não houver registros antes; metas anteriores são resumidas na nova data.
 */
export async function setStartDate(userId: string, habitId: string, startDate: string): Promise<StartDateResult> {
  const h = await ownedHabit(userId, habitId);
  if (!h) return "not_found";
  if (startDate === h.createdOn) return "ok";

  return db.transaction(async (tx) => {
    const goals = await tx
      .select()
      .from(habitGoals)
      .where(and(eq(habitGoals.habitId, habitId), eq(habitGoals.userId, userId)))
      .orderBy(asc(habitGoals.effectiveFrom));

    if (startDate > h.createdOn) {
      const early = await tx
        .select({ id: habitLogs.id })
        .from(habitLogs)
        .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.userId, userId), lt(habitLogs.date, startDate)))
        .limit(1);
      if (early.length) return "logs_before";
      // A meta vigente na nova data de início passa a começar nela; as anteriores somem.
      const before = goals.filter((g) => g.effectiveFrom <= startDate);
      const keep = before.at(-1);
      for (const g of before) {
        if (g.id === keep?.id) continue;
        await tx.delete(habitGoals).where(eq(habitGoals.id, g.id));
      }
      if (keep && keep.effectiveFrom !== startDate) {
        await tx.update(habitGoals).set({ effectiveFrom: startDate }).where(eq(habitGoals.id, keep.id));
      }
      await tx.delete(habitPauses).where(and(eq(habitPauses.habitId, habitId), lt(habitPauses.endDate, startDate)));
    } else if (goals[0]) {
      await tx.update(habitGoals).set({ effectiveFrom: startDate }).where(eq(habitGoals.id, goals[0].id));
    }

    await tx.update(habits).set({ createdOn: startDate }).where(eq(habits.id, habitId));
    return "ok";
  });
}

export async function updateHabitDetails(
  userId: string,
  habitId: string,
  values: { name: string; unit: string | null; category: string; color: string },
) {
  const updated = await db
    .update(habits)
    .set(values)
    .where(and(eq(habits.id, habitId), eq(habits.userId, userId)))
    .returning({ id: habits.id });
  return updated.length > 0;
}

/** Nova meta a partir de hoje (se já mudou hoje, substitui a de hoje). O passado não muda. */
export async function setGoal(userId: string, habitId: string, goal: Goal, today: string) {
  const h = await ownedHabit(userId, habitId);
  if (!h) return false;
  await db
    .insert(habitGoals)
    .values({ ...goal, userId, habitId, effectiveFrom: today })
    .onConflictDoUpdate({ target: [habitGoals.habitId, habitGoals.effectiveFrom], set: { ...goal, updatedAt: new Date() } });
  return true;
}

/**
 * Corrige uma configuração feita por engano: substitui TODO o histórico de metas por uma única
 * meta, valendo desde o início do hábito. Todos os dias são reavaliados por ela.
 */
export async function correctGoal(userId: string, habitId: string, goal: Goal) {
  const h = await ownedHabit(userId, habitId);
  if (!h) return false;
  await db.transaction(async (tx) => {
    await tx.delete(habitGoals).where(and(eq(habitGoals.habitId, habitId), eq(habitGoals.userId, userId)));
    await tx.insert(habitGoals).values({ ...goal, userId, habitId, effectiveFrom: h.createdOn });
  });
  return true;
}

export async function pauseHabit(userId: string, habitId: string, today: string) {
  if (!(await ownedHabit(userId, habitId))) return false;
  const open = await db
    .select()
    .from(habitPauses)
    .where(and(eq(habitPauses.habitId, habitId), eq(habitPauses.userId, userId), isNull(habitPauses.endDate)));
  if (open.length === 0) await db.insert(habitPauses).values({ userId, habitId, startDate: today });
  return true;
}

/** Retoma a partir de hoje: hoje volta a contar. */
export async function resumeHabit(userId: string, habitId: string, today: string) {
  if (!(await ownedHabit(userId, habitId))) return false;
  const open = await db
    .select()
    .from(habitPauses)
    .where(and(eq(habitPauses.habitId, habitId), eq(habitPauses.userId, userId), isNull(habitPauses.endDate)));
  for (const p of open) {
    if (p.startDate >= today) await db.delete(habitPauses).where(eq(habitPauses.id, p.id));
    else await db.update(habitPauses).set({ endDate: addDays(today, -1) }).where(eq(habitPauses.id, p.id));
  }
  return true;
}

export async function setArchived(userId: string, habitId: string, archived: boolean) {
  const updated = await db
    .update(habits)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(habits.id, habitId), eq(habits.userId, userId)))
    .returning({ id: habits.id });
  return updated.length > 0;
}

export async function deleteHabit(userId: string, habitId: string) {
  const deleted = await db
    .delete(habits)
    .where(and(eq(habits.id, habitId), eq(habits.userId, userId)))
    .returning({ id: habits.id });
  return deleted.length > 0;
}

export type SetLogResult = "ok" | "not_found" | "before_start" | "future";

/** Registra o valor do dia (null apaga o registro). */
export async function setLog(userId: string, habitId: string, date: string, value: number | null, today: string): Promise<SetLogResult> {
  const h = await ownedHabit(userId, habitId);
  if (!h) return "not_found";
  if (date > today) return "future";
  if (date < h.createdOn) return "before_start";

  if (value === null) {
    await db.delete(habitLogs).where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.userId, userId), eq(habitLogs.date, date)));
  } else {
    await db
      .insert(habitLogs)
      .values({ userId, habitId, date, value })
      .onConflictDoUpdate({ target: [habitLogs.habitId, habitLogs.date], set: { value, updatedAt: new Date() } });
  }
  return "ok";
}
