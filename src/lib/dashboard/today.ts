/*
 * O que entra em cada quadro do Painel (funções puras, testadas em tests/dashboard-today.test.ts).
 * Datas como texto "AAAA-MM-DD".
 */
import { dueDateIn, billStatus, type BillLite } from "@/lib/finance/bills";
import { addDays } from "@/lib/habits/dates";
import { isOverdue, type TaskLite } from "@/lib/tasks/rules";

type BillRow = BillLite & { name: string; amountCents: number | null; payments: { month: string }[] };

/**
 * Contas sem débito automático que vencem até `days` dias à frente (inclui as atrasadas do mês),
 * olhando o mês atual e o próximo. Ordenadas por vencimento.
 */
export function billsDue<B extends BillRow>(bills: B[], today: string, days = 7) {
  const limit = addDays(today, days);
  const months = [today.slice(0, 7), addDays(`${today.slice(0, 7)}-28`, 7).slice(0, 7)];
  const out: { bill: B; date: string; overdue: boolean }[] = [];
  for (const b of bills) {
    if (b.archivedAt || b.autoDebit) continue;
    const paid = new Set(b.payments.map((p) => p.month));
    for (const m of months) {
      const date = dueDateIn(m, b.dueDay);
      if (date > limit) continue;
      const s = billStatus(b, m, paid, today);
      if (s === "overdue" && m === months[0]) out.push({ bill: b, date, overdue: true });
      if (s === "pending") out.push({ bill: b, date, overdue: false });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Tarefas que pedem atenção: atrasadas, de hoje e prazos fatais dos próximos 14 dias. */
export function taskHighlights<T extends TaskLite & { title: string }>(tasks: T[], today: string, max = 8) {
  const soon = addDays(today, 14);
  const pick = tasks.filter(
    (t) => t.status !== "done" && t.dueDate && (isOverdue(t, today) || t.dueDate === today || (t.hardDeadline && t.dueDate <= soon)),
  );
  pick.sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || Number(b.hardDeadline) - Number(a.hardDeadline));
  return { list: pick.slice(0, max), more: Math.max(0, pick.length - max) };
}

type StudyRow = { status: string; plannedTime: string | null; plannedMinutes: number | null; durationMinutes: number | null; planArchived: Date | string | null };

/** Conteúdos de estudo marcados para hoje: em ordem de horário (sem horário no fim). */
export function studyToday<S extends StudyRow>(items: S[]) {
  const list = items.filter((s) => !s.planArchived).sort((a, b) => (a.plannedTime ?? "99").localeCompare(b.plannedTime ?? "99"));
  const done = list.filter((s) => s.status === "done").length;
  const minutes = list.reduce((m, s) => m + (s.plannedMinutes ?? s.durationMinutes ?? 0), 0);
  return { list, done, minutes };
}
