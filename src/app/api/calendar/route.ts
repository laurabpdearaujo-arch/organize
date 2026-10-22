import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { listOccurrences } from "@/lib/calendar/repository";
import { colorHex } from "@/lib/calendar/colors";
import { localDate, type BillReminderDTO, type CalendarEventDTO } from "@/lib/calendar/dto";
import { billsForCalendar } from "@/lib/finance/bills-repository";
import { reminderDates } from "@/lib/finance/bills";
import { formatMoney } from "@/lib/finance/money";

const querySchema = z
  .object({ start: z.coerce.date(), end: z.coerce.date() })
  .refine((q) => q.end > q.start, "Intervalo inválido.")
  .refine((q) => q.end.getTime() - q.start.getTime() <= 400 * 86_400_000, "Intervalo grande demais.");

/** Ocorrências do calendário da usuária logada entre ?start e ?end. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
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

  return NextResponse.json([...body, ...reminders], { headers: { "Cache-Control": "no-store" } });
}
