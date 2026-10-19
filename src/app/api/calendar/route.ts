import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { listOccurrences } from "@/lib/calendar/repository";
import { colorHex } from "@/lib/calendar/colors";
import { localDate, type CalendarEventDTO } from "@/lib/calendar/dto";

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

  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
