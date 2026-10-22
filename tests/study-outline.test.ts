/**
 * Leitor do conteúdo programático. As linhas abaixo são trechos reais do PDF de exemplo
 * (Conteudo_Detalhado_ANPEC_Valuation_Economia_Geral), com as quebras de linha originais.
 */
import { describe, expect, it } from "vitest";
import { countLeaves, parseOutline } from "@/lib/studies/outline";

const LINES = [
  "CONTEÚDO PROGRAMÁTICO DETALHADO",
  "Nota: o Módulo I de Valuation foi informado como concluído, mas seus títulos de aula não constavam no conteúdo",
  "PARTE I — PROGRAMA DA ANPEC",
  "1. Microeconomia",
  "• 1. Demanda do consumidor — 1.1 Teoria do consumidor: abordagens cardinal e ordinal; curvas de indiferença; restrição",
  "orçamentária; equilíbrio. 1.2 Curva de demanda: deslocamentos versus",
  "movimentos ao longo da curva; receita total, média e marginal.",
  "• 3. Mercados — 3.1 Concorrência perfeita: equilíbrio da firma e oferta; triângulo de Harberger.",
  "3.3 Concorrência monopolística: diferenciação. 3.4",
  "Oligopólio: estrutura; 3.4.1 modelos clássicos: Cournot, Bertrand e Stackelberg; 3.4.2 modelos",
  "de mark-up: full-cost, demanda quebrada. 3.5 Formação de preços e fatores de produção; renda econômica.",
  "• 4. Equilíbrio geral e bem-estar — troca pura; troca com produção; caixa de Edgeworth;",
  "escolha coletiva; eleitor mediano.",
  "Conteúdo programático detalhado Página 1",
  "2. Macroeconomia",
  "• 1. Contabilidade nacional — conceitos de renda e produto; desemprego; inflação pelo deflator do PIB e IPC; Balanço de",
  "Pagamentos BPM6: contas corrente, de capital e financeira.",
  "5. Economia Brasileira",
  "• 4. 1961–1967: desaceleração, reformas fiscais e financeiras, Plano Trienal e",
  "PAEG.",
  "• 10. Tópicos adicionais: agricultura; privatização; pensamento econômico brasileiro.",
  "PARTE II — CURSO DE VALUATION",
  "Módulo I: informado como concluído; os títulos das aulas não constavam no conteúdo recuperado.",
  "Módulo II — Análise Fundamentalista & Valuation do Zero ao Avançado",
  "1. Introdução",
  "7. FAQ Bônus",
  "Módulo III — Conceitos de Valor",
  "8. Quiz",
  "Módulo V — Pré-Modelagem",
  "5. Contabilidade I [Bônus]",
  "Módulo VIII — Análises Práticas",
  "7. Petrobras (áudio)",
  "PARTE III — CURSO DE ECONOMIA GERAL",
  "Fundamentos da Economia",
  "1. Capitalismo e o surgimento do livre comércio — 45:18",
  "3. O Básico: Microeconomia X Macroeconomia — 11:56",
  "Aulas Bônus",
  "1. “Privatizações” que não são privatizações — 01:23:30",
  "3. ESG - os “Nobeis” que falam disso",
];

const { plans, warnings } = parseOutline(LINES);
const [anpec, valuation, economia] = plans;

describe("partes viram planos; introdução e rodapé são ignorados", () => {
  it("três planos com os nomes das partes", () => {
    expect(plans.map((p) => p.name)).toEqual(["PROGRAMA DA ANPEC", "CURSO DE VALUATION", "CURSO DE ECONOMIA GERAL"]);
    expect(warnings).toEqual([]);
  });
});

