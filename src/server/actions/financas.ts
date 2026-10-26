
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { runAction, type ActionResult } from "@/server/action";
import * as repo from "@/lib/finance/repository";
import { parseMoney } from "@/lib/finance/money";
import * as importRepo from "@/lib/finance/import/repository";
import * as billsRepo from "@/lib/finance/bills-repository";
import * as invRepo from "@/lib/finance/investments-repository";
import {
  accountInputSchema,
  billInputSchema,
  categoryInputSchema,
  contributionInputSchema,
  goalInputSchema,
  investmentInputSchema,
  movementInputSchema,
  txInputSchema,
  valuationInputSchema,
} from "@/lib/finance/schemas";

const id = z.uuid();
const BAD: ActionResult = { ok: false, error: "Requisição inválida." };
const NOT_FOUND: ActionResult = { ok: false, error: "Item não encontrado. Recarregue a página." };
const run = (fn: () => Promise<ActionResult>) => runAction("financas", fn);

function ok(): ActionResult {
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

// ---------- importação de extratos ----------

const commitSchema = z.object({
  accountId: id,
  fileName: z.string().max(300),
  fileHash: z.string().regex(/^[0-9a-f]{64}$/),
  period: z.object({ start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).nullable(),
  rows: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        originalDescription: z.string().min(1).max(500),
        description: z.string().trim().max(200),
        amountCents: z.number().int().refine((n) => n !== 0),
        occurrence: z.number().int().min(0).max(1000),
        type: z.enum(["income", "expense", "transfer"]),
        categoryId: id.nullable(),
        toAccountId: id.nullable(),
        remember: z.boolean(),
      }),
    )
    .min(1, "Selecione pelo menos um lançamento.")
    .max(1000),
});

const COMMIT_ERRORS: Record<string, string> = {
  account_not_found: "Conta não encontrada.",
  category_invalid: "Alguma categoria não combina com o tipo do lançamento.",
  transfer_invalid: "Toda transferência precisa de uma conta de destino diferente, na mesma moeda.",
  sign_mismatch: "Entradas só podem ser receitas e saídas só podem ser despesas (ou transferências).",
};

export async function commitImport(payload: unknown): Promise<ActionResult & { imported?: number; skipped?: number }> {
  const out: { imported?: number; skipped?: number } = {};
  const r = await run(async () => {
    const user = await getCurrentUser();
    const v = commitSchema.safeParse(payload);
    if (!v.success) return firstIssue(v.error);
    const res = await importRepo.commitImport(user.id, v.data);
    if ("error" in res) return { ok: false, error: COMMIT_ERRORS[res.error] ?? "Erro." };
    Object.assign(out, res);
    return ok();
  });
  return { ...r, ...out };
}

export async function undoImport(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z.object({ id }).safeParse(payload);
    if (!req.success) return BAD;
    return (await importRepo.undoImport(user.id, req.data.id)) ? ok() : NOT_FOUND;
  });
}

// ---------- contas a pagar ----------

export async function saveBill(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z.object({ id: id.nullable(), input: z.unknown() }).safeParse(payload);
    if (!req.success) return BAD;
    const v = billInputSchema.safeParse(req.data.input);
    if (!v.success) return firstIssue(v.error);
    const values = { name: v.data.name, amountCents: v.data.amount, dueDay: v.data.dueDay, autoDebit: v.data.autoDebit, accountId: v.data.accountId, notes: v.data.notes || null };
    const done = req.data.id ? await billsRepo.updateBill(user.id, req.data.id, values) : await billsRepo.createBill(user.id, values);
    return done ? ok() : NOT_FOUND;
  });
}

export async function archiveBill(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z.object({ id, archived: z.boolean() }).safeParse(payload);
    if (!req.success) return BAD;
    return (await billsRepo.setBillArchived(user.id, req.data.id, req.data.archived)) ? ok() : NOT_FOUND;
  });
}

export async function deleteBill(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z.object({ id }).safeParse(payload);
    if (!req.success) return BAD;
    return (await billsRepo.deleteBill(user.id, req.data.id)) ? ok() : NOT_FOUND;
  });
}

export async function setBillPaid(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z
      .object({ id, month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() })
      .safeParse(payload);
    if (!req.success) return BAD;
    return (await billsRepo.setBillPaid(user.id, req.data.id, req.data.month, req.data.paidOn)) ? ok() : NOT_FOUND;
  });
}

// ---------- investimentos ----------

export async function saveInvestment(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z.object({ id: id.nullable(), input: z.unknown() }).safeParse(payload);
    if (!req.success) return BAD;
    const v = investmentInputSchema.safeParse(req.data.input);
    if (!v.success) return firstIssue(v.error);
    const values = {
      ...v.data,
      subtype: v.data.subtype || null,
      ticker: v.data.kind === "stock" ? v.data.ticker || null : null,
      institution: v.data.institution || null,
    };
    if (!req.data.id) {
      await invRepo.createInvestment(user.id, values);
      return ok();
    }
    const r = await invRepo.updateInvestment(user.id, req.data.id, values);
    if (r === "kind_locked") return { ok: false, error: "Não dá para trocar entre “por cotas” e “por valor” depois de haver movimentações." };
    return r === "ok" ? ok() : NOT_FOUND;
  });
}

export async function archiveInvestment(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z.object({ id, archived: z.boolean() }).safeParse(payload);
    if (!req.success) return BAD;
    return (await invRepo.setInvestmentArchived(user.id, req.data.id, req.data.archived)) ? ok() : NOT_FOUND;
  });
}

export async function deleteInvestment(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z.object({ id }).safeParse(payload);
    if (!req.success) return BAD;
    return (await invRepo.deleteInvestment(user.id, req.data.id)) ? ok() : NOT_FOUND;
  });
}

const MOVEMENT_ERRORS: Record<string, string> = {
  not_found: "Investimento não encontrado. Recarregue a página.",
  quantity_required: "Informe a quantidade de cotas.",
  quantity_exceeds: "Você está vendendo mais cotas do que tem.",
};

export async function addInvestmentMovement(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const v = movementInputSchema.safeParse(payload);
    if (!v.success) return firstIssue(v.error);
    const r = await invRepo.addMovement(user.id, v.data.investmentId, {
      date: v.data.date,
      type: v.data.type,
      amountCents: v.data.amount,
      quantity: v.data.quantity,
      notes: v.data.notes || null,
    });
    return r === "ok" ? ok() : { ok: false, error: MOVEMENT_ERRORS[r] ?? "Erro." };
  });
}

export async function deleteInvestmentMovement(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z.object({ id }).safeParse(payload);
    if (!req.success) return BAD;
    return (await invRepo.deleteMovement(user.id, req.data.id)) ? ok() : NOT_FOUND;
  });
}

export async function setInvestmentValue(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const v = valuationInputSchema.safeParse(payload);
    if (!v.success) return firstIssue(v.error);
    return (await invRepo.setValuation(user.id, v.data.investmentId, v.data.date, v.data.amount)) ? ok() : NOT_FOUND;
  });
}

export async function deleteInvestmentValue(payload: unknown) {
  return run(async () => {
    const user = await getCurrentUser();
    const req = z.object({ id }).safeParse(payload);
    if (!req.success) return BAD;
    return (await invRepo.deleteValuation(user.id, req.data.id)) ? ok() : NOT_FOUND;
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
