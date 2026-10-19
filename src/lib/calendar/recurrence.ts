import { TZDate } from "@date-fns/tz";

/** 0 = domingo … 6 = sábado (a semana começa no domingo, como no calendário). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Frequency = "daily" | "weekly" | "monthly" | "yearly";

export type Recurrence = {
  freq: Frequency;
  /** A cada N dias/semanas/meses/anos (mínimo 1). */
  interval: number;
  /** Só para "weekly". Vazio = mesmo dia da semana do início. */
  byWeekday?: Weekday[];
  /** Última data possível (inclusive), "AAAA-MM-DD" no fuso do evento. */
  until?: string;
  /** Número total de ocorrências (contando as canceladas). */
  count?: number;
};

export type EventFields = {
  title: string;
  description: string | null;
  location: string | null;
  color: string;
};

export type Series = EventFields & {
  id: string;
  allDay: boolean;
  startsAt: Date;
  /** Para "dia inteiro", é a meia-noite do dia seguinte ao último dia (exclusivo). */
  endsAt: Date;
  timezone: string;
  recurrence: Recurrence | null;
};

/**
 * Alteração de uma única ocorrência de uma série.
 * Campos nulos/ausentes herdam da série; descrição/local "" significa "apagado nesta ocorrência".
 */
export type SeriesException = {
  title?: string | null;
  description?: string | null;
  location?: string | null;
  color?: string | null;
  eventId: string;
  /** Início que a ocorrência teria pela regra; identifica qual ocorrência foi alterada. */
  originalStart: Date;
  cancelled: boolean;
  allDay?: boolean | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
};

export type Occurrence = EventFields & {
  key: string;
  eventId: string;
  originalStart: Date;
  start: Date;
  end: Date;
  allDay: boolean;
  recurring: boolean;
  /** true quando esta ocorrência foi editada individualmente. */
  modified: boolean;
};

// ---------- datas "de calendário" (sem hora, sem fuso) ----------

type LocalDate = { y: number; m: number; d: number }; // m: 0–11
const DAY_MS = 86_400_000;

function toUtcMs(ld: LocalDate) {
  return Date.UTC(ld.y, ld.m, ld.d);
}
function fromUtcMs(ms: number): LocalDate {
  const dt = new Date(ms);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}
function addDays(ld: LocalDate, n: number): LocalDate {
  return fromUtcMs(toUtcMs(ld) + n * DAY_MS);
}
function weekday(ld: LocalDate): Weekday {
  return new Date(toUtcMs(ld)).getUTCDay() as Weekday;
}
function compare(a: LocalDate, b: LocalDate) {
  return toUtcMs(a) - toUtcMs(b);
}
function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}
export function parseLocalDate(s: string): LocalDate {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m: m - 1, d };
}

/** Data/hora de parede em um fuso → instante real. */
export function zonedInstant(ld: LocalDate, hh: number, mi: number, tz: string): Date {
  return new Date(new TZDate(ld.y, ld.m, ld.d, hh, mi, 0, 0, tz).getTime());
}
function localParts(date: Date, tz: string) {
  const z = new TZDate(date.getTime(), tz);
  return { ld: { y: z.getFullYear(), m: z.getMonth(), d: z.getDate() }, hh: z.getHours(), mi: z.getMinutes() };
}

/** Datas candidatas em ordem crescente, a partir do início da série (gerador infinito). */
function* candidateDates(start: LocalDate, rec: Recurrence): Generator<LocalDate> {
  const interval = Math.max(1, Math.floor(rec.interval));
  switch (rec.freq) {
    case "daily":
      for (let k = 0; ; k += interval) yield addDays(start, k);
    case "weekly": {
      const days = rec.byWeekday?.length
        ? [...new Set(rec.byWeekday)].sort((a, b) => a - b)
        : [weekday(start)];
      const weekStart = addDays(start, -weekday(start));
      for (let w = 0; ; w += interval) {
        for (const wd of days) {
          const c = addDays(weekStart, w * 7 + wd);
          if (compare(c, start) >= 0) yield c;
        }
      }
    }
    case "monthly":
      for (let k = 0; ; k += interval) {
        const first = fromUtcMs(Date.UTC(start.y, start.m + k, 1));
        // Dia 31 em mês de 30 dias: esse mês é pulado (padrão de calendários, RFC 5545).
        if (start.d <= daysInMonth(first.y, first.m)) yield { ...first, d: start.d };
      }
    case "yearly":
      for (let k = 0; ; k += interval) {
        const y = start.y + k;
        if (start.d <= daysInMonth(y, start.m)) yield { y, m: start.m, d: start.d };
      }
  }
}

