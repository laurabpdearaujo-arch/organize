import type { OutlineNode } from "./outline";

/*
 * Reimportação de um PDF num plano que já existe (função pura, testada em tests/study-merge.test.ts).
 * Regra: NADA do progresso se perde. Itens iguais (mesmo pai e mesmo título; ou mesmo código) são
 * reaproveitados — status, datas e registros continuam. Só o que é novo é criado. Itens que sumiram do
 * PDF são mantidos (vão para o fim) e contados, para a pessoa decidir se exclui.
 */

export type ExistingItem = {
  id: string;
  parentId: string | null;
  position: number;
  code: string | null;
  title: string;
  description: string | null;
  durationMinutes: number | null;
  tags: string[];
};

export type ParentRef = { existing: string } | { temp: string } | null;

export type MergePlan = {
  updates: { id: string; position: number; description: string | null; durationMinutes: number | null; tags: string[] }[];
  inserts: { temp: string; parent: ParentRef; position: number; node: Omit<OutlineNode, "children"> }[];
  /** Itens que não estão mais no PDF (mantidos). */
  missing: string[];
};

export function normKey(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function planMerge(existing: ExistingItem[], incoming: OutlineNode[]): MergePlan {
  const childrenOf = new Map<string | null, ExistingItem[]>();
  for (const e of existing) childrenOf.set(e.parentId, [...(childrenOf.get(e.parentId) ?? []), e]);
  for (const list of childrenOf.values()) list.sort((a, b) => a.position - b.position);

  const out: MergePlan = { updates: [], inserts: [], missing: [] };
  let tempSeq = 0;

  const insertTree = (n: OutlineNode, parent: ParentRef, position: number) => {
    const temp = `t${tempSeq++}`;
    const { children, ...rest } = n;
    out.inserts.push({ temp, parent, position, node: rest });
    children.forEach((c, i) => insertTree(c, { temp }, i));
  };

  const collectMissing = (e: ExistingItem) => {
    out.missing.push(e.id);
    (childrenOf.get(e.id) ?? []).forEach(collectMissing);
  };

  const merge = (parentId: string | null, nodes: OutlineNode[]) => {
    const pool = [...(childrenOf.get(parentId) ?? [])];
    nodes.forEach((n, i) => {
      const key = normKey(n.title);
      let idx = pool.findIndex((e) => normKey(e.title) === key);
      if (idx < 0 && n.code) idx = pool.findIndex((e) => e.code !== null && e.code === n.code);
      if (idx < 0) {
        insertTree(n, parentId === null ? null : { existing: parentId }, i);
        return;
      }
      const [match] = pool.splice(idx, 1);
      out.updates.push({ id: match.id, position: i, description: n.description, durationMinutes: n.durationMinutes, tags: n.tags });
      merge(match.id, n.children);
    });
    // o que sobrou não está mais no PDF: mantém (ao fim, na mesma ordem) e avisa
    pool.forEach((e, k) => {
      out.updates.push({ id: e.id, position: nodes.length + k, description: e.description, durationMinutes: e.durationMinutes, tags: e.tags });
      collectMissing(e);
    });
  };

  merge(null, incoming);
  return out;
}
