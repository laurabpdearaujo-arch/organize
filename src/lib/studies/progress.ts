/*
 * Árvore e progresso dos planos de estudo (funções puras, testadas em tests/study-progress.test.ts).
 * Conteúdos a estudar = folhas que não são grupo (temas/subtemas vazios não contam). Progresso: concluído = 1, parcialmente = 0,5.
 */

export type StudyStatus = "not_started" | "in_progress" | "partial" | "done";

export const STATUS_LABEL: Record<StudyStatus, string> = {
  not_started: "Não iniciado",
  in_progress: "Em andamento",
  partial: "Parcialmente",
  done: "Concluído",
};

export type ItemLite = {
  id: string;
  parentId: string | null;
  position: number;
  status: StudyStatus;
  isGroup: boolean;
  durationMinutes: number | null;
  plannedDate: string | null;
};

export type TreeNode<T extends ItemLite> = T & { children: TreeNode<T>[] };

export function buildTree<T extends ItemLite>(items: T[]): TreeNode<T>[] {
  const byId = new Map<string, TreeNode<T>>(items.map((i) => [i.id, { ...i, children: [] }]));
  const roots: TreeNode<T>[] = [];
  for (const n of byId.values()) {
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    (parent ? parent.children : roots).push(n);
  }
  const sort = (list: TreeNode<T>[]) => {
    list.sort((a, b) => a.position - b.position);
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

export type Stats = { total: number; done: number; partial: number; inProgress: number; scheduled: number; minutes: number; minutesDone: number };

export function stats<T extends ItemLite>(nodes: TreeNode<T>[]): Stats {
  const s: Stats = { total: 0, done: 0, partial: 0, inProgress: 0, scheduled: 0, minutes: 0, minutesDone: 0 };
  const walk = (list: TreeNode<T>[]) => {
    for (const n of list) {
      if (isGroup(n)) {
        walk(n.children);
        continue;
      }
      s.total++;
      s.minutes += n.durationMinutes ?? 0;
      if (n.status === "done") {
        s.done++;
        s.minutesDone += n.durationMinutes ?? 0;
      }
      if (n.status === "partial") s.partial++;
      if (n.status === "in_progress") s.inProgress++;
      if (n.plannedDate && n.status !== "done") s.scheduled++;
    }
  };
  walk(nodes);
  return s;
}

/** 0–1. Concluído = 1, parcialmente = 0,5. */
export function progress(s: Stats) {
  return s.total === 0 ? 0 : (s.done + s.partial * 0.5) / s.total;
}

/** Tema/subtema: marcado como grupo ou com itens dentro. */
export const isGroup = (n: { isGroup: boolean; children: unknown[] }) => n.isGroup || n.children.length > 0;

/** Conteúdos de um nó (ou ele mesmo, se for conteúdo). */
export function leavesOf<T extends ItemLite>(n: TreeNode<T>): TreeNode<T>[] {
  return isGroup(n) ? n.children.flatMap(leavesOf) : [n];
}
