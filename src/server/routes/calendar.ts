import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { listOccurrences } from "@/lib/calendar/repository";
import { colorHex } from "@/lib/calendar/colors";
import { localDate, type BillReminderDTO, type CalendarEventDTO, type StudyItemDTO, type TaskDueDTO } from "@/lib/calendar/dto";
import { tasksForCalendar } from "@/lib/tasks/repository";
import { parseLocalDate, zonedInstant } from "@/lib/calendar/recurrence";
import { plannedItems } from "@/lib/studies/repository";
import { billsForCalendar } from "@/lib/finance/bills-repository";
import { reminderDates } from "@/lib/finance/bills";
import { formatMoney } from "@/lib/finance/money";

const querySchema = z
  .object({ start: z.coerce.date(), end: z.coerce.date() })
  .refine((q) => q.end > q.start, "Intervalo inválido.")
  .refine((q) => q.end.getTime() - q.start.getTime() <= 400 * 86_400_000, "Intervalo grande demais.");

/** Ocorrências do calendário da usuária logada entre ?start e ?end. */
export const calendarRoutes = new Hono().get("/", async (c) => {
  const user = await getCurrentUser();
  const parsed = querySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message }, 400);
  }

  const tz = user.timezone;
  const occurrences = await listOccurrences(user.id, parsed.data.start, parsed.data.end);

  const body: CalendarEventDTO[] = occurrences.map((o) => {
    const hex = colorHex(o.color);
    return {
      id: o.key,
      title: o.title,
      start: o.allDay ? localDate(o.start, tz) : o.start.toISOString(),
      end: o.allDay ? localDate(o.end, tz) : o.end.toISOString(),
      allDay: o.allDay,
      backgroundColor: hex,
      borderColor: hex,
      extendedProps: {
        eventId: o.eventId,
        originalStart: o.originalStart.toISOString(),
        recurring: o.recurring,
        modified: o.modified,
        description: o.description,
        location: o.location,
        color: o.color,
        series: {
          title: o.series.title,
          description: o.series.description,
          location: o.series.location,
          color: o.series.color,
          allDay: o.series.allDay,
          startsAt: o.series.startsAt.toISOString(),
          endsAt: o.series.endsAt.toISOString(),
          recurrence: o.series.recurrence,
        },
      },
    };
  });

  // Contas a pagar sem débito automático: lembrete no dia do vencimento
  const first = localDate(parsed.data.start, tz);
  const last = localDate(new Date(parsed.data.end.getTime() - 1), tz);
  const billRows = await billsForCalendar(user.id);
  const byId = new Map(billRows.map((b) => [b.id, b]));
  const reminders: BillReminderDTO[] = reminderDates(billRows, first, last).map((r) => {
    const b = byId.get(r.billId)!;
    const paid = b.paidMonths.has(r.month);
    const amount = b.amountCents ? ` · ${formatMoney(b.amountCents)}` : "";
    const next = new Date(Date.parse(`${r.date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const color = paid ? "#7a7a88" : "#d68512";
    return {
      id: `bill-${b.id}-${r.date}`,
      title: `${paid ? "✓ " : ""}Vence: ${b.name}${amount}`,
      start: r.date,
      end: next,
      allDay: true,
      backgroundColor: color,
      borderColor: color,
      editable: false,
      extendedProps: { kind: "bill", billId: b.id, paid },
    };
  });

  // Conteúdos de estudo com data marcada
  const study: StudyItemDTO[] = (await plannedItems(user.id, first, last))
    .filter((s) => !s.planArchived)
    .map((s) => {
      const done = s.status === "done";
      const color = done ? "#7a7a88" : colorHex(s.planColor);
      const title = `${done ? "✓ " : ""}Estudo: ${s.code && /^\d/.test(s.code) ? `${s.code} ` : ""}${s.title} (${s.planName})`;
      const base = { id: `study-${s.id}`, title, backgroundColor: color, borderColor: color, editable: false as const, extendedProps: { kind: "study" as const, itemId: s.id, planId: s.planId, done } };
      if (!s.plannedTime) {
        const next = new Date(Date.parse(`${s.plannedDate}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
        return { ...base, start: s.plannedDate!, end: next, allDay: true };
      }
      const [hh, mm] = s.plannedTime.split(":").map(Number);
      const start = zonedInstant(parseLocalDate(s.plannedDate!), hh, mm, tz);
      const minutes = s.plannedMinutes ?? s.durationMinutes ?? 60;
      return { ...base, start: start.toISOString(), end: new Date(start.getTime() + minutes * 60_000).toISOString(), allDay: false };
    });

  // Tarefas com prazo (prazo fatal em vermelho)
  const due: TaskDueDTO[] = (await tasksForCalendar(user.id, first, last)).map((t) => {
    const done = t.status === "done";
    const color = done ? "#7a7a88" : t.hardDeadline ? "#d33a3a" : "#b5577d";
    const next = new Date(Date.parse(`${t.dueDate}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    return {
      id: `task-${t.id}`,
      title: `${done ? "✓ " : ""}${t.hardDeadline ? "Prazo fatal" : "Prazo"}: ${t.title}`,
      start: t.dueDate!,
      end: next,
      allDay: true,
      backgroundColor: color,
      borderColor: color,
      editable: false,
      extendedProps: { kind: "task", taskId: t.id, area: t.area, done, hard: t.hardDeadline },
    };
  });

  c.header("Cache-Control", "no-store");
  return c.json([...body, ...reminders, ...study, ...due]);
});