describe("ANPEC: disciplina → tópico → subassunto", () => {
  it("disciplinas são temas", () => {
    expect(anpec.nodes.map((n) => `${n.code}. ${n.title}`)).toEqual(["1. Microeconomia", "2. Macroeconomia", "5. Economia Brasileira"]);
  });

  it("tópico com 1.1/1.2 vira subtema; o texto vira descrição de cada conteúdo (juntando linhas quebradas)", () => {
    const demanda = anpec.nodes[0].children[0];
    expect(demanda.title).toBe("Demanda do consumidor");
    expect(demanda.children.map((c) => `${c.code} ${c.title}`)).toEqual(["1.1 Teoria do consumidor", "1.2 Curva de demanda"]);
    expect(demanda.children[0].description).toBe("abordagens cardinal e ordinal; curvas de indiferença; restrição orçamentária; equilíbrio");
    expect(demanda.children[1].description).toContain("receita total, média e marginal");
  });

  it("código quebrado entre linhas (“3.4” / “Oligopólio”) e 3.4.1/3.4.2 dentro de 3.4", () => {
    const mercados = anpec.nodes[0].children[1];
    expect(mercados.children.map((c) => c.code)).toEqual(["3.1", "3.3", "3.4", "3.5"]);
    const oligo = mercados.children[2];
    expect(oligo.title).toBe("Oligopólio");
    expect(oligo.description).toBe("estrutura");
    expect(oligo.children.map((c) => `${c.code} ${c.title}`)).toEqual(["3.4.1 modelos clássicos", "3.4.2 modelos de mark-up"]);
  });

  it("tópico sem subassunto é um conteúdo só, com a lista como descrição", () => {
    const eq = anpec.nodes[0].children[2];
    expect(eq.children).toEqual([]);
    expect(eq.title).toBe("Equilíbrio geral e bem-estar");
    expect(eq.description).toBe("troca pura; troca com produção; caixa de Edgeworth; escolha coletiva; eleitor mediano");
  });

  it("não confunde números do texto (BPM6, 1961–1967) com códigos", () => {
    expect(anpec.nodes[1].children[0].children).toEqual([]);
    const br = anpec.nodes[2].children;
    expect(br[0].title).toBe("1961–1967");
    expect(br[0].description).toContain("PAEG");
    expect(br[1].title).toBe("Tópicos adicionais");
  });
});

describe("cursos: módulos/seções → aulas", () => {
  it("Módulo I informado como concluído vira tema concluído sem aulas", () => {
    expect(valuation.nodes[0]).toMatchObject({ title: "Módulo I", done: true, children: [] });
  });

  it("aulas numeradas dentro de cada módulo, com etiquetas", () => {
    const m2 = valuation.nodes[1];
    expect(m2).toMatchObject({ code: "Módulo II", title: "Análise Fundamentalista & Valuation do Zero ao Avançado" });
    expect(m2.children.map((c) => c.title)).toEqual(["Introdução", "FAQ Bônus"]);
    expect(m2.children[1].tags).toEqual(["bônus"]);
    expect(valuation.nodes[2].children[0].tags).toEqual(["quiz"]);
    expect(valuation.nodes[3].children[0].tags).toEqual(["bônus"]);
    expect(valuation.nodes[4].children[0].tags).toEqual(["áudio"]);
  });

  it("seções sem número são temas; duração vira minutos (arredonda para cima)", () => {
    expect(economia.nodes.map((n) => n.title)).toEqual(["Fundamentos da Economia", "Aulas Bônus"]);
    const aulas = economia.nodes[0].children;
    expect(aulas[0]).toMatchObject({ title: "Capitalismo e o surgimento do livre comércio", durationMinutes: 46 });
    expect(aulas[1].title).toBe("O Básico: Microeconomia X Macroeconomia");
    expect(economia.nodes[1].children[0].durationMinutes).toBe(84); // 01:23:30
    expect(economia.nodes[1].children[1]).toMatchObject({ title: "ESG - os “Nobeis” que falam disso", durationMinutes: null });
  });

  it("contagem de conteúdos e minutos", () => {
    expect(countLeaves(economia.nodes)).toEqual({ leaves: 4, minutes: 46 + 12 + 84 });
    expect(countLeaves(valuation.nodes).leaves).toBe(6); // Módulo I (concluído) + 5 aulas
  });
});

describe("sem PARTE", () => {
  it("o documento inteiro é um plano", () => {
    const r = parseOutline(["Módulo 1 — Básico", "1. Aula A — 10:00", "2. Aula B"], "Meu curso");
    expect(r.plans).toHaveLength(1);
    expect(r.plans[0].name).toBe("Meu curso");
    expect(r.plans[0].nodes[0].children).toHaveLength(2);
  });
});
