import { z } from "zod";
import { EVENT_COLOR_KEYS } from "@/lib/calendar/colors";
import { parseMoney } from "./money";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const currency = z.enum(["BRL", "USD", "EUR", "GBP"]);

/** Valor digitado ("1.234,56") → centavos > 0 */
const positiveMoney = z.string().transform((s, ctx) => {
  const v = parseMoney(s);
  if (v === null || v <= 0) {
    ctx.addIssue({ code: "custom", message: "Informe um valor válido maior que zero." });
    return z.NEVER;
  }
  return v;
});

/** Valor que pode ser negativo (ex.: saldo inicial de cartão com dívida). */
const signedMoney = z.string().transform((s, ctx) => {
  const t = s.trim();
  if (t === "") return 0;
  const neg = t.startsWith("-");
  const v = parseMoney(neg ? t.slice(1) : t);
  if (v === null) {
    ctx.addIssue({ code: "custom", message: "Saldo inicial inválido." });
    return z.NEVER;
  }
  return neg ? -v : v;
});

export const accountInputSchema = z
  .object({
    name: z.string().trim().min(1, "Dê um nome à conta.").max(60),
    type: z.enum(["checking", "savings", "cash", "investment", "credit_card"]),
    currency,
    initialBalance: signedMoney,
    color: z.enum(EVENT_COLOR_KEYS),
    closingDay: z.number().int().min(1).max(31).nullable(),
    dueDay: z.number().int().min(1).max(31).nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.type === "credit_card" && (!v.closingDay || !v.dueDay)) {
      ctx.addIssue({ code: "custom", message: "Informe o dia de fechamento e de vencimento do cartão.", path: ["closingDay"] });
    }
  });

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome à categoria.").max(40),
  kind: z.enum(["expense", "income"]),
  color: z.enum(EVENT_COLOR_KEYS),
});

export const txInputSchema = z
  .object({
    type: z.enum(["income", "expense", "transfer"]),
    accountId: z.uuid("Escolha a conta."),
    toAccountId: z.uuid().nullable(),
    amount: positiveMoney,
    date: dateStr,
    description: z.string().trim().min(1, "Descreva o lançamento.").max(200),
    categoryId: z.uuid().nullable(),
    paymentMethod: z.enum(["pix", "debit", "credit", "cash", "boleto", "transfer", "auto_debit", "other"]),
    notes: z.string().trim().max(1000).default(""),
  })
  .superRefine((v, ctx) => {
    if (v.type === "transfer") {
      if (!v.toAccountId) ctx.addIssue({ code: "custom", message: "Escolha a conta de destino.", path: ["toAccountId"] });
      else if (v.toAccountId === v.accountId) ctx.addIssue({ code: "custom", message: "Origem e destino precisam ser contas diferentes.", path: ["toAccountId"] });
    }
  });
export type TxInput = z.infer<typeof txInputSchema>;

export const goalInputSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome à meta.").max(60),
  target: positiveMoney,
  currency,
  deadline: dateStr.nullable(),
  color: z.enum(EVENT_COLOR_KEYS),
});

export const billInputSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome à conta.").max(80),
  /** Valor de referência, opcional ("" = sem valor fixo). */
  amount: z.string().transform((s, ctx) => {
    if (s.trim() === "") return null;
    const v = parseMoney(s);
    if (v === null || v <= 0) {
      ctx.addIssue({ code: "custom", message: "Valor inválido (deixe em branco se varia)." });
      return z.NEVER;
    }
    return v;
  }),
  dueDay: z.number().int().min(1, "Dia entre 1 e 31.").max(31, "Dia entre 1 e 31."),
  autoDebit: z.boolean(),
  accountId: z.uuid().nullable(),
  notes: z.string().trim().max(500).default(""),
});

export const investmentInputSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome ao investimento.").max(80),
  kind: z.enum(["fixed_income", "stock", "pension"]),
  subtype: z.string().trim().max(40).default(""),
  ticker: z.string().trim().toUpperCase().max(20).default(""),
  institution: z.string().trim().max(60).default(""),
  currency,
  color: z.enum(EVENT_COLOR_KEYS),
});

/** Quantidade de cotas: aceita "10", "10,5", "0,0001". */
const quantityStr = z.string().transform((s, ctx) => {
  // com vírgula: vírgula é decimal e pontos são milhar ("1.000,5"); sem vírgula: ponto é decimal ("10.5")
  const raw = s.trim();
  const t = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || !/^\d+(\.\d{1,6})?$/.test(t)) {
    ctx.addIssue({ code: "custom", message: "Quantidade inválida." });
    return z.NEVER;
  }
  return n;
});

export const movementInputSchema = z.object({
  investmentId: z.uuid(),
  type: z.enum(["contribution", "withdrawal", "reinvestment", "income"]),
  date: dateStr,
  amount: positiveMoney,
  quantity: quantityStr,
  notes: z.string().trim().max(300).default(""),
});

export const valuationInputSchema = z.object({
  investmentId: z.uuid(),
  date: dateStr,
  /** Valor total (renda fixa/previdência) ou preço da cota (ações). */
  amount: positiveMoney,
});

export const contributionInputSchema = z.object({
  goalId: z.uuid(),
  amount: positiveMoney,
  /** "in" = aporte, "out" = retirada */
  direction: z.enum(["in", "out"]),
  date: dateStr,
  note: z.string().trim().max(200).default(""),
});
