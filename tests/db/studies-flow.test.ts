/**
 * Estudos no banco real (usuárias temporárias, apagadas no final).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseOutline } from "@/lib/studies/outline";
import { buildTree, progress, stats } from "@/lib/studies/progress";
import { createTempUser, deleteTempUser } from "./helpers";

let a = "";
let b = "";
let repo: typeof import("@/lib/studies/repository");
let dbModule: typeof import("@/db");

const { plans } = parseOutline([
  "PARTE I — PROGRAMA DA ANPEC",
  "1. Microeconomia",
  "• 1. Demanda do consumidor — 1.1 Teoria do consumidor: curvas de indiferença. 1.2 Curva de demanda: elasticidades.",
  "• 4. Equilíbrio geral e bem-estar — troca pura; caixa de Edgeworth.",
  "PARTE II — CURSO DE VALUATION",
  "Módulo I: informado como concluído.",
  "Módulo II — Análise Fundamentalista",
  "1. Introdução",
  "2. Release I",
]);

beforeAll(async () => {
  repo = await import("@/lib/studies/repository");
  dbModule = await import("@/db");
  a = await createTempUser();
  b = await createTempUser();
}, 30_000);

afterAll(async () => {
  await deleteTempUser(a);
  await deleteTempUser(b);
  await dbModule?.db.$client.end();
}, 30_000);

describe("planos de estudo", () => {
  it("importa a árvore inteira, preserva a ordem e o Módulo I concluído", async () => {
    const ids = await repo.importPlans(a, "conteudo.pdf", plans.map((p, i) => ({ name: p.name, color: i ? "teal" : "violet", nodes: p.nodes })));
    expect(ids).toHaveLength(2);
    const list = await repo.listPlans(a);
    const anpec = buildTree(list.find((p) => p.name === "PROGRAMA DA ANPEC")!.items);
    expect(anpec[0].title).toBe("Microeconomia");
    expect(anpec[0].children.map((n) => n.title)).toEqual(["Demanda do consumidor", "Equilíbrio geral e bem-estar"]);
    expect(anpec[0].children[0].children.map((n) => n.code)).toEqual(["1.1", "1.2"]);

    const val = buildTree(list.find((p) => p.name === "CURSO DE VALUATION")!.items);
    expect(stats(val)).toMatchObject({ total: 3, done: 1 }); // Módulo I + 2 aulas
  }, 60_000);

  it("status, marcar tema inteiro, agendar e listar para o calendário", async () => {
    const plan = (await repo.listPlans(a)).find((p) => p.name === "PROGRAMA DA ANPEC")!;
    const tree = buildTree(plan.items);
    const [t11, t12] = tree[0].children[0].children;
    const eq = tree[0].children[1];

    expect(await repo.updateItem(a, t11.id, { status: "done" })).toBe(true);
    expect(await repo.updateItem(a, t12.id, { status: "partial", plannedDate: "2026-11-03", plannedTime: "19:00", plannedMinutes: 90 })).toBe(true);
    expect(await repo.updateItem(a, eq.id, { plannedDate: "2026-11-05" })).toBe(true);

    let items = (await repo.listPlans(a)).find((p) => p.id === plan.id)!.items;
    expect(progress(stats(buildTree(items)))).toBeCloseTo((1 + 0.5) / 3);

    const cal = await repo.plannedItems(a, "2026-11-01", "2026-11-30");
    expect(cal.map((c) => [c.title, c.plannedDate, c.plannedTime])).toEqual(
      expect.arrayContaining([
        ["Curva de demanda", "2026-11-03", "19:00"],
        ["Equilíbrio geral e bem-estar", "2026-11-05", null],
      ]),
    );
    expect(cal.every((c) => c.planName === "PROGRAMA DA ANPEC")).toBe(true);

    // marcar o tema inteiro
    expect(await repo.setStatusMany(a, [t11.id, t12.id, eq.id], "done")).toBe(3);
    items = (await repo.listPlans(a)).find((p) => p.id === plan.id)!.items;
    expect(progress(stats(buildTree(items)))).toBe(1);
  }, 60_000);

  it("outra usuária não vê nem altera; excluir o plano apaga os itens", async () => {
    const plan = (await repo.listPlans(a)).find((p) => p.name === "CURSO DE VALUATION")!;
    const item = plan.items[0];
    expect(await repo.listPlans(b)).toEqual([]);
    expect(await repo.updateItem(b, item.id, { status: "done" })).toBe(false);
    expect(await repo.setStatusMany(b, [item.id], "done")).toBe(0);
    expect(await repo.plannedItems(b, "2000-01-01", "2100-01-01")).toEqual([]);
    expect(await repo.deletePlan(b, plan.id)).toBe(false);

    expect(await repo.deletePlan(a, plan.id)).toBe(true);
    const left = await dbModule.db.$client`select count(*)::int n from study_items where plan_id = ${plan.id}`;
    expect(left[0].n).toBe(0);
  }, 60_000);
});
