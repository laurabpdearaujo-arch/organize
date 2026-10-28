/*
 * Leitor do PDF de conteúdo programático (funções puras, testadas em tests/study-outline.test.ts).
 *
 * Formato esperado (o que a pessoa gera):
 *  - "PARTE I — NOME" inicia um plano (sem "PARTE", o documento inteiro é um plano)
 *  - Planos com tópicos marcados por "•" (ex.: programa da ANPEC):
 *      "1. Microeconomia"                          → tema
 *      "• 1. Demanda — 1.1 Teoria: …; 1.2 Curva: …" → subtema com conteúdos 1.1, 1.2 (3.4.1 fica dentro de 3.4)
 *      "• 4. Equilíbrio geral — troca pura; …"      → conteúdo (a lista vira descrição)
 *      linhas seguintes sem "•" continuam o tópico
 *  - Planos de aulas (ex.: cursos):
 *      "Módulo II — Título" ou linha sem número    → tema
 *      "Módulo I: … concluído …"                    → tema já concluído
 *      "1. Aula — 45:18"                            → aula (duração em minutos)
 *  - Ementas com numeração em níveis (ex.: "anpec ementa"), com ou sem "•":
 *      "1. Matemática" / "1.1 Matemática Básica" / "• 1.1.1 Potenciação"
 *      → a quantidade de números diz o nível (1.1.1 fica dentro de 1.1, que fica dentro de 1).
 *      Sem PARTE e com 3 níveis ou mais, cada item do 1º nível vira um plano.
 */

export type OutlineNode = {
  code: string | null;
  title: string;
  description: string | null;
  durationMinutes: number | null;
  tags: string[];
  done: boolean;
  children: OutlineNode[];
};

export type OutlinePlan = { name: string; nodes: OutlineNode[] };

const DASH = /\s[—–-]\s/; // travessão com espaços (não pega "1930–1945")
const PART_RE = /^PARTE\s+([IVXLC]+|\d+)\s*[—–-]\s*(.+)$/i;
const MODULE_DASH_RE = /^(M[óo]dulo\s+[IVXLC\d]+)\s*[—–-]\s*(.+)$/i;
const MODULE_COLON_RE = /^(M[óo]dulo\s+[IVXLC\d]+)\s*:\s*(.+)$/i;
const BULLET_RE = /^[•·▪●◦]\s*(\d+)\.\s+(.+)$/;
const NUMBERED_RE = /^(\d+)\.\s+(.+)$/;
const CODE_RE = /^(?:[•·▪●◦]\s*)?(\d+(?:\.\d+)*)\.?\s+(\S.*)$/; // "1. X", "1.1 X", "• 1.1.1 X"
const FOOTER_RE = /P[áa]gina\s+\d+(\s+de\s+\d+)?\s*$/i;
const DURATION_RE = /\s[—–-]\s*((\d{1,2}):)?(\d{1,2}):(\d{2})\s*$/;

const node = (over: Partial<OutlineNode> & { title: string }): OutlineNode => ({
  code: null,
  description: null,
  durationMinutes: null,
  tags: [],
  done: false,
  children: [],
  ...over,
});

function cleanTitle(s: string) {
  return s.replace(/\s+/g, " ").replace(/[.;:,\s]+$/, "").trim();
}

function tagsOf(title: string) {
  const tags: string[] = [];
  if (/b[ôo]nus/i.test(title)) tags.push("bônus");
  if (/\bquiz\b/i.test(title)) tags.push("quiz");
  if (/\([áa]udio\)/i.test(title)) tags.push("áudio");
  return tags;
}

/** "1. Aula — 01:23:30" → { title, minutos } */
function lesson(code: string, text: string): OutlineNode {
  const m = DURATION_RE.exec(text);
  let minutes: number | null = null;
  let title = text;
  if (m) {
    const h = m[2] ? Number(m[2]) : 0;
    minutes = Math.ceil(h * 60 + Number(m[3]) + Number(m[4]) / 60);
    title = text.slice(0, m.index);
  }
  title = cleanTitle(title);
  return node({ code, title, durationMinutes: minutes, tags: tagsOf(title) });
}

