/*
 * Onde entra um conteúdo novo (funções puras, testadas em tests/study-placement.test.ts).
 * Os códigos são locais a cada tema (o "1.1" de Microeconomia não é o "1.1" de Macroeconomia),
 * por isso o pai é procurado só dentro do tema escolhido.
 */

export type PlaceItem = { id: string; parentId: string | null; position: number; code: string | null; title: string };

const segments = (code: string) =>
  code
    .trim()
    .replace(/\.+$/, "")
    .split(".")
    .map((s) => s.trim())
    .filter(Boolean);

const normCode = (code: string) => segments(code).join(".");

/** Compara códigos por partes, como números quando der: "3.10" vem depois de "3.9". */
export function compareCodes(a: string, b: string): number {
  const x = segments(a);
  const y = segments(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const nx = Number(x[i]);
    const ny = Number(y[i]);
    const c = Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : x[i].localeCompare(y[i], "pt-BR", { numeric: true });
    if (c !== 0) return c;
  }
  return x.length - y.length;
}

export function childrenOf<T extends PlaceItem>(items: T[], parentId: string | null): T[] {
  return items.filter((i) => i.parentId === parentId).sort((a, b) => a.position - b.position);
}

/** O tema e tudo que está dentro dele, na ordem da árvore, com a profundidade (tema = 0). */
export function descendants<T extends PlaceItem>(items: T[], themeId: string): { item: T; depth: number }[] {
  const theme = items.find((i) => i.id === themeId);
  if (!theme) return [];
  const out: { item: T; depth: number }[] = [];
  const walk = (it: T, depth: number) => {
    out.push({ item: it, depth });
    for (const c of childrenOf(items, it.id)) walk(c, depth + 1);
  };
  walk(theme, 0);
  return out;
}

/**
 * Pai sugerido pelo código, dentro do tema: "3.4" → item de código "3"; "3.4.1" → "3.4";
 * "8" (uma parte só) → o próprio tema. `undefined` = código vazio ou pai não encontrado.
 */
export function parentByCode(items: PlaceItem[], themeId: string, code: string): string | undefined {
  const s = segments(code);
  if (!s.length) return undefined;
  if (s.length === 1) return themeId;
  const want = s.slice(0, -1).join(".");
  return descendants(items, themeId).find(({ item, depth }) => depth > 0 && item.code && normCode(item.code) === want)?.item.id;
}

/** Posição (índice entre os irmãos já ordenados): sem código, no fim; com código, antes do primeiro irmão de código maior. */
export function insertIndex(siblings: PlaceItem[], code: string | null): number {
  if (!code || !segments(code).length) return siblings.length;
  const i = siblings.findIndex((s) => s.code && segments(s.code).length && compareCodes(s.code, code) > 0);
  return i === -1 ? siblings.length : i;
}

export const label = (i: Pick<PlaceItem, "code" | "title">) => (i.code ? `${i.code} ${i.title}` : i.title);
