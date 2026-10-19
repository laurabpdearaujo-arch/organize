/** Datas de calendário como texto "AAAA-MM-DD" (sem hora/fuso). Comparar com <, > funciona. */

const DAY_MS = 86_400_000;

function toMs(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}
function fromMs(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: string, n: number) {
  return fromMs(toMs(d) + n * DAY_MS);
}
/** 0 = domingo … 6 = sábado */
export function weekdayOf(d: string) {
  return new Date(toMs(d)).getUTCDay();
}
/** Domingo da semana da data. */
export function weekStartOf(d: string) {
  return addDays(d, -weekdayOf(d));
}
export function daysBetween(a: string, b: string) {
  return Math.round((toMs(b) - toMs(a)) / DAY_MS);
}
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
export function minDate(a: string, b: string) {
  return a < b ? a : b;
}
export function maxDate(a: string, b: string) {
  return a > b ? a : b;
}
