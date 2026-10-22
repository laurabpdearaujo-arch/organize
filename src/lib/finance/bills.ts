/*
 * Contas a pagar (registro mensal; não gera lançamentos). Funções puras, testadas em tests/bills.test.ts.
 */

export type BillLite = { id: string; dueDay: number; autoDebit: boolean; archivedAt: Date | string | null; createdAt: Date | string };

export type BillStatus =
  | "paid" // marcada como paga no mês
  | "auto_upcoming" // débito automático, ainda não chegou o dia
  | "auto_done" // débito automático, o dia já passou (considera-se debitada)
  | "pending" // vence hoje ou mais adiante
  | "overdue"; // venceu e não foi marcada como paga

function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Data de vencimento no mês "AAAA-MM". Dia 31 em mês de 30 dias (ou fevereiro) vira o último dia. */
export function dueDateIn(month: string, dueDay: number) {
  const d = Math.min(dueDay, daysInMonth(month));
  return `${month}-${String(d).padStart(2, "0")}`;
}

export function billStatus(bill: BillLite, month: string, paidMonths: Set<string>, today: string): BillStatus {
  if (paidMonths.has(month)) return "paid";
  const due = dueDateIn(month, bill.dueDay);
  if (bill.autoDebit) return due < today ? "auto_done" : "auto_upcoming";
  return due < today ? "overdue" : "pending";
}

/** Vencimentos de contas SEM débito automático entre [start, end] (datas "AAAA-MM-DD"), para o calendário. */
export function reminderDates(bills: BillLite[], start: string, end: string) {
  const out: { billId: string; date: string; month: string }[] = [];
  const months: string[] = [];
  for (let m = start.slice(0, 7); m <= end.slice(0, 7); ) {
    months.push(m);
    const [y, mm] = m.split("-").map(Number);
    m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
  }
  for (const b of bills) {
    if (b.autoDebit || b.archivedAt) continue;
    for (const month of months) {
      const date = dueDateIn(month, b.dueDay);
      if (date >= start && date <= end) out.push({ billId: b.id, date, month });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
