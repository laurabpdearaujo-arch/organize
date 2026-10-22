"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action";
import { localDate } from "@/lib/calendar/dto";
import * as repo from "@/lib/reading/repository";
import { bookInputSchema, mediaInputSchema, setPageSchema } from "@/lib/reading/schemas";

const id = z.uuid();
const BAD: ActionResult = { ok: false, error: "Requisição inválida." };
const NOT_FOUND: ActionResult = { ok: false, error: "Não encontrado. Recarregue a página." };
const run = (fn: () => Promise<ActionResult>) => runAction("leituras", fn);
const firstIssue = (e: z.ZodError) => ({ ok: false as const, error: e.issues[0]?.message ?? "Dados inválidos." });
function ok(): ActionResult {
  refresh();
  return { ok: true };
}

async function userAndToday() {
  const user = await getCurrentUser();
  return { user, today: localDate(new Date(), user.timezone) };
}

// ---------- livros ----------

export async function createBook(payload: unknown) {
  return run(async () => {
    const { user, today } = await userAndToday();
    const v = bookInputSchema.safeParse(payload);
    if (!v.success) return firstIssue(v.error);
    await repo.createBook(user.id, v.data, today);
    return ok();
  });
}

export async function updateBook(payload: unknown) {
  return run(async () => {
    const { user, today } = await userAndToday();
    const p = z.object({ id, data: z.unknown() }).safeParse(payload);
    if (!p.success) return BAD;
    const v = bookInputSchema.safeParse(p.data.data);
    if (!v.success) return firstIssue(v.error);
    return (await repo.updateBook(user.id, p.data.id, v.data, today)) ? ok() : NOT_FOUND;
  });
}

export async function setBookPage(payload: unknown): Promise<ActionResult & { finished?: boolean }> {
  let finished = false;
  const r = await run(async () => {
    const user = await getCurrentUser();
    const v = setPageSchema.safeParse(payload);
    if (!v.success) return firstIssue(v.error);
    const res = await repo.setPage(user.id, v.data.id, v.data.page, v.data.date);
    if (res === null) return NOT_FOUND;
    if (res === "too_far") return { ok: false, error: "Essa página passa do total do livro." };
    finished = res === "finished";
    return ok();
  });
  return { ...r, finished };
}

export async function deleteBook(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const v = id.safeParse(payload);
    if (!v.success) return BAD;
    return (await repo.deleteBook(user.id, v.data)) ? ok() : NOT_FOUND;
  });
}

// ---------- filmes e séries ----------

export async function createMedia(payload: unknown) {
  return run(async () => {
    const { user, today } = await userAndToday();
    const v = mediaInputSchema.safeParse(payload);
    if (!v.success) return firstIssue(v.error);
    await repo.createMedia(user.id, v.data, today);
    return ok();
  });
}

export async function updateMedia(payload: unknown) {
  return run(async () => {
    const { user, today } = await userAndToday();
    const p = z.object({ id, data: z.unknown() }).safeParse(payload);
    if (!p.success) return BAD;
    const v = mediaInputSchema.safeParse(p.data.data);
    if (!v.success) return firstIssue(v.error);
    return (await repo.updateMedia(user.id, p.data.id, v.data, today)) ? ok() : NOT_FOUND;
  });
}

export async function deleteMedia(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const v = id.safeParse(payload);
    if (!v.success) return BAD;
    return (await repo.deleteMedia(user.id, v.data)) ? ok() : NOT_FOUND;
  });
}
