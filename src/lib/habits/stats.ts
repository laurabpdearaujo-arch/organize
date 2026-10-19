import { addDays, eachDay, maxDate, minDate, weekdayOf, weekStartOf } from "./dates";

/*
 * Regras dos hábitos (funções puras, testadas em tests/habits.test.ts).
 *
 * - Desenvolver (build): cumpre quando registra (sim/não) ou quando atinge a meta (quantidade/duração).
 * - Reduzir (reduce): sempre com limite diário; cumpre quando o registrado fica ≤ limite.
 *   Dia sem registro = "não registrado": não conta como cumprido nem como falha na consistência,
 *   mas interrompe a sequência.
 * - Frequência "days": dias fixos da semana. Frequência "weekly": X vezes por semana, em qualquer dia.
 * - A meta tem versões com data de início: mudar a meta não reescreve o passado.
 * - Dias pausados não contam para nada.
 */

export type Direction = "build" | "reduce";
export type Measure = "boolean" | "quantity" | "duration";
export type ScheduleType = "days" | "weekly";

export type GoalVersion = {
  effectiveFrom: string;
  scheduleType: ScheduleType;
  weekdays: number[];
  timesPerWeek: number | null;
  /** Meta (build) ou limite (reduce). Nulo para sim/não. */
  target: number | null;
};

export type HabitData = {
  id: string;
  name: string;
  direction: Direction;
  measure: Measure;
  unit: string | null;
  category: string;
  color: string;
  createdOn: string;
  archived: boolean;
  /** Ordenadas por effectiveFrom crescente. */
  versions: GoalVersion[];
  /** Intervalos pausados, inclusive. end nulo = ainda pausado. */
  pauses: { start: string; end: string | null }[];
  /** data → valor registrado */
  logs: Record<string, number>;
};

export type DayStatus =
  | "done" // cumpriu (em dia previsto)
  | "extra" // registrou num dia de folga: aparece, mas não conta para metas nem sequência
  | "partial" // registrou algo, mas abaixo da meta
  | "missed" // dia previsto que passou sem cumprir
  | "exceeded" // reduzir: passou do limite
  | "unregistered" // reduzir: sem registro (neutro)
  | "pending" // hoje, ainda não cumprido
  | "open" // frequência semanal: dia livre sem registro
  | "off" // dia não previsto (frequência por dias fixos)
  | "paused"
  | "na" // antes de o hábito existir
  | "future";

export function versionOn(h: HabitData, date: string): GoalVersion | null {
  let found: GoalVersion | null = null;
  for (const v of h.versions) {
    if (v.effectiveFrom <= date) found = v;
    else break;
  }
  return found;
}

export function isPaused(h: HabitData, date: string) {
  return h.pauses.some((p) => p.start <= date && (p.end === null || date <= p.end));
}

export function isCurrentlyPaused(h: HabitData, today: string) {
  return isPaused(h, today);
}

function meets(h: HabitData, v: GoalVersion, value: number) {
  if (h.direction === "reduce") return value <= (v.target ?? 0);
  if (h.measure === "boolean") return value >= 1;
  return value >= (v.target ?? 0);
}

export function dayStatus(h: HabitData, date: string, today: string): DayStatus {
  if (date > today) return "future";
  if (date < h.createdOn) return "na";
  const v = versionOn(h, date);
  if (!v) return "na";
  if (isPaused(h, date)) return "paused";

  const value = h.logs[date];
  const has = value !== undefined;
  const isToday = date === today;

  if (v.scheduleType === "days" && !v.weekdays.includes(weekdayOf(date))) {
    return has ? "extra" : "off";
  }

  if (h.direction === "reduce") {
    if (!has) return isToday ? "pending" : "unregistered";
    return meets(h, v, value) ? "done" : "exceeded";
  }

  if (has && meets(h, v, value)) return "done";
  if (has && value > 0) return isToday ? "pending" : "partial";
  if (isToday) return "pending";
  return v.scheduleType === "weekly" ? "open" : "missed";
}

