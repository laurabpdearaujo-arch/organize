import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney } from "@/lib/finance/money";
import {
  accountBalance,
  addMonths,
  monthlySeries,
  monthTotals,
  pctChange,
  totalsByCategory,
  type AccountLite,
  type TxLite,
} from "@/lib/finance/summary";

describe("valores digitados", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234.56", 123456],
    ["50", 5000],
    ["0,5", 50],
    ["R$ 10,00", 1000],
    ["1.234", 123400], // ponto como milhar
    ["1.234.567,89", 123456789],
  ])("%s → %i centavos", (s, cents) => expect(parseMoney(s)).toBe(cents));

  it.each(["", "abc", "1,2,3", "-10", "10,999"])("rejeita %j", (s) => expect(parseMoney(s)).toBeNull());

  it("formata em reais, dólares e euros", () => {
    expect(formatMoney(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
    expect(formatMoney(5000, "USD")).toContain("50,00");
    expect(formatMoney(5000, "EUR")).toContain("€");
    expect(formatMoney(5000, "GBP")).toContain("£");
    expect(parseMoney("£ 12,50")).toBe(1250);
  });
});

const corrente: AccountLite = { id: "cc", type: "checking", currency: "BRL", initialBalanceCents: 100_000 };
const cartao: AccountLite = { id: "card", type: "credit_card", currency: "BRL", initialBalanceCents: 0 };
const dolar: AccountLite = { id: "usd", type: "checking", currency: "USD", initialBalanceCents: 0 };
const accounts = new Map([corrente, cartao, dolar].map((a) => [a.id, a]));

let n = 0;
const tx = (t: Partial<TxLite> & Pick<TxLite, "type" | "amountCents" | "date">): TxLite => ({
  id: `t${n++}`,
  accountId: "cc",
  toAccountId: null,
  categoryId: null,
  ...t,
});

describe("sem dupla contagem: compra no cartão + pagamento da fatura", () => {
  const txs = [
    tx({ type: "income", amountCents: 500_000, date: "2026-10-05", categoryId: "salario" }),
    tx({ type: "expense", accountId: "card", amountCents: 30_000, date: "2026-10-10", categoryId: "mercado" }),
    tx({ type: "expense", accountId: "card", amountCents: 20_000, date: "2026-10-12", categoryId: "lazer" }),
    // fatura paga em novembro: transferência da corrente para o cartão
    tx({ type: "transfer", accountId: "cc", toAccountId: "card", amountCents: 50_000, date: "2026-11-05" }),
  ];

  it("a despesa conta no mês da compra, uma única vez", () => {
    expect(monthTotals(txs, accounts, "2026-10", "BRL")).toEqual({ income: 500_000, expense: 50_000, result: 450_000 });
    expect(monthTotals(txs, accounts, "2026-11", "BRL")).toEqual({ income: 0, expense: 0, result: 0 });
  });

  it("saldos: cartão fica devendo até a fatura ser paga; corrente cai só no pagamento", () => {
    expect(accountBalance(cartao, txs, "2026-10-31")).toBe(-50_000);
    expect(accountBalance(corrente, txs, "2026-10-31")).toBe(600_000);
    expect(accountBalance(cartao, txs)).toBe(0);
    expect(accountBalance(corrente, txs)).toBe(550_000);
  });

  it("gastos por categoria ignoram transferências", () => {
    expect(totalsByCategory(txs, accounts, "2026-10", "BRL", "expense")).toEqual([
      { categoryId: "mercado", total: 30_000 },
      { categoryId: "lazer", total: 20_000 },
    ]);
  });
});

describe("moedas e períodos", () => {
  it("valores em dólar não se misturam com reais", () => {
    const txs = [
      tx({ type: "expense", amountCents: 1_000, date: "2026-10-01" }),
      tx({ type: "expense", accountId: "usd", amountCents: 9_999, date: "2026-10-01" }),
    ];
    expect(monthTotals(txs, accounts, "2026-10", "BRL").expense).toBe(1_000);
    expect(monthTotals(txs, accounts, "2026-10", "USD").expense).toBe(9_999);
  });

  it("série de 3 meses e virada de ano", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    const txs = [tx({ type: "income", amountCents: 100, date: "2025-12-31" }), tx({ type: "expense", amountCents: 40, date: "2026-02-01" })];
    expect(monthlySeries(txs, accounts, "2026-02", 3, "BRL").map((m) => [m.month, m.income, m.expense])).toEqual([
      ["2025-12", 100, 0],
      ["2026-01", 0, 0],
      ["2026-02", 0, 40],
    ]);
  });

  it("variação percentual", () => {
    expect(pctChange(110, 100)).toBeCloseTo(0.1);
    expect(pctChange(50, 0)).toBeNull();
  });
});
