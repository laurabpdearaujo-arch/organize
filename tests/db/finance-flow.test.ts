/**
 * Finanças no banco real, com usuárias temporárias (apagadas no final).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { txInputSchema } from "@/lib/finance/schemas";
import { monthTotals } from "@/lib/finance/summary";
import { createTempUser, deleteTempUser } from "./helpers";

let a = "";
let b = "";
let repo: typeof import("@/lib/finance/repository");
let dbModule: typeof import("@/db");

const acc = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  type: "checking" as const,
  currency: "BRL" as const,
  initialBalanceCents: 0,
  color: "violet",
  closingDay: null,
  dueDay: null,
  ...over,
});
const tx = (over: Record<string, unknown>) =>
  txInputSchema.parse({ toAccountId: null, categoryId: null, paymentMethod: "other", notes: "", date: "2026-10-10", description: "x", ...over });

beforeAll(async () => {
  repo = await import("@/lib/finance/repository");
  dbModule = await import("@/db");
  a = await createTempUser();
  b = await createTempUser();
}, 30_000);

afterAll(async () => {
  // apagar a usuária precisa funcionar mesmo com contas que têm lançamentos
  await deleteTempUser(a);
  await deleteTempUser(b);
  await dbModule?.db.$client.end();
}, 30_000);

describe("finanças no banco", () => {
  it("compra no cartão + pagamento da fatura: saldos certos e despesa contada uma vez", async () => {
    const cc = await repo.createAccount(a, acc("Corrente", { initialBalanceCents: 100_000 }));
    const card = await repo.createAccount(a, acc("Cartão", { type: "credit_card", closingDay: 3, dueDay: 10 }));
    let data = await repo.loadFinance(a, "2026-10");
    expect(data.categories.length).toBeGreaterThan(10); // categorias padrão criadas
    const mercado = data.categories.find((c) => c.name === "Mercado" && c.kind === "expense")!;
    const salario = data.categories.find((c) => c.name === "Salário")!;

    expect(await repo.createTx(a, tx({ type: "income", accountId: cc, amount: "5.000,00", categoryId: salario.id }))).toBe("ok");
    expect(await repo.createTx(a, tx({ type: "expense", accountId: card, amount: "300,00", categoryId: mercado.id }))).toBe("ok");
    expect(await repo.createTx(a, tx({ type: "transfer", accountId: cc, toAccountId: card, amount: "300,00", date: "2026-11-10" }))).toBe("ok");

    // categoria de receita num lançamento de despesa: recusado
    expect(await repo.createTx(a, tx({ type: "expense", accountId: cc, amount: "1", categoryId: salario.id }))).toBe("category_invalid");

    data = await repo.loadFinance(a, "2026-11");
    const bal = Object.fromEntries(data.accounts.map((x) => [x.name, x.balanceCents]));
    expect(bal).toEqual({ "Carteira (dinheiro)": 0, Corrente: 100_000 + 500_000 - 30_000, Cartão: 0 });

    const accMap = new Map(data.accounts.map((x) => [x.id, x]));
    expect(monthTotals(data.transactions, accMap, "2026-10", "BRL")).toEqual({ income: 500_000, expense: 30_000, result: 470_000 });
    expect(monthTotals(data.transactions, accMap, "2026-11", "BRL")).toEqual({ income: 0, expense: 0, result: 0 });

    // não apaga conta com lançamentos (protege o histórico)
    expect(await repo.deleteAccount(a, card)).toBe("has_transactions");
  }, 60_000);

  it("transferência só entre contas da mesma moeda", async () => {
    const brl = await repo.createAccount(a, acc("Reais"));
    const usd = await repo.createAccount(a, acc("Dólares", { currency: "USD" }));
    expect(await repo.createTx(a, tx({ type: "transfer", accountId: brl, toAccountId: usd, amount: "10" }))).toBe("currency_mismatch");
  }, 60_000);

  it("outra usuária não vê nem usa as contas, lançamentos e metas", async () => {
    const cc = await repo.createAccount(a, acc("Só da A"));
    await repo.createTx(a, tx({ type: "expense", accountId: cc, amount: "50" }));
    await repo.createGoal(a, { name: "Viagem", targetCents: 1_000_000, currency: "BRL", deadline: null, color: "teal" });
    const dataA = await repo.loadFinance(a, "2026-10");
    const goalId = dataA.goals[0].id;
    const txId = dataA.transactions.find((t) => t.accountId === cc)!.id;

    const dataB = await repo.loadFinance(b, "2026-10");
    expect(dataB.accounts.map((x) => x.name)).toEqual(["Carteira (dinheiro)"]); // só a carteira dela, criada automaticamente
    expect(dataB.transactions).toEqual([]);
    expect(dataB.goals).toEqual([]);

    expect(await repo.createTx(b, tx({ type: "expense", accountId: cc, amount: "1" }))).toBe("account_not_found");
    expect(await repo.updateTx(b, txId, tx({ type: "expense", accountId: cc, amount: "1" }))).toBe("account_not_found");
    expect(await repo.deleteTx(b, txId)).toBe(false);
    expect(await repo.addContribution(b, goalId, 100, "2026-10-10", null)).toBe(false);
    expect(await repo.deleteGoal(b, goalId)).toBe(false);
    expect(await repo.setAccountArchived(b, cc, true)).toBe(false);

    // categoria de B não pode ser usada em lançamento de A, e vice-versa
    const catA = dataA.categories[0];
    const ccB = await repo.createAccount(b, acc("Da B"));
    expect(await repo.createTx(b, tx({ type: catA.kind, accountId: ccB, amount: "1", categoryId: catA.id }))).toBe("category_invalid");
  }, 60_000);

  it("várias aberturas ao mesmo tempo criam UMA carteira e um conjunto de categorias; apagada, não volta", async () => {
    const c = await createTempUser();
    try {
      await Promise.all(Array.from({ length: 10 }, () => repo.loadFinance(c, "2026-10")));
      let data = await repo.loadFinance(c, "2026-10");
      expect(data.accounts.filter((x) => x.type === "cash")).toHaveLength(1);
      const names = data.categories.map((x) => `${x.kind}:${x.name}`);
      expect(new Set(names).size).toBe(names.length);

      expect(await repo.deleteAccount(c, data.accounts[0].id)).toBe("ok");
      await repo.loadFinance(c, "2026-10");
      data = await repo.loadFinance(c, "2026-10");
      expect(data.accounts).toHaveLength(0);
    } finally {
      await deleteTempUser(c);
    }
  }, 60_000);

  it("dinheiro vivo: carteira única, gasto em espécie e ajuste de saldo sem lançamento falso", async () => {
    await repo.loadFinance(a, "2026-10"); // de novo: não pode criar uma segunda carteira
    let data = await repo.loadFinance(a, "2026-10");
    const carteiras = data.accounts.filter((x) => x.type === "cash");
    expect(carteiras).toHaveLength(1);
    const cart = carteiras[0];

    await repo.createTx(a, tx({ type: "expense", accountId: cart.id, amount: "25,00", paymentMethod: "cash" }));
    data = await repo.loadFinance(a, "2026-10");
    expect(data.accounts.find((x) => x.id === cart.id)!.balanceCents).toBe(-2_500); // gastou dinheiro que não estava registrado

    const txCountBefore = data.transactions.length;
    expect(await repo.adjustBalance(a, cart.id, 10_000)).toBe(true); // "tenho R$ 100 em casa"
    data = await repo.loadFinance(a, "2026-10");
    expect(data.accounts.find((x) => x.id === cart.id)!.balanceCents).toBe(10_000);
    expect(data.transactions.length).toBe(txCountBefore); // nenhum lançamento criado
    expect(await repo.adjustBalance(b, cart.id, 0)).toBe(false);
  }, 60_000);

  it("metas: aportes e retiradas somam no progresso", async () => {
    await repo.createGoal(a, { name: "Reserva", targetCents: 600_000, currency: "BRL", deadline: "2027-06-30", color: "green" });
    const g = (await repo.loadFinance(a, "2026-10")).goals.find((x) => x.name === "Reserva")!;
    await repo.addContribution(a, g.id, 100_000, "2026-10-01", null);
    await repo.addContribution(a, g.id, 50_000, "2026-10-15", "bônus");
    await repo.addContribution(a, g.id, -20_000, "2026-10-20", "emergência");
    const after = (await repo.loadFinance(a, "2026-10")).goals.find((x) => x.name === "Reserva")!;
    expect(after.savedCents).toBe(130_000);
    expect(after.contributions).toHaveLength(3);
  }, 60_000);
});
