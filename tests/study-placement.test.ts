import { describe, expect, it } from "vitest";
import { childrenOf, compareCodes, insertIndex, parentByCode, type PlaceItem } from "@/lib/studies/placement";

const it_ = (id: string, parentId: string | null, position: number, code: string | null, title = id): PlaceItem => ({ id, parentId, position, code, title });

// ANPEC: Micro (1) > Mercados (3) > 3.1, 3.3, 3.4 > 3.4.1 ; Macro (2) > Contabilidade (1) > 1.1
const items = [
  it_("micro", null, 0, "1"),
  it_("macro", null, 1, "2"),
  it_("merc", "micro", 0, "3"),
  it_("m31", "merc", 0, "3.1"),
  it_("m33", "merc", 1, "3.3"),
  it_("m34", "merc", 2, "3.4"),
  it_("m341", "m34", 0, "3.4.1"),
  it_("cont", "macro", 0, "1"),
  it_("c11", "cont", 0, "1.1"),
];

describe("onde entra um conteúdo novo", () => {
  it("compara códigos como números", () => {
    expect(compareCodes("3.10", "3.9")).toBeGreaterThan(0);
    expect(compareCodes("3.4", "3.4.1")).toBeLessThan(0);
    expect(compareCodes("2.", "2")).toBe(0);
  });

  it("acha o pai pelo código só dentro do tema escolhido", () => {
    expect(parentByCode(items, "micro", "3.2")).toBe("merc");
    expect(parentByCode(items, "micro", "3.4.2")).toBe("m34");
    expect(parentByCode(items, "micro", "8")).toBe("micro"); // subtema novo direto no tema
    expect(parentByCode(items, "macro", "1.2")).toBe("cont"); // o "1" de Macro, não o de Micro
    expect(parentByCode(items, "micro", "1.2")).toBeUndefined(); // Micro não tem "1"
    expect(parentByCode(items, "micro", "  ")).toBeUndefined();
  });

  it("ementa numerada: tema 1.1 com conteúdos 1.1.x recebe o 1.1.17 direto", () => {
    const ementa = [it_("basica", null, 0, "1.1"), it_("pot", "basica", 0, "1.1.1"), it_("log", "basica", 1, "1.1.2"), it_("vazio", null, 1, "1.2")];
    expect(parentByCode(ementa, "basica", "1.1.17")).toBe("basica");
    expect(parentByCode(ementa, "basica", "1.1.2.1")).toBe("log");
    expect(parentByCode(ementa, "vazio", "1.2.1")).toBeUndefined(); // tema sem conteúdos numerados: a pessoa escolhe
  });

  it("coloca pela ordem do código; sem código, no fim", () => {
    const sib = childrenOf(items, "merc");
    expect(insertIndex(sib, "3.2")).toBe(1); // entre 3.1 e 3.3
    expect(insertIndex(sib, "3.0")).toBe(0);
    expect(insertIndex(sib, "3.5")).toBe(3);
    expect(insertIndex(sib, null)).toBe(3);
    expect(insertIndex([it_("a", "x", 0, null), it_("b", "x", 1, null)], "1")).toBe(2); // irmãos sem código: no fim
  });
});