/** Divide "título — resto" (ou "título: resto"). */
function splitTitle(text: string): [string, string] {
  const d = DASH.exec(text);
  if (d) return [text.slice(0, d.index), text.slice(d.index + d[0].length)];
  const c = text.indexOf(": ");
  if (c > 0) return [text.slice(0, c), text.slice(c + 2)];
  return [text, ""];
}

/** Tópico com "•": vira conteúdo único, ou subtema com subconteúdos numerados (n.k e n.k.m). */
function bullet(n: string, text: string): OutlineNode {
  const [rawTitle, rest] = splitTitle(text);
  const esc = n.replace(/\./g, "\\.");
  const codeRe = new RegExp(`(?:^|\\s)(${esc}(?:\\.\\d+){1,2})\\s+(?=\\S)`, "g");
  const hits = [...rest.matchAll(codeRe)].map((m) => ({ code: m[1], start: m.index! + m[0].indexOf(m[1]), textStart: m.index! + m[0].length }));
  const title = cleanTitle(rawTitle);
  if (hits.length === 0) return node({ code: n, title, description: cleanTitle(rest) || null, tags: tagsOf(title) });

  const top = node({ code: n, title, description: cleanTitle(rest.slice(0, hits[0].start)) || null });
  const byCode = new Map<string, OutlineNode>();
  hits.forEach((h, i) => {
    const seg = rest.slice(h.textStart, i + 1 < hits.length ? hits[i + 1].start : undefined).trim();
    const colon = seg.indexOf(":");
    const segTitle = cleanTitle(colon > 0 ? seg.slice(0, colon) : seg);
    const segDesc = colon > 0 ? cleanTitle(seg.slice(colon + 1)) : null;
    const child = node({ code: h.code, title: segTitle, description: segDesc || null, tags: tagsOf(segTitle) });
    byCode.set(h.code, child);
    const parentCode = h.code.split(".").slice(0, -1).join(".");
    (byCode.get(parentCode) ?? top).children.push(child);
  });
  return top;
}

/** Ementa numerada em níveis: monta a árvore pelos códigos (1.1.1 dentro de 1.1 dentro de 1). */
function parseNumbered(lines: string[], fallbackName: string, hasParts: boolean): { plans: OutlinePlan[]; warnings: string[] } {
  const warnings: string[] = [];
  const chunks: { name: string; roots: OutlineNode[] }[] = hasParts ? [] : [{ name: fallbackName, roots: [] }];
  let byCode = new Map<string, OutlineNode>();
  for (const l of lines) {
    const p = hasParts ? PART_RE.exec(l) : null;
    if (p) {
      chunks.push({ name: cleanTitle(p[2]), roots: [] });
      byCode = new Map();
      continue;
    }
    const chunk = chunks.at(-1);
    if (!chunk) continue; // introdução antes da primeira PARTE
    const m = CODE_RE.exec(l);
    if (!m) {
      // antes do primeiro código é introdução; depois, a linha aparece na revisão
      if (chunk.roots.length) warnings.push(`Linha não reconhecida em “${chunk.name}”: ${l.slice(0, 80)}`);
      continue;
    }
    const code = m[1];
    const n = lesson(code, m[2]);
    byCode.set(code, n);
    // pai = código sem o último número; se ele não existir no PDF, sobe mais um nível
    let parent: OutlineNode | undefined;
    for (let c = code; !parent && c.includes("."); ) {
      c = c.slice(0, c.lastIndexOf("."));
      parent = byCode.get(c);
    }
    (parent ? parent.children : chunk.roots).push(n);
  }

  const plans: OutlinePlan[] = [];
  for (const chunk of chunks) {
    const deep = chunk.roots.some((r) => r.children.some((c) => c.children.length > 0));
    if (!hasParts && deep) {
      // "1. Matemática" → plano Matemática, com os temas 1.1, 1.2… dentro
      for (const r of chunk.roots) plans.push({ name: r.title, nodes: r.children });
    } else {
      plans.push({ name: chunk.name, nodes: chunk.roots });
    }
  }
  return { plans, warnings };
}

