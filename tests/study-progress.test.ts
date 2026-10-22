import { describe, expect, it } from "vitest";
import { buildTree, leavesOf, progress, stats, type ItemLite, type StudyStatus } from "@/lib/studies/progress";

const it_ = (id: string, parentId: string | null, position: number, status: StudyStatus = "not_started", extra: Partial<ItemLite> = {}): ItemLite => ({
  id,
  parentId,
  position,
  status,
  isGroup: false,
  durationMinutes: null,
  plannedDate: null,
  ...extra,
});

describe("árvore e progresso", () => {
  // Micro: [Demanda: 1.1 (feito), 1.2 (parcial)], [Equilíbrio (folha, não iniciado, agendado)]; Módulo I (folha concluída)
  const items = [
    it_("micro", null, 0),
    it_("mod1", null, 1, "done"),
    it_("demanda", "micro", 0),
    it_("eq", "micro", 1, "not_started", { plannedDate: "2026-11-01" }),
    it_("1.2", "demanda", 1, "partial", { durationMinutes: 30 }),
    it_("1.1", "demanda", 0, "done", { durationMinutes: 45 }),
  ];
  const tree = buildTree(items);

  it("monta a árvore respeitando a ordem", () => {
    expect(tree.map((n) => n.id)).toEqual(["micro", "mod1"]);
    expect(tree[0].children[0].children.map((n) => n.id)).toEqual(["1.1", "1.2"]);
  });

  it("conta só as folhas (tema vazio concluído conta como folha)", () => {
    const s = stats(tree);
    expect(s).toMatchObject({ total: 4, done: 2, partial: 1, scheduled: 1, minutes: 75, minutesDone: 45 });
    expect(progress(s)).toBeCloseTo((2 + 0.5) / 4);
  });

  it("progresso de um tema", () => {
    const micro = tree[0];
    expect(progress(stats(micro.children))).toBeCloseTo(1.5 / 3);
    expect(leavesOf(micro).map((n) => n.id)).toEqual(["1.1", "1.2", "eq"]);
  });

  it("tema/subtema vazio não conta como conteúdo", () => {
    const t = buildTree([...items, it_("novo", null, 2, "not_started", { isGroup: true })]);
    expect(stats(t).total).toBe(4);
    expect(leavesOf(t[2])).toEqual([]);
  });

  it("plano vazio: progresso 0", () => {
    expect(progress(stats([]))).toBe(0);
  });
});
