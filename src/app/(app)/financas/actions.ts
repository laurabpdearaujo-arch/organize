"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/action";
import * as repo from "@/lib/finance/repository";
import { parseMoney } from "@/lib/finance/money";
import {
  accountInputSchema,
  categoryInputSchema,
  contributionInputSchema,
  goalInputSchema,
  txInputSchema,
} from "@/lib/finance/schemas";

const id = z.uuid();
const BAD: ActionResult = { ok: false, error: "Requisição inválida." };
const NOT_FOUND: ActionResult = { ok: false, error: "Item não encontrado. Recarregue a página." };
const run = (fn: () => Promise<ActionResult>) => runAction("financas", fn);

function ok(): ActionResult {
  refresh();
  return { ok: true };
}
const firstIssue = (e: z.ZodError) => ({ ok: false as const, error: e.issues[0]?.message ?? "Dados inválidos." });

// ---------- contas ----------

export async function saveAccount(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z.object({ id: id.nullable(), input: z.unknown() }).safeParse(payload);
    if (!req.success) return BAD;
    const v = accountInputSchema.safeParse(req.data.input);
    if (!v.success) return firstIssue(v.error);
    const { initialBalance, ...rest } = v.data;
    const values = {
      ...rest,
      initialBalanceCents: initialBalance,
      closingDay: rest.type === "credit_card" ? rest.closingDay : null,
      dueDay: rest.type === "credit_card" ? rest.dueDay : null,
    };
    if (!req.data.id) {
      await repo.createAccount(user.id, values);
      return ok();
    }
    const r = await repo.updateAccount(user.id, req.data.id, values);
    if (r === "currency_locked") return { ok: false, error: "Não dá para mudar a moeda de uma conta que já tem lançamentos." };
    return r === "ok" ? ok() : NOT_FOUND;
  });
}

export async function adjustAccountBalance(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z.object({ id, balance: z.string() }).safeParse(payload);
    if (!req.success) return BAD;
    const t = req.data.balance.trim();
    const neg = t.startsWith("-");
    const cents = parseMoney(neg ? t.slice(1) : t);
    if (cents === null) return { ok: false, error: "Informe um saldo válido (ex.: 150,00 ou -20,00)." };
    return (await repo.adjustBalance(user.id, req.data.id, neg ? -cents : cents)) ? ok() : NOT_FOUND;
  });
}

export async function archiveAccount(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z.object({ id, archived: z.boolean() }).safeParse(payload);
    if (!req.success) return BAD;
    return (await repo.setAccountArchived(user.id, req.data.id, req.data.archived)) ? ok() : NOT_FOUND;
  });
}

export async function deleteAccount(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z.object({ id }).safeParse(payload);
    if (!req.success) return BAD;
    const r = await repo.deleteAccount(user.id, req.data.id);
    if (r === "has_transactions") return { ok: false, error: "Esta conta tem lançamentos. Arquive-a para guardar o histórico." };
    return r === "ok" ? ok() : NOT_FOUND;
  });
}

// ---------- categorias ----------

export async function saveCategory(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z.object({ id: id.nullable(), input: categoryInputSchema }).safeParse(payload);
    if (!req.success) return firstIssue(req.error);
    const { name, kind, color } = req.data.input;
    if (!req.data.id) {
      const created = await repo.createCategory(user.id, { name, kind, color });
      return created ? ok() : { ok: false, error: "Já existe uma categoria com esse nome." };
    }
    return (await repo.updateCategory(user.id, req.data.id, { name, color })) ? ok() : NOT_FOUND;
  });
}

export async function archiveCategory(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z.object({ id, archived: z.boolean() }).safeParse(payload);
    if (!req.success) return BAD;
    return (await repo.setCategoryArchived(user.id, req.data.id, req.data.archived)) ? ok() : NOT_FOUND;
  });
}

// ---------- lançamentos ----------

const TX_ERRORS: Record<string, string> = {
  account_not_found: "Conta não encontrada.",
  category_invalid: "Categoria inválida para esse tipo de lançamento.",
  currency_mismatch: "Transferências só entre contas da mesma moeda.",
  not_found: "Lançamento não encontrado. Recarregue a página.",
};

export async function saveTransaction(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z.object({ id: id.nullable(), input: z.unknown() }).safeParse(payload);
    if (!req.success) return BAD;
    const v = txInputSchema.safeParse(req.data.input);
    if (!v.success) return firstIssue(v.error);
    const r = req.data.id ? await repo.updateTx(user.id, req.data.id, v.data) : await repo.createTx(user.id, v.data);
    return r === "ok" ? ok() : { ok: false, error: TX_ERRORS[r] ?? "Erro." };
  });
}

export async function deleteTransaction(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z.object({ id }).safeParse(payload);
    if (!req.success) return BAD;
    return (await repo.deleteTx(user.id, req.data.id)) ? ok() : NOT_FOUND;
  });
}

// ---------- metas ----------

export async function saveGoal(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z.object({ id: id.nullable(), input: z.unknown() }).safeParse(payload);
    if (!req.success) return BAD;
    const v = goalInputSchema.safeParse(req.data.input);
    if (!v.success) return firstIssue(v.error);
    const values = { name: v.data.name, targetCents: v.data.target, currency: v.data.currency, deadline: v.data.deadline, color: v.data.color };
    if (!req.data.id) {
      await repo.createGoal(user.id, values);
      return ok();
    }
    return (await repo.updateGoal(user.id, req.data.id, values)) ? ok() : NOT_FOUND;
  });
}

export async function archiveGoal(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z.object({ id, archived: z.boolean() }).safeParse(payload);
    if (!req.success) return BAD;
    return (await repo.setGoalArchived(user.id, req.data.id, req.data.archived)) ? ok() : NOT_FOUND;
  });
}

export async function deleteGoal(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z.object({ id }).safeParse(payload);
    if (!req.success) return BAD;
    return (await repo.deleteGoal(user.id, req.data.id)) ? ok() : NOT_FOUND;
  });
}

export async function addContribution(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const v = contributionInputSchema.safeParse(payload);
    if (!v.success) return firstIssue(v.error);
    const cents = v.data.direction === "in" ? v.data.amount : -v.data.amount;
    return (await repo.addContribution(user.id, v.data.goalId, cents, v.data.date, v.data.note || null)) ? ok() : NOT_FOUND;
  });
}

export async function deleteContribution(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z.object({ id }).safeParse(payload);
    if (!req.success) return BAD;
    return (await repo.deleteContribution(user.id, req.data.id)) ? ok() : NOT_FOUND;
  });
}