const MAX_ITERATIONS = 50_000;

/**
 * Lista as ocorrências de uma série que se sobrepõem a [rangeStart, rangeEnd).
 * Aplica cancelamentos e alterações individuais.
 */
export function expandSeries(
  series: Series,
  exceptions: SeriesException[],
  rangeStart: Date,
  rangeEnd: Date,
): Occurrence[] {
  const tz = series.timezone;
  const durationMs = series.endsAt.getTime() - series.startsAt.getTime();
  const start = localParts(series.startsAt, tz);
  const allDaySpan = series.allDay
    ? Math.round((toUtcMs(localParts(series.endsAt, tz).ld) - toUtcMs(start.ld)) / DAY_MS)
    : 0;

  const base = {
    eventId: series.id,
    title: series.title,
    description: series.description,
    location: series.location,
    color: series.color,
    recurring: series.recurrence !== null,
  };
  const overlaps = (s: Date, e: Date) => s < rangeEnd && e > rangeStart;
  const out: Occurrence[] = [];

  if (!series.recurrence) {
    if (overlaps(series.startsAt, series.endsAt)) {
      out.push({
        ...base,
        key: occurrenceKey(series.id, series.startsAt),
        originalStart: series.startsAt,
        start: series.startsAt,
        end: series.endsAt,
        allDay: series.allDay,
        modified: false,
      });
    }
    return out;
  }

  const rec = series.recurrence;
  const until = rec.until ? parseLocalDate(rec.until) : null;
  const byOriginal = new Map(exceptions.map((e) => [e.originalStart.getTime(), e]));

  let generated = 0;
  let iterations = 0;
  for (const ld of candidateDates(start.ld, rec)) {
    if (++iterations > MAX_ITERATIONS) break;
    if (until && compare(ld, until) > 0) break;
    if (rec.count && generated >= rec.count) break;
    generated++;

    const s = series.allDay ? zonedInstant(ld, 0, 0, tz) : zonedInstant(ld, start.hh, start.mi, tz);
    const e = series.allDay ? zonedInstant(addDays(ld, allDaySpan), 0, 0, tz) : new Date(s.getTime() + durationMs);
    if (s >= rangeEnd) break;
    if (byOriginal.has(s.getTime())) continue; // tratada abaixo (cancelada ou alterada)
    if (e > rangeStart) {
      out.push({ ...base, key: occurrenceKey(series.id, s), originalStart: s, start: s, end: e, allDay: series.allDay, modified: false });
    }
  }

  // Ocorrências alteradas individualmente podem ter sido movidas para dentro (ou fora) do intervalo.
  for (const ex of exceptions) {
    if (ex.cancelled) continue;
    const s = ex.startsAt ?? ex.originalStart;
    const e = ex.endsAt ?? new Date(s.getTime() + durationMs);
    if (!overlaps(s, e)) continue;
    out.push({
      ...base,
      key: occurrenceKey(series.id, ex.originalStart),
      originalStart: ex.originalStart,
      start: s,
      end: e,
      allDay: ex.allDay ?? series.allDay,
      title: ex.title ?? series.title,
      description: (ex.description ?? series.description) || null,
      location: (ex.location ?? series.location) || null,
      color: ex.color ?? series.color,
      modified: true,
    });
  }

  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function occurrenceKey(eventId: string, originalStart: Date) {
  return `${eventId}__${originalStart.toISOString()}`;
}
