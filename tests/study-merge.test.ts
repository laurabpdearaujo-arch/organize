import { describe, expect, it } from "vitest";
import { planMerge, type ExistingItem } from "@/lib/studies/merge";
import type { OutlineNode } from "@/lib/studies/outline";

const n = (title: string, children: OutlineNode[] = [], over: Partial<OutlineNode> = {}): OutlineNode => ({
  code: null,
  title,
  description: null,
  durationMinutes: null,
  tags: [],
  done: false,
  children,
  ...over,
});
const e = (id: string, parentId: string | null, position: number, title: string, over: Partial<ExistingItem> = {}): ExistingItem => ({
  id,
  parentId,
  position,
  code: null,
  title,
  description: null,
  durationMinutes: null,
  tags: [],
  ...over,
});

// Plano existente: Módulo II [Introdução, Release I]
const existing = [e("m2", null, 0, "Módulo II"), e("intro", "m2", 0, "Introdução"), e("rel", "m2", 1, "Release I")];

describe("reimportar sem perder progresso", () => {
  it("mesmo PDF: nada novo, nada sumido", () => {
    const r = planMerge(existing, [n("Módulo II", [n("Introdução"), n("Release I")])]);
    expect(r.inserts).toEqual([]);
    expect(r.missing).toEqual([]);
    expect(r.updates.map((u) => u.id).sort()).toEqual(["intro", "m2", "rel"]);
  });

  it("aula nova no meio e módulo novo: só eles são criados, na ordem do PDF", () => {
    const r = planMerge(existing, [n("Módulo II", [n("Introdução"), n("Apresentação"), n("Release I")]), n("Módulo III", [n("Quiz")])]);
    expect(r.inserts.map((i) => [i.node.title, i.parent, i.position])).toEqual([
      ["Apresentação", { existing: "m2" }, 1],
      ["Módulo III", null, 1],
      ["Quiz", { temp: "t1" }, 0],
    ]);
    expect(r.updates.find((u) => u.id === "rel")!.position).toBe(2); // Release I desceu uma posição
  });

  it("ignora diferença de acento, maiúsculas e pontuação no título", () => {
    const r = planMerge(existing, [n("MÓDULO II", [n("introducao"), n("Release I.")])]);
    expect(r.inserts).toEqual([]);
  });

  it("título mudou mas o código é o mesmo: reaproveita (ANPEC 1.1)", () => {
    const ex = [e("micro", null, 0, "Microeconomia"), e("11", "micro", 0, "Teoria do consumidor", { code: "1.1" })];
    const r = planMerge(ex, [n("Microeconomia", [n("Teoria do consumidor e escolha", [], { code: "1.1", description: "nova" })])]);
    expect(r.inserts).toEqual([]);
    expect(r.updates.find((u) => u.id === "11")!.description).toBe("nova");
  });

  it("o que sumiu do PDF é mantido (com os filhos) e contado", () => {
    const r = planMerge(existing, [n("Módulo II", [n("Introdução")])]);
    expect(r.missing).toEqual(["rel"]);
    const r2 = planMerge(existing, [n("Outro módulo")]);
    expect(r2.missing.sort()).toEqual(["intro", "m2", "rel"]);
  });
});
