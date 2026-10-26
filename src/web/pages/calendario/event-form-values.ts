import { EVENT_COLOR_KEYS, type EventColor } from "@/lib/calendar/colors";
import { localDate, localTime } from "@/lib/calendar/dto";
import type { Frequency, Recurrence } from "@/lib/calendar/recurrence";

/** Estado do formulário (tudo em "horário de parede" no fuso da usuária). */
export type FormValues = {
  title: string;
  description: string;
  location: string;
  color: EventColor;
  allDay: boolean;
  startDate: string;
  startTime: string;
  /** Para dia inteiro: último dia (inclusive). */
  endDate: string;
  endTime: string;
  repeat: "none" | Frequency;
  interval: number;
  byWeekday: number[];
  endsMode: "never" | "until" | "count";
  until: string;
  count: number;
};

type Source = {
  title: string;
  description: string | null;
  location: string | null;
  color: string;
  allDay: boolean;
  start: Date;
  /** Exclusivo (dia inteiro: meia-noite do dia seguinte). */
  end: Date;
  recurrence: Recurrence | null;
};

export function valuesFrom(src: Source, tz: string): FormValues {
  const r = src.recurrence;
  const lastInstant = src.allDay ? new Date(src.end.getTime() - 1) : src.end;
  const startDate = localDate(src.start, tz);
  return {
    title: src.title,
    description: src.description ?? "",
    location: src.location ?? "",
    color: (EVENT_COLOR_KEYS as string[]).includes(src.color) ? (src.color as EventColor) : "violet",
    allDay: src.allDay,
    startDate,
    startTime: src.allDay ? "09:00" : localTime(src.start, tz),
    endDate: localDate(lastInstant, tz),
    endTime: src.allDay ? "10:00" : localTime(src.end, tz),
    repeat: r?.freq ?? "none",
    interval: r?.interval ?? 1,
    byWeekday: r?.byWeekday ?? [new Date(`${startDate}T12:00:00Z`).getUTCDay()],
    endsMode: r?.until ? "until" : r?.count ? "count" : "never",
    until: r?.until ?? "",
    count: r?.count ?? 10,
  };
}

/** Valores iniciais para um evento novo. */
export function newEventValues(start: Date, end: Date, allDay: boolean, tz: string): FormValues {
  return valuesFrom(
    { title: "", description: null, location: null, color: "violet", allDay, start, end, recurrence: null },
    tz,
  );
}

/** Converte o formulário no formato validado pelo servidor (eventInputSchema). */
export function toInput(v: FormValues, includeRecurrence: boolean) {
  const recurrence =
    includeRecurrence && v.repeat !== "none"
      ? {
          freq: v.repeat,
          interval: Math.max(1, Math.floor(v.interval || 1)),
          ...(v.repeat === "weekly" ? { byWeekday: v.byWeekday } : {}),
          ...(v.endsMode === "until" && v.until ? { until: v.until } : {}),
          ...(v.endsMode === "count" ? { count: Math.max(1, Math.floor(v.count || 1)) } : {}),
        }
      : null;

  return {
    title: v.title,
    description: v.description,
    location: v.location,
    color: v.color,
    allDay: v.allDay,
    startDate: v.startDate,
    endDate: v.endDate,
    ...(v.allDay ? {} : { startTime: v.startTime, endTime: v.endTime }),
    recurrence,
  };
}