/** Dias cumpridos numa semana (domingo a sábado), até hoje. */
function weekDone(h: HabitData, weekStart: string, today: string) {
  let n = 0;
  for (const d of eachDay(weekStart, addDays(weekStart, 6))) if (dayStatus(h, d, today) === "done") n++;
  return n;
}

type WeekEval = { target: number; done: number; complete: boolean; skip: boolean };

/** Avaliação de uma semana para hábitos "X vezes por semana". */
function evalWeek(h: HabitData, weekStart: string, today: string): WeekEval | null {
  const weekEnd = addDays(weekStart, 6);
  const ref = minDate(weekEnd, today);
  if (ref < h.createdOn) return null;
  const v = versionOn(h, ref);
  if (!v || v.scheduleType !== "weekly") return null;
  const skip = eachDay(maxDate(weekStart, h.createdOn), ref).some((d) => isPaused(h, d));
  return { target: v.timesPerWeek ?? 1, done: weekDone(h, weekStart, today), complete: weekEnd < today, skip };
}

/**
 * Metas devidas e cumpridas no período [from, to] (to ≤ hoje).
 * Semanas incompletas (a atual) só somam o que já foi cumprido: não penalizam antes de acabar.
 */
export function goalSlots(h: HabitData, from: string, to: string, today: string) {
  let due = 0;
  let met = 0;
  for (const d of eachDay(from, to)) {
    const v = versionOn(h, d);
    if (!v || v.scheduleType !== "days") continue;
    const st = dayStatus(h, d, today);
    if (st === "done") {
      due++;
      met++;
    } else if (st === "missed" || st === "partial" || st === "exceeded") {
      due++;
    }
  }
  for (let ws = weekStartOf(from); ws <= to; ws = addDays(ws, 7)) {
    const w = evalWeek(h, ws, today);
    if (!w || w.skip) continue;
    const weekEnd = addDays(ws, 6);
    const m = Math.min(w.done, w.target);
    if (w.complete) {
      if (weekEnd < from || weekEnd > to) continue; // semana conta no período em que termina
      due += w.target;
      met += m;
    } else {
      due += m;
      met += m;
    }
  }
  return { due, met };
}

export function rate(slots: { due: number; met: number }) {
  return slots.due === 0 ? null : slots.met / slots.due;
}

type Unit = "met" | "fail" | "skip" | "pending";

function dayUnits(h: HabitData, today: string): Unit[] {
  return eachDay(h.createdOn, today).map((d) => {
    const v = versionOn(h, d);
    if (!v || v.scheduleType !== "days") return "skip";
    const st = dayStatus(h, d, today);
    if (st === "done") return "met";
    if (st === "pending") return "pending";
    if (st === "missed" || st === "partial" || st === "exceeded" || st === "unregistered") return "fail";
    return "skip";
  });
}

function weekUnits(h: HabitData, today: string): Unit[] {
  const out: Unit[] = [];
  for (let ws = weekStartOf(h.createdOn); ws <= today; ws = addDays(ws, 7)) {
    const w = evalWeek(h, ws, today);
    if (!w || w.skip) out.push("skip");
    else if (w.done >= w.target) out.push("met");
    else out.push(w.complete ? "fail" : "pending");
  }
  return out;
}

function streaks(units: Unit[]) {
  let best = 0;
  let run = 0;
  for (const u of units) {
    if (u === "met") best = Math.max(best, ++run);
    else if (u === "fail") run = 0;
  }
  let current = 0;
  for (let i = units.length - 1; i >= 0; i--) {
    const u = units[i];
    if (u === "met") current++;
    else if (u === "fail") break;
    // skip e pending (hoje/semana em andamento) não interrompem
  }
  return { current, best };
}

/** Sequência do hábito, em dias (dias fixos) ou semanas (X por semana), conforme a meta atual. */
export function habitStreak(h: HabitData, today: string) {
  const v = versionOn(h, today) ?? h.versions.at(-1);
  const unit: "dias" | "semanas" = v?.scheduleType === "weekly" ? "semanas" : "dias";
  return { ...streaks(unit === "dias" ? dayUnits(h, today) : weekUnits(h, today)), unit };
}

