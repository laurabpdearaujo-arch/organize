import { z } from "zod";
import { EVENT_COLOR_KEYS } from "@/lib/calendar/colors";

export const HABIT_CATEGORIES = ["Saúde", "Estudos", "Bem-estar", "Trabalho", "Finanças", "Casa", "Outros"] as const;

/** Até quanto tempo atrás a data de início pode ir. */
export const MAX_BACKFILL_DAYS = 3 * 366;
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

export const goalInputSchema = z.object({
  scheduleType: z.enum(["days", "weekly"]),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  timesPerWeek: z.number().int().min(1).max(7).nullable(),
  target: z.number().min(0).max(100_000).nullable(),
});
export type GoalInput = z.infer<typeof goalInputSchema>;

const measureSchema = z.enum(["boolean", "quantity", "duration"]);

export const habitInputSchema = z
  .object({
    name: z.string().trim().min(1, "Dê um nome ao hábito.").max(80),
    direction: z.enum(["build", "reduce"]),
    measure: measureSchema,
    unit: z.string().trim().max(20).default(""),
    category: z.enum(HABIT_CATEGORIES),
    color: z.enum(EVENT_COLOR_KEYS),
    /** Dia em que o hábito começou (pode ser no passado, para lançar dias anteriores). */
    startDate: dateStr,
    goal: goalInputSchema,
  })
  .superRefine((v, ctx) => {
    if (v.direction === "reduce" && v.measure === "boolean") {
      ctx.addIssue({ code: "custom", message: "Para reduzir, use quantidade ou duração com um limite diário.", path: ["measure"] });
    }
    if (v.measure === "quantity" && !v.unit) {
      ctx.addIssue({ code: "custom", message: "Informe a unidade (ex.: páginas, copos).", path: ["unit"] });
    }
    const goalIssue = goalProblem(v.goal, v.measure, v.direction);
    if (goalIssue) ctx.addIssue({ code: "custom", message: goalIssue, path: ["goal"] });
  });
export type HabitInput = z.infer<typeof habitInputSchema>;

export const habitDetailsSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome ao hábito.").max(80),
  unit: z.string().trim().max(20).default(""),
  category: z.enum(HABIT_CATEGORIES),
  color: z.enum(EVENT_COLOR_KEYS),
  startDate: dateStr,
});

/** Mensagem de erro da meta, ou null se estiver ok. */
export function goalProblem(goal: GoalInput, measure: z.infer<typeof measureSchema>, direction: "build" | "reduce") {
  if (goal.scheduleType === "days" && goal.weekdays.length === 0) return "Escolha pelo menos um dia da semana.";
  if (goal.scheduleType === "weekly" && !goal.timesPerWeek) return "Informe quantas vezes por semana.";
  if (measure !== "boolean") {
    if (goal.target === null) return direction === "reduce" ? "Informe o limite diário." : "Informe a meta diária.";
    if (direction === "build" && goal.target <= 0) return "A meta precisa ser maior que zero.";
  }
  return null;
}

/** Forma normalizada que vai para o banco. */
export function normalizeGoal(goal: GoalInput, measure: z.infer<typeof measureSchema>) {
  return {
    scheduleType: goal.scheduleType,
    weekdays: goal.scheduleType === "days" ? [...new Set(goal.weekdays)].sort((a, b) => a - b) : [],
    timesPerWeek: goal.scheduleType === "weekly" ? goal.timesPerWeek : null,
    target: measure === "boolean" ? null : goal.target,
  };
}

export function unitFor(measure: z.infer<typeof measureSchema>, unit: string) {
  if (measure === "duration") return "min";
  if (measure === "boolean") return null;
  return unit;
}
