import { formatNumber, type GoalVersion, type HabitData } from "./stats";

export const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const WEEKDAY_LETTER = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function measureLabel(m: HabitData["measure"]) {
  return m === "boolean" ? "Sim/não" : m === "quantity" ? "Quantidade" : "Duração (min)";
}

export function scheduleLabel(v: GoalVersion) {
  if (v.scheduleType === "weekly") return `${v.timesPerWeek}x por semana`;
  if (v.weekdays.length === 7) return "todo dia";
  if (v.weekdays.join() === "1,2,3,4,5") return "dias úteis";
  return v.weekdays.map((d) => WEEKDAY_SHORT[d]).join(", ");
}

export function goalLabel(h: Pick<HabitData, "direction" | "measure" | "unit">, v: GoalVersion) {
  const sched = scheduleLabel(v);
  if (h.measure === "boolean") return sched;
  const amount = `${formatNumber(v.target ?? 0)} ${h.unit ?? ""}`.trim();
  return `${h.direction === "reduce" ? "até" : "meta"} ${amount} · ${sched}`;
}

/** "14 out" */
export function shortDate(d: string) {
  const [, m, day] = d.split("-").map(Number);
  return `${day} ${MONTHS[m - 1]}`;
}

/** "14/10/2026" */
export function fullDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export function monthShort(d: string) {
  return MONTHS[Number(d.slice(5, 7)) - 1];
}

export function percent(r: number | null) {
  return r === null ? "—" : `${Math.round(r * 100)}%`;
}
