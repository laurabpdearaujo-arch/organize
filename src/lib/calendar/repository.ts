import "server-only";
import { and, eq, gt, inArray, isNotNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { eventExceptions, events } from "@/db/schema";
import { expandSeries, type Occurrence, type Series } from "./recurrence";
import type { SeriesValues } from "./schemas";

/*
 * Acesso a dados do calendário. TODAS as funções recebem o userId e filtram por ele.
 * Nunca exportar para o navegador nem receber userId vindo do cliente:
 * quem chama (Server Actions / Route Handlers) obtém o id via getCurrentUser().
 */

export type OccurrenceWithSeries = Occurrence & { series: Series };

export async function listOccurrences(userId: string, rangeStart: Date, rangeEnd: Date): Promise<OccurrenceWithSeries[]> {
  const rows = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        lt(events.startsAt, rangeEnd),
        or(isNotNull(events.recurrence), gt(events.endsAt, rangeStart)),
      ),
    );
  if (rows.length === 0) return [];

  const exceptions = await db
    .select()
    .from(eventExceptions)
    .where(and(eq(eventExceptions.userId, userId), inArray(eventExceptions.eventId, rows.map((r) => r.id))));

  const out: OccurrenceWithSeries[] = [];
  for (const row of rows) {
    const series: Series = { ...row, recurrence: row.recurrence ?? null };
    const own = exceptions.filter((e) => e.eventId === row.id);
    for (const occ of expandSeries(series, own, rangeStart, rangeEnd)) out.push({ ...occ, series });
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export async function getSeries(userId: string, eventId: string) {
  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.userId, userId)));
  return row ?? null;
}

export async function createSeries(userId: string, values: SeriesValues) {
  const [row] = await db
    .insert(events)
    .values({ ...values, userId })
    .returning({ id: events.id });
  return row.id;
}

/** Atualiza a série. Se `resetExceptions`, descarta alterações individuais (o horário/regra mudou). */
export async function updateSeries(userId: string, eventId: string, values: SeriesValues, resetExceptions: boolean) {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(events)
      .set(values)
      .where(and(eq(events.id, eventId), eq(events.userId, userId)))
      .returning({ id: events.id });
    if (updated.length === 0) return false;
    if (resetExceptions) {
      await tx
        .delete(eventExceptions)
        .where(and(eq(eventExceptions.eventId, eventId), eq(eventExceptions.userId, userId)));
    }
    return true;
  });
}

export async function deleteSeries(userId: string, eventId: string) {
  const deleted = await db
    .delete(events)
    .where(and(eq(events.id, eventId), eq(events.userId, userId)))
    .returning({ id: events.id });
  return deleted.length > 0;
}

export type ExceptionPatch = {
  cancelled?: boolean;
  title?: string;
  description?: string | null;
  location?: string | null;
  color?: string;
  allDay?: boolean;
  startsAt?: Date;
  endsAt?: Date;
};

/** Cria ou atualiza a alteração de UMA ocorrência de uma série recorrente desta usuária. */
export async function upsertException(userId: string, eventId: string, originalStart: Date, patch: ExceptionPatch) {
  const series = await getSeries(userId, eventId);
  if (!series || !series.recurrence) return false;

  await db
    .insert(eventExceptions)
    .values({ userId, eventId, originalStart, cancelled: false, ...patch })
    .onConflictDoUpdate({
      target: [eventExceptions.eventId, eventExceptions.originalStart],
      set: { ...patch, updatedAt: new Date() },
    });
  return true;
}
