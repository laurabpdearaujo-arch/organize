"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action";
import * as repo from "@/lib/studies/repository";
import { importOutlineSchema, itemUpdateSchema, planUpdateSchema } from "@/lib/studies/schemas";

const id = z.uuid();
const BAD: ActionResult = { ok: false, error: "Requisição inválida." };
const NOT_FOUND: ActionResult = { ok: false, error: "Não encontrado. Recarregue a página." };
const run = (fn: () => Promise<ActionResult>) => runAction("estudos", fn);
const firstIssue = (e: z.ZodError) => ({ ok: false as const, error: e.issues[0]?.message ?? "Dados inválidos." });
function ok(): ActionResult {
  refresh();
  return { ok: true };
}

export async function importStudyPlans(payload: unknown): Promise<ActionResult & { planIds?: string[] }> {
  const out: { planIds?: string[] } = {};
  const r = await run(async () => {
    const user = await getCurrentUser();
    const v = importOutlineSchema.safeParse(payload);
    if (!v.success) return firstIssue(v.error);
    out.planIds = await repo.importPlans(user.id, v.data.fileName, v.data.plans);
    return ok();
  });
  return { ...r, ...out };
}

export async function updateStudyItem(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const v = itemUpdateSchema.safeParse(payload);
    if (!v.success) return firstIssue(v.error);
    const { id: itemId, ...patch } = v.data;
    // sem data, horário e duração planejados não fazem sentido
    if (patch.plannedDate === null) Object.assign(patch, { plannedTime: null, plannedMinutes: null });
    return (await repo.updateItem(user.id, itemId, patch)) ? ok() : NOT_FOUND;
  });
}

export async function setStudyStatusMany(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const v = z.object({ ids: z.array(id).min(1).max(3000), status: z.enum(["not_started", "in_progress", "partial", "done"]) }).safeParse(payload);
    if (!v.success) return BAD;
    await repo.setStatusMany(user.id, v.data.ids, v.data.status);
    return ok();
  });
}

export async function updateStudyPlan(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const v = planUpdateSchema.safeParse(payload);
    if (!v.success) return firstIssue(v.error);
    return (await repo.updatePlan(user.id, v.data.id, { name: v.data.name, objective: v.data.objective || null, color: v.data.color })) ? ok() : NOT_FOUND;
  });
}

export async function archiveStudyPlan(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const v = z.object({ id, archived: z.boolean() }).safeParse(payload);
    if (!v.success) return BAD;
    return (await repo.setPlanArchived(user.id, v.data.id, v.data.archived)) ? ok() : NOT_FOUND;
  });
}

export async function deleteStudyPlan(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const v = z.object({ id }).safeParse(payload);
    if (!v.success) return BAD;
    return (await repo.deletePlan(user.id, v.data.id)) ? ok() : NOT_FOUND;
  });
}