/** Recebe as linhas de texto do PDF (na ordem de leitura) e devolve os planos. */
export function parseOutline(rawLines: string[], fallbackName = "Plano de estudos"): { plans: OutlinePlan[]; warnings: string[] } {
  const lines = rawLines.map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l && !FOOTER_RE.test(l));
  const hasParts = lines.some((l) => PART_RE.test(l));

  // Ementa numerada em níveis (1.1, 1.1.1 no começo da linha). O formato com "• 1." (ANPEC antigo)
  // também tem "3.3 …" no começo de linhas quebradas, então ele continua no leitor abaixo.
  const leveled = lines.filter((l) => CODE_RE.exec(l)?.[1].includes(".")).length >= 3; // não por um "2.5" solto
  if (leveled && !lines.some((l) => BULLET_RE.test(l))) return parseNumbered(lines, fallbackName, hasParts);

  // Agrupa as linhas por PARTE (o que vem antes da primeira PARTE é introdução e é ignorado).
  const chunks: { name: string; lines: string[] }[] = [];
  if (!hasParts) chunks.push({ name: fallbackName, lines });
  else {
    for (const l of lines) {
      const p = PART_RE.exec(l);
      if (p) chunks.push({ name: cleanTitle(p[2]), lines: [] });
      else chunks.at(-1)?.lines.push(l);
    }
  }

  const plans: OutlinePlan[] = [];
  const warnings: string[] = [];
  for (const chunk of chunks) {
    const bulletMode = chunk.lines.some((l) => BULLET_RE.test(l));
    const nodes: OutlineNode[] = [];
    let group: OutlineNode | null = null;
    let pending: { n: string; text: string } | null = null; // tópico "•" sendo montado
    const container = () => (group ? group.children : nodes);
    const flush = () => {
      if (pending) container().push(bullet(pending.n, pending.text));
      pending = null;
    };

    for (const l of chunk.lines) {
      let m: RegExpExecArray | null;
      if ((m = MODULE_COLON_RE.exec(l))) {
        flush();
        group = node({ title: cleanTitle(m[1]), description: cleanTitle(m[2]), done: /conclu/i.test(m[2]) });
        nodes.push(group);
      } else if ((m = MODULE_DASH_RE.exec(l))) {
        flush();
        group = node({ code: cleanTitle(m[1]), title: cleanTitle(m[2]) });
        nodes.push(group);
      } else if ((m = BULLET_RE.exec(l))) {
        flush();
        pending = { n: m[1], text: m[2] };
      } else if ((m = NUMBERED_RE.exec(l))) {
        flush();
        if (bulletMode) {
          group = node({ code: m[1], title: cleanTitle(m[2]) });
          nodes.push(group);
        } else {
          container().push(lesson(m[1], m[2]));
        }
      } else if (pending) {
        pending.text += ` ${l}`; // continuação do tópico
      } else if (!bulletMode) {
        group = node({ title: cleanTitle(l) }); // linha sem número = tema (ex.: "Fundamentos da Economia")
        nodes.push(group);
      } else {
        warnings.push(`Linha não reconhecida em “${chunk.name}”: ${l.slice(0, 80)}`);
      }
    }
    flush();
    plans.push({ name: chunk.name, nodes });
  }
  return { plans, warnings };
}

/** Conteúdos a estudar = folhas da árvore (inclusive tema vazio já concluído). */
export function countLeaves(nodes: OutlineNode[]): { leaves: number; minutes: number } {
  let leaves = 0;
  let minutes = 0;
  for (const n of nodes) {
    if (n.children.length === 0) {
      leaves++;
      minutes += n.durationMinutes ?? 0;
    } else {
      const c = countLeaves(n.children);
      leaves += c.leaves;
      minutes += c.minutes;
    }
  }
  return { leaves, minutes };
}
