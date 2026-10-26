
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { runAction, type ActionResult } from "@/server/action";
import { localDate } from "@/lib/calendar/dto";
import * as repo from "@/lib/habits/repository";
import {
  goalInputSchema,
  goalProblem,
  habitDetailsSchema,
  habitInputSchema,
  MAX_BACKFILL_DAYS,
  normalizeGoal,
  unitFor,
} from "@/lib/habits/schemas";
import { addDays } from "@/lib/habits/dates";

const NOT_FOUND: ActionResult = { ok: false, error: "Hábito não encontrado. Recarregue a página." };
const BAD: ActionResult = { ok: false, error: "Requisição inválida." };
const id = z.uuid();

async function context() {
  const user = await getCurrentUser();
  return { user, today: localDate(new Date(), user.timezone) };
}

function startDateProblem(startDate: string, today: string) {
  if (startDate > today) return "A data de início não pode ser no futuro.";
  if (startDate < addDays(today, -MAX_BACKFILL_DAYS)) return "A data de início pode voltar no máximo 3 anos.";
  return null;
}

function done(ok: boolean): ActionResult {
  if (!ok) return NOT_FOUND;
  return { ok: true };
}

export async function createHabit(payload: unknown) {
  return runAction("habitos", async () => {
    const { user, today } = await context();
    const v = habitInputSchema.safeParse(payload);
    if (!v.success) return { ok: false, error: v.error.issues[0]?.message ?? "Dados inválidos." };
    const { goal, startDate, ...rest } = v.data;
    const dateIssue = startDateProblem(startDate, today);
    if (dateIssue) return { ok: false, error: dateIssue };
    await repo.createHabit(
      user.id,
      { ...rest, unit: unitFor(rest.measure, rest.unit) },
      normalizeGoal(goal, rest.measure),
      startDate,
    );
    return done(true);
  });
}

export async function updateHabit(payload: unknown) {
  return runAction("habitos", async () => {
    const { user, today } = await context();
    const req = z.object({ habitId: id, details: habitDetailsSchema }).safeParse(payload);
    if (!req.success) return { ok: false, error: req.error.issues[0]?.message ?? "Dados inválidos." };
    const habit = (await repo.loadHabits(user.id)).find((h) => h.id === req.data.habitId);
    if (!habit) return NOT_FOUND;
    const { startDate, ...d } = req.data.details;
    if (habit.measure === "quantity" && !d.unit) return { ok: false, error: "Informe a unidade." };
    const dateIssue = startDateProblem(startDate, today);
    if (dateIssue) return { ok: false, error: dateIssue };

    const moved = await repo.setStartDate(user.id, habit.id, startDate);
    if (moved === "logs_before") {
      return { ok: false, error: "Há registros antes dessa data. Apague-os na grade ou escolha uma data anterior." };
    }
    if (moved === "not_found") return NOT_FOUND;
    return done(
      await repo.updateHabitDetails(user.id, habit.id, { ...d, unit: unitFor(habit.measure, d.unit) }),
    );
  });
}

export async function changeGoal(payload: unknown) {
  return runAction("habitos", async () => {
    const { user, today } = await context();
    const req = z
      .object({ habitId: id, goal: goalInputSchema, mode: z.enum(["from_today", "correct"]) })
      .safeParse(payload);
    if (!req.success) return BAD;
    const habit = (await repo.loadHabits(user.id)).find((h) => h.id === req.data.habitId);
    if (!habit) return NOT_FOUND;
    const problem = goalProblem(req.data.goal, habit.measure, habit.direction);
    if (problem) return { ok: false, error: problem };
    const goal = normalizeGoal(req.data.goal, habit.measure);
    return done(
      req.data.mode === "correct"
        ? await repo.correctGoal(user.id, habit.id, goal)
        : await repo.setGoal(user.id, habit.id, goal, today),
    );
  });
}

export async function setPaused(payload: unknown) {
  return runAction("habitos", async () => {
    const { user, today } = await context();
    const req = z.object({ habitId: id, paused: z.boolean() }).safeParse(payload);
    if (!req.success) return BAD;
    const fn = req.data.paused ? repo.pauseHabit : repo.resumeHabit;
    return done(await fn(user.id, req.data.habitId, today));
  });
}

export async function setArchived(payload: unknown) {
  return runAction("habitos", async () => {
    const { user } = await context();
    const req = z.object({ habitId: id, archived: z.boolean() }).safeParse(payload);
    if (!req.success) return BAD;
    return done(await repo.setArchived(user.id, req.data.habitId, req.data.archived));
  });
}

export async function deleteHabit(payload: unknown) {
  return runAction("habitos", async () => {
    const { user } = await context();
    const req = z.object({ habitId: id }).safeParse(payload);
    if (!req.success) return BAD;
    return done(await repo.deleteHabit(user.id, req.data.habitId));
  });
}

export async function setLog(payload: unknown) {
  return runAction("habitos", async () => {
    const { user, today } = await context();
    const req = z
      .object({
        habitId: id,
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        value: z.number().min(0).max(100_000).nullable(),
      })
      .safeParse(payload);
    if (!req.success) return BAD;
    const r = await repo.setLog(user.id, req.data.habitId, req.data.date, req.data.value, today);
    if (r === "future") return { ok: false, error: "Não dá para registrar um dia que ainda não chegou." };
    if (r === "before_start") return { ok: false, error: "Esse dia é anterior à criação do hábito." };
    return done(r === "ok");
  });
}
