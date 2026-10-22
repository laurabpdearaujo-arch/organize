/**
 * Investimentos no banco real (usuárias temporárias, apagadas no final).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { summarize } from "@/lib/finance/investments";
import { createTempUser, deleteTempUser } from "./helpers";

let a = "";
let b = "";
let repo: typeof import("@/lib/finance/investments-repository");
let dbModule: typeof import("@/db");

const base = { subtype: null, ticker: null, institution: null, currency: "BRL" as const, color: "blue" };

beforeAll(async () => {
  repo = await import("@/lib/finance/investments-repository");
  dbModule = await import("@/db");
  a = await createTempUser();
  b = await createTempUser();
}, 30_000);

afterAll(async () => {
  await deleteTempUser(a);
  await deleteTempUser(b);
  await dbModule?.db.$client.end();
}, 30_000);

describe("investimentos no banco", () => {
  it("FII: compra, reinvestimento, venda, preço da cota e regras de cotas", async () => {
    await repo.createInvestment(a, { ...base, name: "MXRF11", kind: "stock", ticker: "MXRF11" });
    const id = (await repo.listInvestments(a)).find((x) => x.name === "MXRF11")!.id;

    expect(await repo.addMovement(a, id, { date: "2026-01-05", type: "contribution", amountCents: 100_000, quantity: 10, notes: null })).toBe("ok");
    expect(await repo.addMovement(a, id, { date: "2026-02-05", type: "contribution", amountCents: 50_000, quantity: null, notes: null })).toBe("quantity_required");
    expect(await repo.addMovement(a, id, { date: "2026-03-15", type: "reinvestment", amountCents: 10_000, quantity: 1, notes: null })).toBe("ok");
    expect(await repo.addMovement(a, id, { date: "2026-04-15", type: "income", amountCents: 500, quantity: null, notes: "dividendo" })).toBe("ok");
    expect(await repo.addMovement(a, id, { date: "2026-05-05", type: "withdrawal", amountCents: 999_999, quantity: 12, notes: null })).toBe("quantity_exceeds");
    expect(await repo.addMovement(a, id, { date: "2026-05-05", type: "withdrawal", amountCents: 30_000, quantity: 3, notes: null })).toBe("ok");

    expect(await repo.setValuation(a, id, "2026-10-20", 11_000)).toBe(true);
    expect(await repo.setValuation(a, id, "2026-10-20", 12_000)).toBe(true); // mesmo dia: substitui

    const inv = (await repo.listInvestments(a)).find((x) => x.id === id)!;
    expect(inv.valuations).toHaveLength(1);
    const s = summarize(inv, "2026-10-22");
    expect(s.quantity).toBe(8);
    expect(s.currentValueCents).toBe(8 * 12_000);
    expect(s.netContributedCents).toBe(100_000 - 30_000);
    expect(s.reinvestedCents).toBe(10_000);
    expect(s.incomeReceivedCents).toBe(500);

    // com movimentações, não dá para trocar "por cotas" ↔ "por valor"
    expect(await repo.updateInvestment(a, id, { ...base, name: "MXRF11", kind: "fixed_income" })).toBe("kind_locked");
    expect(await repo.updateInvestment(a, id, { ...base, name: "MXRF11 (FII)", kind: "stock", ticker: "MXRF11" })).toBe("ok");
  }, 60_000);

  it("outra usuária não vê nem altera", async () => {
    await repo.createInvestment(a, { ...base, name: "CDB", kind: "fixed_income" });
    const id = (await repo.listInvestments(a)).find((x) => x.name === "CDB")!.id;
    expect(await repo.listInvestments(b)).toEqual([]);
    expect(await repo.addMovement(b, id, { date: "2026-01-01", type: "contribution", amountCents: 1, quantity: null, notes: null })).toBe("not_found");
    expect(await repo.setValuation(b, id, "2026-01-01", 1)).toBe(false);
    expect(await repo.updateInvestment(b, id, { ...base, name: "x", kind: "fixed_income" })).toBe("not_found");
    expect(await repo.deleteInvestment(b, id)).toBe(false);
  }, 60_000);
});
