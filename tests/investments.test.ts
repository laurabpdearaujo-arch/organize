import { describe, expect, it } from "vitest";
import { monthlyEvolution, quantityAt, summarize, valueAt, type InvestmentInput } from "@/lib/finance/investments";

describe("renda fixa: aportes, rendimento reinvestido e valor informado", () => {
  const cdb: InvestmentInput = {
    kind: "fixed_income",
    movements: [
      { date: "2026-01-10", type: "contribution", amountCents: 100_000, quantity: null },
      { date: "2026-03-10", type: "contribution", amountCents: 50_000, quantity: null },
      { date: "2026-06-01", type: "withdrawal", amountCents: 20_000, quantity: null },
      { date: "2026-06-30", type: "reinvestment", amountCents: 3_000, quantity: null },
    ],
    valuations: [
      { date: "2026-03-31", valueCents: 152_000, priceCents: null },
      { date: "2026-09-30", valueCents: 140_000, priceCents: null },
    ],
  };
  const s = summarize(cdb, "2026-10-22");

  it("separa seu dinheiro do rendimento reinvestido e da valorização", () => {
    expect(s.netContributedCents).toBe(130_000); // 100k + 50k − 20k
    expect(s.reinvestedCents).toBe(3_000);
    expect(s.currentValueCents).toBe(140_000); // última atualização
    expect(s.appreciationCents).toBe(140_000 - 130_000 - 3_000);
    expect(s.totalGainCents).toBe(10_000);
    expect(s.totalReturn).toBeCloseTo(10_000 / 130_000);
    expect(s.lastValuationDate).toBe("2026-09-30");
  });

  it("sem atualização de valor, não inventa ganho", () => {
    const n = summarize({ ...cdb, valuations: [] }, "2026-10-22");
    expect(n.currentValueCents).toBeNull();
    expect(n.totalGainCents).toBeNull();
  });
});

describe("ações/FIIs: cotas, preço médio e dividendos", () => {
  const fii: InvestmentInput = {
    kind: "stock",
    movements: [
      { date: "2026-01-05", type: "contribution", amountCents: 100_000, quantity: 10 }, // 10 cotas a R$ 100
      { date: "2026-02-05", type: "contribution", amountCents: 110_000, quantity: 10 }, // 10 cotas a R$ 110
      { date: "2026-03-15", type: "reinvestment", amountCents: 10_500, quantity: 1 }, // dividendo comprou 1 cota
      { date: "2026-04-15", type: "income", amountCents: 2_000, quantity: null }, // dividendo recebido em dinheiro
      { date: "2026-05-05", type: "withdrawal", amountCents: 60_000, quantity: 5 }, // vendeu 5 cotas
    ],
    valuations: [{ date: "2026-10-20", valueCents: null, priceCents: 12_000 }], // cota a R$ 120
  };
  const s = summarize(fii, "2026-10-22");

  it("quantidade e preço médio (custo médio, incluindo reinvestimento)", () => {
    expect(s.quantity).toBe(16);
    // custo antes da venda: 220.500 em 21 cotas → médio 10.500; vender 5 tira 5/21 do custo
    expect(s.averagePriceCents).toBe(10_500);
    expect(quantityAt(fii.movements, "2026-03-31")).toBe(21);
  });

  it("valor = cotas × preço informado; ganho inclui dividendo recebido em dinheiro", () => {
    expect(s.currentValueCents).toBe(16 * 12_000);
    expect(s.netContributedCents).toBe(210_000 - 60_000);
    expect(s.incomeReceivedCents).toBe(2_000);
    expect(s.totalGainCents).toBe(192_000 - 150_000 + 2_000);
  });

  it("valor numa data usa as cotas daquela data", () => {
    const withOld = { ...fii, valuations: [...fii.valuations, { date: "2026-03-31", valueCents: null, priceCents: 10_000 }] };
    expect(valueAt(withOld, "2026-04-30")).toBe(21 * 10_000);
  });
});

describe("evolução mensal da carteira", () => {
  it("valor no fim de cada mês × seu dinheiro acumulado", () => {
    const a: InvestmentInput = {
      kind: "pension",
      movements: [
        { date: "2026-01-15", type: "contribution", amountCents: 10_000, quantity: null },
        { date: "2026-02-15", type: "contribution", amountCents: 10_000, quantity: null },
      ],
      valuations: [{ date: "2026-02-28", valueCents: 20_500, priceCents: null }],
    };
    expect(monthlyEvolution([a], "2026-03", 3)).toEqual([
      { month: "2026-01", valueCents: null, netContributedCents: 10_000 },
      { month: "2026-02", valueCents: 20_500, netContributedCents: 20_000 },
      { month: "2026-03", valueCents: 20_500, netContributedCents: 20_000 },
    ]);
  });
});
