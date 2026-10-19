/**
 * Teste de integração contra o banco real (Supabase).
 * Cria duas usuárias temporárias, confirma que uma não acessa os dados da outra
 * e apaga tudo no final (os dados delas somem junto, por ON DELETE CASCADE).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempUser, deleteTempUser } from "./helpers";

let userA = "";
let userB = "";
let repo: typeof import("@/lib/calendar/repository");
let dbModule: typeof import("@/db");

const values = (title: string) => ({
  title,
  description: null,
  location: null,
  color: "violet",
  allDay: false,
  startsAt: new Date("2026-10-20T17:00:00Z"),
  endsAt: new Date("2026-10-20T18:00:00Z"),
  timezone: "America/Sao_Paulo",
  recurrence: { freq: "weekly" as const, interval: 1 },
});

beforeAll(async () => {
  repo = await import("@/lib/calendar/repository");
  dbModule = await import("@/db");
  userA = await createTempUser();
  userB = await createTempUser();
}, 30_000);

afterAll(async () => {
  await deleteTempUser(userA);
  await deleteTempUser(userB);
  await dbModule?.db.$client.end();
}, 30_000);

describe("isolamento entre usuárias (calendário)", () => {
  it("B não vê, não altera e não apaga os eventos de A", async () => {
    const eventId = await repo.createSeries(userA, values("Evento da A"));
    const from = new Date("2026-10-01T00:00Z");
    const to = new Date("2026-11-01T00:00Z");

    expect((await repo.listOccurrences(userA, from, to)).length).toBeGreaterThan(0);
    expect(await repo.listOccurrences(userB, from, to)).toEqual([]);
    expect(await repo.getSeries(userB, eventId)).toBeNull();

    expect(await repo.updateSeries(userB, eventId, values("Invadido"), true)).toBe(false);
    expect(await repo.upsertException(userB, eventId, new Date("2026-10-20T17:00:00Z"), { cancelled: true })).toBe(false);
    expect(await repo.deleteSeries(userB, eventId)).toBe(false);

    const still = await repo.getSeries(userA, eventId);
    expect(still?.title).toBe("Evento da A");
    expect((await repo.listOccurrences(userA, from, to)).every((o) => o.title === "Evento da A")).toBe(true);
  }, 30_000);

  it("papéis públicos do Supabase não têm permissão em nenhuma tabela do app", async () => {
    const rows = await dbModule.db.$client`
      select table_name, grantee, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')`;
    expect(rows).toEqual([]);
  });

  it("todas as tabelas do app têm RLS ligado", async () => {
    const rows = await dbModule.db.$client`
      select relname from pg_class
      where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`;
    expect(rows).toEqual([]);
  });
});
