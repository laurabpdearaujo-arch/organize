
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { runAction, type ActionResult } from "@/server/action";
import * as repo from "@/lib/studies/repository";
import { addItemSchema, importOutlineSchema, itemDetailsSchema, itemUpdateSchema, logInputSchema, planUpdateSchema } from "@/lib/studies/schemas";

const id = z.uuid();
const BAD: ActionResult = { ok: false, error: "Requisição inválida." };
const NOT_FOUND: ActionResult = { ok: false, error: "Não encontrado. Recarregue a página." };
const run = (fn: () => Promise<ActionResult>) => runAction("estudos", fn);
const firstIssue = (e: z.ZodError) => ({ ok: false as const, error: e.issues[0]?.message ?? "Dados inválidos." });
function ok(): ActionResult {
  return { ok: true };
}

export type ImportSummary = { planIds: string[]; merged: { name: string; added: number; kept: number; missing: number }[] };

export async function importStudyPlans(payload: unknown): Promise<ActionResult & Partial<ImportSummary>> {
  const out: Partial<ImportSummary> = {};
  const r = await run(async () => {
    const user = await getCurrentUser();
    const v = importOutlineSchema.safeParse(payload);
    if (!v.success) return firstIssue(v.error);
    const fresh = v.data.plans.filter((p) => !p.targetPlanId);
    const planIds = fresh.length ? await repo.importPlans(user.id, v.data.fileName, fresh) : [];
    const merged: ImportSummary["merged"] = [];
    for (const p of v.data.plans.filter((x) => x.targetPlanId)) {
      const res = await repo.mergeIntoPlan(user.id, p.targetPlanId!, p.nodes);
      if (!res) return NOT_FOUND;
      merged.push({ name: p.name, ...res });
      planIds.push(p.targetPlanId!);
    }
    Object.assign(out, { planIds, merged });
    return ok();
  });
  return { ...r, ...out };
}

// ---------- registros de estudo ----------

export async function addStudyLog(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const v = logInputSchema.safeParse(payload);
    if (!v.success) return firstIssue(v.error);
    const { itemId, ...rest } = v.data;
    return (await repo.addLog(user.id, itemId, { ...rest, difficulties: rest.difficulties || null, mistakes: rest.mistakes || null })) ? ok() : NOT_FOUND;
  });
}

export async function deleteStudyLog(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const v = z.object({ id }).safeParse(payload);
    if (!v.success) return BAD;
    return (await repo.deleteLog(user.id, v.data.id)) ? ok() : NOT_FOUND;
  });
}

// ---------- edição da estrutura ----------

export async function updateStudyItemDetails(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const v = itemDetailsSchema.safeParse(payload);
    if (!v.success) return firstIssue(v.error);
    const { id: itemId, code, title, description, notes, durationMinutes } = v.data;
    return (await repo.updateItemDetails(user.id, itemId, { code: code || null, title, description: description || null, notes: notes || null, durationMinutes }))
      ? ok()
      : NOT_FOUND;
  });
}

export async function addStudyItem(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const v = addItemSchema.safeParse(payload);
    if (!v.success) return firstIssue(v.error);
    const done = await repo.addItem(user.id, v.data.planId, v.data.parentId, {
      code: v.data.code || null,
      title: v.data.title,
      // tema novo é sempre grupo
      isGroup: v.data.parentId === null || v.data.isGroup,
      durationMinutes: v.data.durationMinutes,
    });
    return done ? ok() : NOT_FOUND;
  });
}

export async function moveStudyItem(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const v = z.object({ id, direction: z.enum(["up", "down"]) }).safeParse(payload);
    if (!v.success) return BAD;
    return (await repo.moveItem(user.id, v.data.id, v.data.direction)) ? ok() : NOT_FOUND;
  });
}

export async function deleteStudyItem(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const v = z.object({ id }).safeParse(payload);
    if (!v.success) return BAD;
    return (await repo.deleteItem(user.id, v.data.id)) ? ok() : NOT_FOUND;
  });
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
