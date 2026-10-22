/**
 * Contas a pagar no banco real (usuárias temporárias, apagadas no final).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reminderDates } from "@/lib/finance/bills";
import { createTempUser, deleteTempUser } from "./helpers";

let a = "";
let b = "";
let repo: typeof import("@/lib/finance/bills-repository");
let dbModule: typeof import("@/db");

const values = (over: Record<string, unknown> = {}) => ({ name: "Luz", amountCents: 15_000, dueDay: 10, autoDebit: false, accountId: null, notes: null, ...over });

beforeAll(async () => {
  repo = await import("@/lib/finance/bills-repository");
  dbModule = await import("@/db");
  a = await createTempUser();
  b = await createTempUser();
}, 30_000);

afterAll(async () => {
  await deleteTempUser(a);
  await deleteTempUser(b);
  await dbModule?.db.$client.end();
}, 30_000);

describe("contas a pagar", () => {
  it("cadastra, marca paga no mês, desmarca; só sem débito automático vai ao calendário", async () => {
    expect(await repo.createBill(a, values())).toBe(true);
    expect(await repo.createBill(a, values({ name: "Internet", dueDay: 5, autoDebit: true, amountCents: null }))).toBe(true);
    let list = await repo.listBills(a);
    const luz = list.find((x) => x.name === "Luz")!;

    expect(await repo.setBillPaid(a, luz.id, "2026-10", "2026-10-08")).toBe(true); // antecipado
    expect(await repo.setBillPaid(a, luz.id, "2026-10", "2026-10-09")).toBe(true); // corrige a data, sem duplicar
    list = await repo.listBills(a);
    expect(list.find((x) => x.id === luz.id)!.payments).toEqual([{ month: "2026-10", paidOn: "2026-10-09" }]);

    const cal = await repo.billsForCalendar(a);
    expect(cal.map((x) => x.name)).toEqual(["Luz"]);
    expect(cal[0].paidMonths.has("2026-10")).toBe(true);
    expect(reminderDates(cal, "2026-10-01", "2026-11-30").map((r) => r.date)).toEqual(["2026-10-10", "2026-11-10"]);

    expect(await repo.setBillPaid(a, luz.id, "2026-10", null)).toBe(true);
    expect((await repo.listBills(a)).find((x) => x.id === luz.id)!.payments).toEqual([]);

    await repo.setBillArchived(a, luz.id, true);
    expect(await repo.billsForCalendar(a)).toEqual([]); // arquivada sai do calendário
  }, 60_000);

  it("outra usuária não vê nem altera", async () => {
    await repo.createBill(a, values({ name: "Aluguel" }));
    const id = (await repo.listBills(a)).find((x) => x.name === "Aluguel")!.id;
    expect(await repo.listBills(b)).toEqual([]);
    expect(await repo.setBillPaid(b, id, "2026-10", "2026-10-01")).toBe(false);
    expect(await repo.updateBill(b, id, values({ name: "x" }))).toBe(false);
    expect(await repo.deleteBill(b, id)).toBe(false);
    expect(await repo.billsForCalendar(b)).toEqual([]);
  }, 60_000);
});
