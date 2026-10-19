/**
 * Hábitos no banco real, com usuárias temporárias (apagadas no final).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeGoal } from "@/lib/habits/schemas";
import { dayStatus } from "@/lib/habits/stats";
import { createTempUser, deleteTempUser } from "./helpers";

let a = "";
let b = "";
let repo: typeof import("@/lib/habits/repository");
let dbModule: typeof import("@/db");

const TODAY = "2026-10-21";
const details = { name: "Ler", direction: "build" as const, measure: "quantity" as const, unit: "páginas", category: "Estudos", color: "violet" };
const goal30 = normalizeGoal({ scheduleType: "days", weekdays: [0, 1, 2, 3, 4, 5, 6], timesPerWeek: null, target: 30 }, "quantity");
const goal20 = normalizeGoal({ scheduleType: "days", weekdays: [0, 1, 2, 3, 4, 5, 6], timesPerWeek: null, target: 20 }, "quantity");

beforeAll(async () => {
  repo = await import("@/lib/habits/repository");
  dbModule = await import("@/db");
  a = await createTempUser();
  b = await createTempUser();
}, 30_000);

afterAll(async () => {
  await deleteTempUser(a);
  await deleteTempUser(b);
  await dbModule?.db.$client.end();
}, 30_000);

describe("hábitos no banco", () => {
  it("registrar, mudar meta (sem reescrever o passado), pausar, retomar e arquivar", async () => {
    const id = await repo.createHabit(a, details, goal30, "2026-10-10");

    expect(await repo.setLog(a, id, "2026-10-12", 25, TODAY)).toBe("ok");
    expect(await repo.setLog(a, id, "2026-10-12", 31, TODAY)).toBe("ok"); // corrige o mesmo dia
    expect(await repo.setLog(a, id, "2026-10-09", 10, TODAY)).toBe("before_start");
    expect(await repo.setLog(a, id, "2026-10-22", 10, TODAY)).toBe("future");

    await repo.setGoal(a, id, goal20, "2026-10-15");
    await repo.setLog(a, id, "2026-10-14", 25, TODAY);
    await repo.setLog(a, id, "2026-10-16", 25, TODAY);

    let h = (await repo.loadHabits(a)).find((x) => x.id === id)!;
    expect(h.logs["2026-10-12"]).toBe(31);
    expect(h.versions.map((v) => v.target)).toEqual([30, 20]);
    expect(dayStatus(h, "2026-10-14", TODAY)).toBe("partial"); // meta antiga: 30
    expect(dayStatus(h, "2026-10-16", TODAY)).toBe("done"); // meta nova: 20

    await repo.pauseHabit(a, id, "2026-10-18");
    await repo.pauseHabit(a, id, "2026-10-18"); // pausar de novo não duplica
    await repo.resumeHabit(a, id, "2026-10-20");
    h = (await repo.loadHabits(a)).find((x) => x.id === id)!;
    expect(h.pauses).toEqual([{ start: "2026-10-18", end: "2026-10-19" }]);
    expect(dayStatus(h, "2026-10-19", TODAY)).toBe("paused");
    expect(dayStatus(h, "2026-10-20", TODAY)).toBe("missed");

    await repo.setLog(a, id, "2026-10-12", null, TODAY); // apagar registro
    await repo.setArchived(a, id, true);
    h = (await repo.loadHabits(a)).find((x) => x.id === id)!;
    expect(h.archived).toBe(true);
    expect(h.logs["2026-10-12"]).toBeUndefined();
    expect(h.logs["2026-10-16"]).toBe(25); // arquivar mantém o histórico
  }, 60_000);

  it("mudar a data de início permite lançar dias anteriores", async () => {
    const id = await repo.createHabit(a, { ...details, name: "Meditar" }, goal30, "2026-10-18");
    expect(await repo.setLog(a, id, "2026-10-10", 30, TODAY)).toBe("before_start");

    expect(await repo.setStartDate(a, id, "2026-10-05")).toBe("ok");
    expect(await repo.setLog(a, id, "2026-10-10", 30, TODAY)).toBe("ok");
    let h = (await repo.loadHabits(a)).find((x) => x.id === id)!;
    expect(h.createdOn).toBe("2026-10-05");
    expect(h.versions[0].effectiveFrom).toBe("2026-10-05"); // a meta vale desde o novo início
    expect(dayStatus(h, "2026-10-10", TODAY)).toBe("done");

    // Para frente não pode se houver registro antes da nova data
    expect(await repo.setStartDate(a, id, "2026-10-12")).toBe("logs_before");
    await repo.setLog(a, id, "2026-10-10", null, TODAY);
    expect(await repo.setStartDate(a, id, "2026-10-12")).toBe("ok");
    h = (await repo.loadHabits(a)).find((x) => x.id === id)!;
    expect(h.createdOn).toBe("2026-10-12");
    expect(h.versions.map((v) => v.effectiveFrom)).toEqual(["2026-10-12"]);
    expect(await repo.setStartDate(b, id, "2026-10-01")).toBe("not_found");
  }, 60_000);

  it("corrigir configuração reescreve desde o início; mudar meta não mexe no passado", async () => {
    const weekend = normalizeGoal({ scheduleType: "days", weekdays: [0, 6], timesPerWeek: null, target: 50 }, "duration");
    const monTue = normalizeGoal({ scheduleType: "days", weekdays: [1, 2], timesPerWeek: null, target: 50 }, "duration");
    const id = await repo.createHabit(a, { ...details, name: "Academia", measure: "duration", unit: "min" }, weekend, "2026-10-04");
    await repo.setLog(a, id, "2026-10-12", 60, TODAY); // segunda
    let h = (await repo.loadHabits(a)).find((x) => x.id === id)!;
    expect(dayStatus(h, "2026-10-12", TODAY)).toBe("extra");

    // "Mudar meta (daqui pra frente)": o dia 12 continua avaliado pela configuração antiga
    await repo.setGoal(a, id, monTue, "2026-10-19");
    h = (await repo.loadHabits(a)).find((x) => x.id === id)!;
    expect(h.versions).toHaveLength(2);
    expect(dayStatus(h, "2026-10-12", TODAY)).toBe("extra");

    // "Corrigir configuração": uma única meta desde o início, todos os dias reavaliados
    expect(await repo.correctGoal(a, id, monTue)).toBe(true);
    h = (await repo.loadHabits(a)).find((x) => x.id === id)!;
    expect(h.versions).toHaveLength(1);
    expect(h.versions[0].effectiveFrom).toBe("2026-10-04");
    expect(dayStatus(h, "2026-10-12", TODAY)).toBe("done");
    expect(await repo.correctGoal(b, id, weekend)).toBe(false);
  }, 60_000);

  it("outra usuária não vê nem altera os hábitos", async () => {
    const id = await repo.createHabit(a, { ...details, name: "Correr" }, goal30, "2026-10-10");
    expect((await repo.loadHabits(b)).length).toBe(0);
    expect(await repo.setLog(b, id, "2026-10-12", 5, TODAY)).toBe("not_found");
    expect(await repo.setGoal(b, id, goal20, TODAY)).toBe(false);
    expect(await repo.pauseHabit(b, id, TODAY)).toBe(false);
    expect(await repo.updateHabitDetails(b, id, { name: "x", unit: null, category: "Outros", color: "gray" })).toBe(false);
    expect(await repo.setArchived(b, id, true)).toBe(false);
    expect(await repo.deleteHabit(b, id)).toBe(false);
    const h = (await repo.loadHabits(a)).find((x) => x.id === id)!;
    expect(h.name).toBe("Correr");
    expect(h.logs).toEqual({});
  }, 60_000);
});
