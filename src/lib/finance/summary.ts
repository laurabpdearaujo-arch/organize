import type { AccountType, TxType } from "./constants";
import type { Currency } from "./money";

/*
 * Cálculos financeiros (funções puras, testadas em tests/finance.test.ts).
 * Regra central: transferências movem dinheiro entre contas e NUNCA entram em receitas/despesas.
 * Assim, compra no cartão (despesa) + pagamento da fatura (transferência) não contam em dobro.
 */

export type AccountLite = { id: string; type: AccountType; currency: Currency; initialBalanceCents: number };
export type TxLite = {
  id: string;
  type: TxType;
  accountId: string;
  toAccountId: string | null;
  amountCents: number;
  date: string;
  categoryId: string | null;
};

/** Saldo da conta: saldo inicial + receitas − despesas − transferências enviadas + recebidas. Cartão fica negativo (dívida). */
export function accountBalance(account: AccountLite, txs: TxLite[], upTo?: string) {
  let b = account.initialBalanceCents;
  for (const t of txs) {
    if (upTo && t.date > upTo) continue;
    if (t.accountId === account.id) b += t.type === "income" ? t.amountCents : -t.amountCents;
    else if (t.type === "transfer" && t.toAccountId === account.id) b += t.amountCents;
  }
  return b;
}

export const monthOf = (date: string) => date.slice(0, 7);

export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

function currencyOf(accounts: Map<string, AccountLite>, t: TxLite) {
  return accounts.get(t.accountId)?.currency;
}

/** Receitas, despesas e resultado de um mês, numa moeda. */
export function monthTotals(txs: TxLite[], accounts: Map<string, AccountLite>, month: string, currency: Currency) {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (t.type === "transfer" || monthOf(t.date) !== month || currencyOf(accounts, t) !== currency) continue;
    if (t.type === "income") income += t.amountCents;
    else expense += t.amountCents;
  }
  return { income, expense, result: income - expense };
}

/** Total por categoria no mês (maior primeiro). Sem categoria = null. */
export function totalsByCategory(
  txs: TxLite[],
  accounts: Map<string, AccountLite>,
  month: string,
  currency: Currency,
  kind: "expense" | "income",
) {
  const map = new Map<string | null, number>();
  for (const t of txs) {
    if (t.type !== kind || monthOf(t.date) !== month || currencyOf(accounts, t) !== currency) continue;
    map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amountCents);
  }
  return [...map.entries()].map(([categoryId, total]) => ({ categoryId, total })).sort((a, b) => b.total - a.total);
}

/** Receitas e despesas dos últimos `n` meses terminando em `endMonth`. */
export function monthlySeries(txs: TxLite[], accounts: Map<string, AccountLite>, endMonth: string, n: number, currency: Currency) {
  return Array.from({ length: n }, (_, i) => {
    const month = addMonths(endMonth, i - (n - 1));
    return { month, ...monthTotals(txs, accounts, month, currency) };
  });
}

/** Variação percentual (null quando não há base de comparação). */
export function pctChange(current: number, previous: number) {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

/** Moedas que aparecem nas contas (BRL sempre primeiro). */
export function currenciesInUse(accounts: AccountLite[]): Currency[] {
  const set = new Set<Currency>(accounts.map((a) => a.currency));
  return (["BRL", "USD", "EUR", "GBP"] as Currency[]).filter((c) => set.has(c) || c === "BRL");
}
