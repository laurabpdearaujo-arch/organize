import { z } from "zod";
import { EVENT_COLOR_KEYS } from "./colors";
import { parseLocalDate, zonedInstant, type Recurrence } from "./recurrence";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido.");

export const recurrenceSchema = z
  .object({
    freq: z.enum(["daily", "weekly", "monthly", "yearly"]),
    interval: z.number().int().min(1).max(99),
    byWeekday: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    until: dateStr.optional(),
    count: z.number().int().min(1).max(1000).optional(),
  })
  .refine((r) => !(r.until && r.count), "Escolha terminar em uma data OU após N vezes, não os dois.");

/** O que o formulário envia: datas e horas "de parede", no fuso da usuária. */
export const eventInputSchema = z
  .object({
    title: z.string().trim().min(1, "Dê um título ao evento.").max(200),
    description: z.string().trim().max(5000).default(""),
    location: z.string().trim().max(300).default(""),
    color: z.enum(EVENT_COLOR_KEYS),
    allDay: z.boolean(),
    startDate: dateStr,
    startTime: timeStr.optional(),
    /** Para "dia inteiro", é o último dia (inclusive). */
    endDate: dateStr,
    endTime: timeStr.optional(),
    recurrence: recurrenceSchema.nullable(),
  })
  .superRefine((v, ctx) => {
    if (!v.allDay && (!v.startTime || !v.endTime)) {
      ctx.addIssue({ code: "custom", message: "Informe o horário de início e de fim.", path: ["startTime"] });
      return;
    }
    const start = v.startDate + (v.allDay ? "" : `T${v.startTime}`);
    const end = v.endDate + (v.allDay ? "" : `T${v.endTime}`);
    if (v.allDay ? end < start : end <= start) {
      ctx.addIssue({ code: "custom", message: "O fim precisa ser depois do início.", path: ["endDate"] });
    }
    if (v.recurrence?.until && v.recurrence.until < v.startDate) {
      ctx.addIssue({ code: "custom", message: "A repetição termina antes do início.", path: ["recurrence"] });
    }
  });

export type EventInput = z.infer<typeof eventInputSchema>;

export type SeriesValues = {
  title: string;
  description: string | null;
  location: string | null;
  color: string;
  allDay: boolean;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  recurrence: Recurrence | null;
};

/** Converte o formulário (horário de parede) nos instantes que vão para o banco. */
export function inputToSeriesValues(input: EventInput, timezone: string): SeriesValues {
  const startLd = parseLocalDate(input.startDate);
  const endLd = parseLocalDate(input.endDate);
  let startsAt: Date;
  let endsAt: Date;
  if (input.allDay) {
    startsAt = zonedInstant(startLd, 0, 0, timezone);
    endsAt = zonedInstant({ ...endLd, d: endLd.d + 1 }, 0, 0, timezone); // dia seguinte, exclusivo
  } else {
    const [sh, sm] = input.startTime!.split(":").map(Number);
    const [eh, em] = input.endTime!.split(":").map(Number);
    startsAt = zonedInstant(startLd, sh, sm, timezone);
    endsAt = zonedInstant(endLd, eh, em, timezone);
  }

  let recurrence: Recurrence | null = null;
  if (input.recurrence) {
    const r = input.recurrence;
    recurrence = {
      freq: r.freq,
      interval: r.interval,
      ...(r.freq === "weekly" && r.byWeekday?.length
        ? { byWeekday: [...new Set(r.byWeekday)].sort((a, b) => a - b) as Recurrence["byWeekday"] }
        : {}),
      ...(r.until ? { until: r.until } : {}),
      ...(r.count ? { count: r.count } : {}),
    };
  }

  return {
    title: input.title,
    description: input.description || null,
    location: input.location || null,
    color: input.color,
    allDay: input.allDay,
    startsAt,
    endsAt,
    timezone,
    recurrence,
  };
}

/** A mudança afeta quando as ocorrências acontecem? (Se sim, alterações individuais deixam de valer.) */
export function timingChanged(
  before: Pick<SeriesValues, "allDay" | "startsAt" | "endsAt" | "timezone" | "recurrence">,
  after: Pick<SeriesValues, "allDay" | "startsAt" | "endsAt" | "timezone" | "recurrence">,
) {
  return (
    before.allDay !== after.allDay ||
    before.startsAt.getTime() !== after.startsAt.getTime() ||
    before.endsAt.getTime() !== after.endsAt.getTime() ||
    before.timezone !== after.timezone ||
    JSON.stringify(before.recurrence) !== JSON.stringify(after.recurrence)
  );
}
