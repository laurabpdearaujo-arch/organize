"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  createSeries,
  deleteSeries,
  getSeries,
  updateSeries,
  upsertException,
} from "@/lib/calendar/repository";
import { eventInputSchema, inputToSeriesValues, timingChanged } from "@/lib/calendar/schemas";
import { parseLocalDate, zonedInstant } from "@/lib/calendar/recurrence";
import type { ActionResult } from "@/lib/calendar/dto";

const NOT_FOUND: ActionResult = { ok: false, error: "Evento não encontrado. Recarregue a página." };

async function run(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e); // redirect() (sessão expirada) precisa continuar subindo
    console.error("[calendario]", e);
    return { ok: false, error: "Não foi possível salvar. Tente novamente." };
  }
}

const saveSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("create"), input: z.unknown() }),
  z.object({ mode: z.literal("series"), eventId: z.uuid(), input: z.unknown() }),
  z.object({ mode: z.literal("single"), eventId: z.uuid(), originalStart: z.iso.datetime(), input: z.unknown() }),
]);

/** create: novo evento · series: altera o evento/série inteira · single: altera só uma ocorrência. */
export async function saveEvent(payload: unknown): Promise<ActionResult> {
  return run(async () => {
    const user = await getCurrentUser();
    const req = saveSchema.safeParse(payload);
    if (!req.success) return { ok: false, error: "Requisição inválida." };
    const input = eventInputSchema.safeParse(req.data.input);
    if (!input.success) return { ok: false, error: input.error.issues[0]?.message ?? "Dados inválidos." };

    const values = inputToSeriesValues(input.data, user.timezone);

    if (req.data.mode === "create") {
      await createSeries(user.id, values);
      return { ok: true };
    }

    if (req.data.mode === "series") {
      const existing = await getSeries(user.id, req.data.eventId);
      if (!existing) return NOT_FOUND;
      const reset = timingChanged({ ...existing, recurrence: existing.recurrence ?? null }, values);
      const ok = await updateSeries(user.id, req.data.eventId, values, reset);
      return ok ? { ok: true } : NOT_FOUND;
    }

    const ok = await upsertException(user.id, req.data.eventId, new Date(req.data.originalStart), {
      cancelled: false,
      title: values.title,
      // "" = apagado só nesta ocorrência (null significaria "herdar da série")
      description: values.description ?? "",
      location: values.location ?? "",
      color: values.color,
      allDay: values.allDay,
      startsAt: values.startsAt,
      endsAt: values.endsAt,
    });
    return ok ? { ok: true } : NOT_FOUND;
  });
}

const deleteSchema = z.object({
  eventId: z.uuid(),
  scope: z.enum(["single", "series"]),
  originalStart: z.iso.datetime().optional(),
});

export async function deleteEvent(payload: unknown): Promise<ActionResult> {
  return run(async () => {
    const user = await getCurrentUser();
    const req = deleteSchema.safeParse(payload);
    if (!req.success) return { ok: false, error: "Requisição inválida." };
    const { eventId, scope, originalStart } = req.data;

    const existing = await getSeries(user.id, eventId);
    if (!existing) return NOT_FOUND;

    if (scope === "single" && existing.recurrence) {
      if (!originalStart) return { ok: false, error: "Requisição inválida." };
      await upsertException(user.id, eventId, new Date(originalStart), { cancelled: true });
      return { ok: true };
    }
    return (await deleteSeries(user.id, eventId)) ? { ok: true } : NOT_FOUND;
  });
}

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const moveSchema = z.discriminatedUnion("allDay", [
  z.object({ eventId: z.uuid(), originalStart: z.iso.datetime(), allDay: z.literal(true), start: dateOnly, end: dateOnly }),
  z.object({ eventId: z.uuid(), originalStart: z.iso.datetime(), allDay: z.literal(false), start: z.iso.datetime(), end: z.iso.datetime() }),
]);

/** Arrastar/redimensionar no calendário. Em série recorrente, afeta só a ocorrência arrastada. */
export async function moveEvent(payload: unknown): Promise<ActionResult> {
  return run(async () => {
    const user = await getCurrentUser();
    const req = moveSchema.safeParse(payload);
    if (!req.success) return { ok: false, error: "Requisição inválida." };
    const m = req.data;

    const startsAt = m.allDay ? zonedInstant(parseLocalDate(m.start), 0, 0, user.timezone) : new Date(m.start);
    const endsAt = m.allDay ? zonedInstant(parseLocalDate(m.end), 0, 0, user.timezone) : new Date(m.end);
    if (endsAt <= startsAt) return { ok: false, error: "O fim precisa ser depois do início." };

    const existing = await getSeries(user.id, m.eventId);
    if (!existing) return NOT_FOUND;

    if (existing.recurrence) {
      await upsertException(user.id, m.eventId, new Date(m.originalStart), { allDay: m.allDay, startsAt, endsAt });
      return { ok: true };
    }

    const ok = await updateSeries(
      user.id,
      m.eventId,
      {
        title: existing.title,
        description: existing.description,
        location: existing.location,
        color: existing.color,
        timezone: existing.timezone,
        recurrence: null,
        allDay: m.allDay,
        startsAt,
        endsAt,
      },
      false,
    );
    return ok ? { ok: true } : NOT_FOUND;
  });
}
