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

  it("registros de estudo: primeiro registro deixa 'em andamento'; acertos ≤ questões", async () => {
    const plan = (await repo.listPlans(a)).find((p) => p.name === "CURSO DE VALUATION")!;
    const aula = buildTree(plan.items)[1].children[0]; // Módulo II > Introdução
    expect(aula.status).toBe("not_started");
    expect(await repo.addLog(a, aula.id, { date: "2026-10-20", minutes: 50, questionsDone: 10, questionsCorrect: 7, difficulties: "WACC", mistakes: null })).toBe(true);
    await expect(repo.addLog(a, aula.id, { date: "2026-10-21", minutes: 10, questionsDone: 2, questionsCorrect: 5, difficulties: null, mistakes: null })).rejects.toThrow();
    const after = (await repo.listPlans(a)).find((p) => p.id === plan.id)!;
    expect(after.items.find((i) => i.id === aula.id)!.status).toBe("in_progress");
    expect(after.logs).toHaveLength(1);
    expect(await repo.addLog(b, aula.id, { date: "2026-10-20", minutes: 1, questionsDone: null, questionsCorrect: null, difficulties: null, mistakes: null })).toBe(false);
  }, 60_000);

  it("editar estrutura: adicionar (no fim ou pela ordem do código), mover, excluir com os registros", async () => {
    const plan = (await repo.listPlans(a)).find((p) => p.name === "CURSO DE VALUATION")!;
    const m2 = buildTree(plan.items)[1];
    const [intro] = m2.children;
    expect(await repo.addItem(a, plan.id, m2.id, { code: null, title: "Aula final", durationMinutes: 45, isGroup: false })).toBe(true);
    expect(await repo.addItem(a, plan.id, m2.id, { code: null, title: "Aula nova", durationMinutes: null, isGroup: false })).toBe(true);
    const items = (await repo.listPlans(a)).find((p) => p.id === plan.id)!.items;
    let titles = buildTree(items)[1].children.map((c) => c.title);
    expect(titles).toEqual(["Introdução", "Release I", "Aula final", "Aula nova"]);
    expect(items.find((i) => i.title === "Aula final")!.durationMinutes).toBe(45);

    const nova = buildTree(items)[1].children[3];
    await repo.moveItem(a, nova.id, "up");
    await repo.moveItem(a, nova.id, "up");
    titles = buildTree((await repo.listPlans(a)).find((p) => p.id === plan.id)!.items)[1].children.map((c) => c.title);
    expect(titles).toEqual(["Introdução", "Aula nova", "Release I", "Aula final"]);

    expect(await repo.deleteItem(b, intro.id)).toBe(false);
    expect(await repo.deleteItem(a, intro.id)).toBe(true); // tinha 1 registro
    const after = (await repo.listPlans(a)).find((p) => p.id === plan.id)!;
    expect(after.logs).toHaveLength(0);
    expect(await repo.addItem(b, plan.id, null, { code: null, title: "x", durationMinutes: null, isGroup: false })).toBe(false);

    // com código: entra na ordem entre os irmãos
    const anpec = (await repo.listPlans(a)).find((p) => p.name === "PROGRAMA DA ANPEC")!;
    const demanda = buildTree(anpec.items)[0].children[0];
    expect(await repo.addItem(a, anpec.id, demanda.id, { code: "1.0", title: "Preferências", durationMinutes: null, isGroup: false })).toBe(true);
    const codes = buildTree((await repo.listPlans(a)).find((p) => p.id === anpec.id)!.items)[0].children[0].children.map((n) => n.code);
    expect(codes).toEqual(["1.0", "1.1", "1.2"]);

    // tema/subtema vazio é grupo e não conta; conteúdo que ganha itens dentro vira grupo
    const before = stats(buildTree((await repo.listPlans(a)).find((p) => p.id === anpec.id)!.items)).total;
    expect(await repo.addItem(a, anpec.id, null, { code: null, title: "Tema vazio", durationMinutes: null, isGroup: true })).toBe(true);
    const eq = buildTree((await repo.listPlans(a)).find((p) => p.id === anpec.id)!.items)[0].children.find((n) => n.code === "4")!;
    expect(eq.isGroup).toBe(false);
    expect(await repo.addItem(a, anpec.id, eq.id, { code: "4.1", title: "Troca pura", durationMinutes: null, isGroup: false })).toBe(true);
    const items2 = (await repo.listPlans(a)).find((p) => p.id === anpec.id)!.items;
    expect(items2.find((i) => i.id === eq.id)!.isGroup).toBe(true);
    expect(items2.find((i) => i.title === "Tema vazio")!.isGroup).toBe(true);
    expect(stats(buildTree(items2)).total).toBe(before); // "4" saiu, "4.1" entrou, tema vazio não conta
  }, 60_000);

  it("reimportar o PDF atualizado mantém status, datas e registros e só cria o que é novo", async () => {
    const plan = (await repo.listPlans(a)).find((p) => p.name === "CURSO DE VALUATION")!;
    const tree = buildTree(plan.items);
    const release = tree[1].children.find((c) => c.title === "Release I")!;
    await repo.updateItem(a, release.id, { status: "done", plannedDate: "2026-11-10" });
    await repo.addLog(a, release.id, { date: "2026-10-22", minutes: 30, questionsDone: null, questionsCorrect: null, difficulties: null, mistakes: null });

    const { plans: v2 } = parseOutline([
      "PARTE II — CURSO DE VALUATION",
      "Módulo I: informado como concluído.",
      "Módulo II — Análise Fundamentalista",
      "1. Introdução",
      "2. Release I",
      "3. Release II",
      "Módulo III — Conceitos de Valor",
      "1. Valor Intrínseco",
    ]);
    const res = await repo.mergeIntoPlan(a, plan.id, v2[0].nodes);
    // novos: Introdução (tinha sido excluída), Release II, Módulo III + 1 aula
    expect(res).toEqual({ added: 4, kept: 3, missing: 2 }); // mantidos: Módulo I, Módulo II, Release I; sumiram: Aula nova, Aula final
    const after = (await repo.listPlans(a)).find((p) => p.id === plan.id)!;
    const rel = after.items.find((i) => i.id === release.id)!;
    expect([rel.status, rel.plannedDate]).toEqual(["done", "2026-11-10"]);
    expect(after.logs.filter((l) => l.itemId === release.id)).toHaveLength(1);
    expect(buildTree(after.items).map((n) => n.title)).toEqual(["Módulo I", "Análise Fundamentalista", "Conceitos de Valor"]);
    expect(await repo.mergeIntoPlan(b, plan.id, v2[0].nodes)).toBeNull();
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
