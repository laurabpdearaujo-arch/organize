/**
 * Fluxo completo de uma série recorrente no banco real, com usuária temporária.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eventInputSchema, inputToSeriesValues, timingChanged } from "@/lib/calendar/schemas";
import { createTempUser, deleteTempUser } from "./helpers";

const TZ = "America/Sao_Paulo";
let user = "";
let repo: typeof import("@/lib/calendar/repository");
let dbModule: typeof import("@/db");

const from = new Date("2026-11-01T00:00Z");
const to = new Date("2026-12-01T00:00Z");

const input = (over: Record<string, unknown> = {}) =>
  inputToSeriesValues(
    eventInputSchema.parse({
      title: "Inglês",
      description: "Trazer livro",
      color: "teal",
      allDay: false,
      startDate: "2026-11-02", // segunda
      startTime: "18:00",
      endDate: "2026-11-02",
      endTime: "19:00",
      recurrence: { freq: "weekly", interval: 1, byWeekday: [1, 3] }, // seg e qua
      ...over,
    }),
    TZ,
  );

beforeAll(async () => {
  repo = await import("@/lib/calendar/repository");
  dbModule = await import("@/db");
  user = await createTempUser();
}, 30_000);

afterAll(async () => {
  await deleteTempUser(user);
  await dbModule?.db.$client.end();
}, 30_000);

describe("série recorrente: criar, alterar uma, cancelar uma, alterar a série", () => {
  it("funciona de ponta a ponta", async () => {
    const id = await repo.createSeries(user, input());
    let occ = await repo.listOccurrences(user, from, to);
    expect(occ).toHaveLength(9); // seg/qua de 2/nov a 30/nov

    // Muda só a quarta 4/nov para 20:00 e outro título
    const wed = occ[1];
    expect(await repo.upsertException(user, id, wed.originalStart, {
      title: "Inglês (reposição)",
      startsAt: new Date("2026-11-04T23:00:00Z"),
      endsAt: new Date("2026-11-05T00:00:00Z"),
    })).toBe(true);

    // Cancela só a segunda 9/nov
    expect(await repo.upsertException(user, id, occ[2].originalStart, { cancelled: true })).toBe(true);

    occ = await repo.listOccurrences(user, from, to);
    expect(occ).toHaveLength(8);
    const changed = occ.find((o) => o.modified)!;
    expect(changed.title).toBe("Inglês (reposição)");
    expect(changed.description).toBe("Trazer livro"); // herdou da série
    expect(occ.filter((o) => !o.modified).every((o) => o.title === "Inglês")).toBe(true);

    // Renomear a série (sem mudar horário) mantém as alterações individuais
    const renamed = input({ title: "Inglês B2" });
    const existing = (await repo.getSeries(user, id))!;
    expect(timingChanged({ ...existing, recurrence: existing.recurrence ?? null }, renamed)).toBe(false);
    await repo.updateSeries(user, id, renamed, false);
    occ = await repo.listOccurrences(user, from, to);
    expect(occ).toHaveLength(8);
    expect(occ.filter((o) => !o.modified).every((o) => o.title === "Inglês B2")).toBe(true);

    // Mudar o horário da série descarta as alterações individuais
    const later = input({ title: "Inglês B2", startTime: "19:00", endTime: "20:00" });
    expect(timingChanged(renamed, later)).toBe(true);
    await repo.updateSeries(user, id, later, true);
    occ = await repo.listOccurrences(user, from, to);
    expect(occ).toHaveLength(9);
    expect(occ.every((o) => !o.modified && o.start.getUTCHours() === 22)).toBe(true); // 19:00 SP

    // Excluir a série remove tudo
    expect(await repo.deleteSeries(user, id)).toBe(true);
    expect(await repo.listOccurrences(user, from, to)).toEqual([]);
  }, 60_000);
});
