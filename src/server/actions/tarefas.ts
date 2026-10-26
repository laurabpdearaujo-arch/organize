
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { runAction, type ActionResult } from "@/server/action";
import { localDate } from "@/lib/calendar/dto";
import * as repo from "@/lib/tasks/repository";
import { feedbackInputSchema, moveTaskSchema, projectInputSchema, taskInputSchema } from "@/lib/tasks/schemas";

const id = z.uuid();
const BAD: ActionResult = { ok: false, error: "Requisição inválida." };
const NOT_FOUND: ActionResult = { ok: false, error: "Não encontrado. Recarregue a página." };
const run = (fn: () => Promise<ActionResult>) => runAction("tarefas", fn);
const firstIssue = (e: z.ZodError) => ({ ok: false as const, error: e.issues[0]?.message ?? "Dados inválidos." });
const withId = z.object({ id, data: z.unknown() });
function ok(): ActionResult {
  return { ok: true };
}

async function userAndToday() {
  const user = await getCurrentUser();
  return { user, today: localDate(new Date(), user.timezone) };
}

// ---------- tarefas ----------

export async function createTask(payload: unknown) {
  return run(async () => {
    const { user, today } = await userAndToday();
    const v = taskInputSchema.safeParse(payload);
    if (!v.success) return firstIssue(v.error);
    return (await repo.createTask(user.id, v.data, today)) ? ok() : NOT_FOUND;
  });
}

export async function updateTask(payload: unknown) {
  return run(async () => {
    const { user, today } = await userAndToday();
    const p = withId.safeParse(payload);
    if (!p.success) return BAD;
    const v = taskInputSchema.safeParse(p.data.data);
    if (!v.success) return firstIssue(v.error);
    return (await repo.updateTask(user.id, p.data.id, v.data, today)) ? ok() : NOT_FOUND;
  });
}

export async function moveTask(payload: unknown) {
  return run(async () => {
    const { user, today } = await userAndToday();
    const v = moveTaskSchema.safeParse(payload);
    if (!v.success) return BAD;
    return (await repo.moveTask(user.id, v.data.id, v.data.status, v.data.index, today)) ? ok() : NOT_FOUND;
  });
}

export async function deleteTask(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const v = id.safeParse(payload);
    if (!v.success) return BAD;
    return (await repo.deleteTask(user.id, v.data)) ? ok() : NOT_FOUND;
  });
}

// ---------- projetos ----------

export async function createProject(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const v = projectInputSchema.safeParse(payload);
    if (!v.success) return firstIssue(v.error);
    await repo.createProject(user.id, v.data);
    return ok();
  });
}

export async function updateProject(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const p = withId.safeParse(payload);
    if (!p.success) return BAD;
    const v = projectInputSchema.extend({ archived: z.boolean().optional() }).safeParse(p.data.data);
    if (!v.success) return firstIssue(v.error);
    return (await repo.updateProject(user.id, p.data.id, v.data)) ? ok() : NOT_FOUND;
  });
}

export async function deleteProject(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const v = id.safeParse(payload);
    if (!v.success) return BAD;
    return (await repo.deleteProject(user.id, v.data)) ? ok() : NOT_FOUND;
  });
}

// ---------- feedbacks ----------

export async function createFeedback(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const v = feedbackInputSchema.safeParse(payload);
    if (!v.success) return firstIssue(v.error);
    await repo.createFeedback(user.id, v.data);
    return ok();
  });
}

export async function updateFeedback(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const p = withId.safeParse(payload);
    if (!p.success) return BAD;
    const v = feedbackInputSchema.safeParse(p.data.data);
    if (!v.success) return firstIssue(v.error);
    return (await repo.updateFeedback(user.id, p.data.id, v.data)) ? ok() : NOT_FOUND;
  });
}

export async function deleteFeedback(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const v = id.safeParse(payload);
    if (!v.success) return BAD;
    return (await repo.deleteFeedback(user.id, v.data)) ? ok() : NOT_FOUND;
  });
}