/** Sequência geral: dias seguidos em que TODAS as metas diárias previstas foram cumpridas. */
export function overallStreak(habits: HabitData[], today: string) {
  const active = habits.filter((h) => !h.archived);
  if (active.length === 0) return { current: 0, best: 0 };
  const first = active.reduce((m, h) => minDate(m, h.createdOn), today);
  const units: Unit[] = eachDay(first, today).map((d) => {
    let any = false;
    let pending = false;
    for (const h of active) {
      const v = versionOn(h, d);
      if (!v || v.scheduleType !== "days") continue;
      const st = dayStatus(h, d, today);
      if (st === "done") any = true;
      else if (st === "pending") pending = true;
      else if (st === "missed" || st === "partial" || st === "exceeded" || st === "unregistered") return "fail";
    }
    return pending ? "pending" : any ? "met" : "skip";
  });
  return streaks(units);
}

export function overallRate(habits: HabitData[], days: number, today: string) {
  const from = addDays(today, -(days - 1));
  let due = 0;
  let met = 0;
  for (const h of habits) {
    if (h.archived) continue;
    const s = goalSlots(h, maxDate(from, h.createdOn), today, today);
    due += s.due;
    met += s.met;
  }
  return rate({ due, met });
}

/** Metas do dia para o mapa de calor; null = nada previsto no dia. */
export function dayScore(habits: HabitData[], date: string, today: string) {
  let due = 0;
  let met = 0;
  for (const h of habits) {
    if (h.archived && !Object.keys(h.logs).length) continue;
    const v = versionOn(h, date);
    if (!v) continue;
    const st = dayStatus(h, date, today);
    if (st === "done") {
      due++;
      met++;
    } else if (st === "missed" || st === "partial" || st === "exceeded") {
      due++;
    }
  }
  return due === 0 ? null : { due, met };
}

/** % de metas cumpridas por semana, das mais antigas para a atual. */
export function weeklyRates(habits: HabitData[], weeks: number, today: string) {
  const current = weekStartOf(today);
  const out: { weekStart: string; rate: number | null; due: number; met: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = addDays(current, -7 * i);
    const we = minDate(addDays(ws, 6), today);
    let due = 0;
    let met = 0;
    for (const h of habits) {
      if (h.archived) continue;
      if (we < h.createdOn) continue;
      const s = goalSlots(h, maxDate(ws, h.createdOn), we, today);
      due += s.due;
      met += s.met;
    }
    out.push({ weekStart: ws, rate: rate({ due, met }), due, met });
  }
  return out;
}

/** Resumo da semana exibida na grade (coluna "Semana"). */
export function weekSummary(h: HabitData, weekStart: string, today: string) {
  const weekEnd = addDays(weekStart, 6);
  const ref = minDate(weekEnd, today);
  const v = versionOn(h, ref < h.createdOn ? h.createdOn : ref);
  if (!v) return null;
  const days = eachDay(weekStart, weekEnd);

  if (v.scheduleType === "weekly") {
    const done = days.filter((d) => dayStatus(h, d, today) === "done").length;
    const target = v.timesPerWeek ?? 1;
    return { label: `${done}/${target} vezes`, ratio: Math.min(1, done / target) };
  }

  const scheduled = days.filter((d) => v.weekdays.includes(weekdayOf(d)) && d >= h.createdOn && !isPaused(h, d));
  if (scheduled.length === 0) return { label: "—", ratio: null };

  if (h.direction === "build" && h.measure !== "boolean" && v.target) {
    const sum = scheduled.reduce((s, d) => s + (h.logs[d] ?? 0), 0);
    const goal = v.target * scheduled.length;
    return { label: `${formatNumber(sum)}/${formatNumber(goal)}`, ratio: Math.min(1, sum / goal) };
  }
  const done = scheduled.filter((d) => dayStatus(h, d, today) === "done").length;
  return {
    label: h.direction === "reduce" ? `${done}/${scheduled.length} no limite` : `${done}/${scheduled.length} dias`,
    ratio: done / scheduled.length,
  };
}

export function formatNumber(n: number) {
  return Number.isInteger(n) ? String(n) : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}
