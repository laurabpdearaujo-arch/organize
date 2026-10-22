/*
 * Investimentos (cálculos puros, testados em tests/investments.test.ts).
 *
 * Movimentações:
 *  - contribution (aporte): dinheiro NOVO que entrou no investimento
 *  - withdrawal (resgate/venda): dinheiro que saiu
 *  - reinvestment (rendimento reinvestido): rendimento que voltou para o investimento (não é dinheiro novo)
 *  - income (rendimento recebido): rendimento pago em dinheiro, fora do investimento
 * Ações/FIIs/ETFs também têm quantidade de cotas em cada compra/venda/reinvestimento.
 * O valor atual vem da última atualização feita pela pessoa (valor; ou preço da cota × quantidade).
 */

export type InvestmentKind = "fixed_income" | "stock" | "pension";
export type MovementType = "contribution" | "withdrawal" | "reinvestment" | "income";

export type Movement = { date: string; type: MovementType; amountCents: number; quantity: number | null };
/** Atualização de valor. Para ações: priceCents (preço da cota); senão valueCents. */
export type Valuation = { date: string; valueCents: number | null; priceCents: number | null };

export type InvestmentInput = { kind: InvestmentKind; movements: Movement[]; valuations: Valuation[] };

export type InvestmentSummary = {
  /** Seu dinheiro: aportes − resgates. */
  netContributedCents: number;
  contributedCents: number;
  withdrawnCents: number;
  reinvestedCents: number;
  incomeReceivedCents: number;
  /** Ações: cotas atuais e preço médio (custo, incluindo reinvestimentos). */
  quantity: number | null;
  averagePriceCents: number | null;
  /** Valor atual (última atualização); null se nunca foi atualizado. */
  currentValueCents: number | null;
  lastValuationDate: string | null;
  /** Valorização = valor atual − seu dinheiro − reinvestido. */
  appreciationCents: number | null;
  /** Ganho total = valor atual − seu dinheiro + rendimentos recebidos em dinheiro. */
  totalGainCents: number | null;
  /** Ganho total ÷ seu dinheiro (null se não houver base). */
  totalReturn: number | null;
};

const byDate = <T extends { date: string }>(a: T, b: T) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** Cotas na data (inclusive). */
export function quantityAt(movements: Movement[], date: string) {
  let q = 0;
  for (const m of movements) {
    if (m.date > date || m.quantity === null) continue;
    if (m.type === "contribution" || m.type === "reinvestment") q += m.quantity;
    else if (m.type === "withdrawal") q -= m.quantity;
  }
  return Math.round(q * 1e6) / 1e6;
}

/** Valor do investimento numa data, pela última atualização até ela (null se não houver). */
export function valueAt(inv: InvestmentInput, date: string): number | null {
  const v = [...inv.valuations].filter((x) => x.date <= date).sort(byDate).at(-1);
  if (!v) return null;
  if (inv.kind === "stock" && v.priceCents !== null) return Math.round(quantityAt(inv.movements, date) * v.priceCents);
  return v.valueCents;
}

export function summarize(inv: InvestmentInput, today: string): InvestmentSummary {
  let contributed = 0;
  let withdrawn = 0;
  let reinvested = 0;
  let income = 0;
  // preço médio (custo médio): compras e reinvestimentos somam custo; vendas tiram custo proporcional
  let qty = 0;
  let cost = 0;
  for (const m of [...inv.movements].sort(byDate)) {
    if (m.type === "contribution") contributed += m.amountCents;
    if (m.type === "withdrawal") withdrawn += m.amountCents;
    if (m.type === "reinvestment") reinvested += m.amountCents;
    if (m.type === "income") income += m.amountCents;
    if (inv.kind === "stock" && m.quantity !== null) {
      if (m.type === "contribution" || m.type === "reinvestment") {
        qty += m.quantity;
        cost += m.amountCents;
      } else if (m.type === "withdrawal" && qty > 0) {
        cost -= cost * (Math.min(m.quantity, qty) / qty);
        qty -= m.quantity;
      }
    }
  }
  const net = contributed - withdrawn;
  const current = valueAt(inv, today);
  const last = [...inv.valuations].filter((x) => x.date <= today).sort(byDate).at(-1)?.date ?? null;
  const stockQty = inv.kind === "stock" ? Math.round(qty * 1e6) / 1e6 : null;
  return {
    netContributedCents: net,
    contributedCents: contributed,
    withdrawnCents: withdrawn,
    reinvestedCents: reinvested,
    incomeReceivedCents: income,
    quantity: stockQty,
    averagePriceCents: stockQty && stockQty > 0 ? Math.round(cost / stockQty) : null,
    currentValueCents: current,
    lastValuationDate: last,
    appreciationCents: current === null ? null : current - net - reinvested,
    totalGainCents: current === null ? null : current - net + income,
    totalReturn: current === null || net <= 0 ? null : (current - net + income) / net,
  };
}

/** Evolução mensal: valor no fim de cada mês × seu dinheiro acumulado (aportes − resgates). */
export function monthlyEvolution(invs: InvestmentInput[], endMonth: string, months: number) {
  const out: { month: string; valueCents: number | null; netContributedCents: number }[] = [];
  const [ey, em] = endMonth.split("-").map(Number);
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ey, em - 1 - i, 1));
    const month = d.toISOString().slice(0, 7);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    let value: number | null = null;
    let net = 0;
    for (const inv of invs) {
      const v = valueAt(inv, last);
      if (v !== null) value = (value ?? 0) + v;
      for (const m of inv.movements) {
        if (m.date > last) continue;
        if (m.type === "contribution") net += m.amountCents;
        if (m.type === "withdrawal") net -= m.amountCents;
      }
    }
    out.push({ month, valueCents: value, netContributedCents: net });
  }
  return out;
}
