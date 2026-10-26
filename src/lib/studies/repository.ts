import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { studyItems, studyLogs, studyPlans } from "@/db/schema";
import { planMerge } from "./merge";
import { insertIndex } from "./placement";
import type { OutlineNode } from "./outline";
import type { StudyStatus } from "./progress";

/* Estudos. Todas as funções recebem o userId (de getCurrentUser) e filtram por ele. */

export async function listPlans(userId: string) {
  const [plans, items, logs] = await Promise.all([
    db.select().from(studyPlans).where(eq(studyPlans.userId, userId)).orderBy(asc(studyPlans.createdAt)),
    db.select().from(studyItems).where(eq(studyItems.userId, userId)),
    db.select().from(studyLogs).where(eq(studyLogs.userId, userId)).orderBy(desc(studyLogs.date), desc(studyLogs.createdAt)),
  ]);
  const planOfItem = new Map(items.map((i) => [i.id, i.planId]));
  return plans.map((p) => ({
    ...p,
    items: items.filter((i) => i.planId === p.id),
    logs: logs.filter((l) => planOfItem.get(l.itemId) === p.id),
  }));
}

async function ownedItem(userId: string, id: string) {
  const [i] = await db.select().from(studyItems).where(and(eq(studyItems.id, id), eq(studyItems.userId, userId)));
  return i ?? null;
}

// ---------- registros de estudo ----------

export type LogValues = {
  date: string;
  minutes: number | null;
  questionsDone: number | null;
  questionsCorrect: number | null;
  difficulties: string | null;
  mistakes: string | null;
};

/** Registra um estudo. O primeiro registro de um conteúdo "não iniciado" o deixa "em andamento". */
export async function addLog(userId: string, itemId: string, v: LogValues) {
  const item = await ownedItem(userId, itemId);
  if (!item) return false;
  await db.transaction(async (tx) => {
    await tx.insert(studyLogs).values({ ...v, userId, itemId });
    if (item.status === "not_started") await tx.update(studyItems).set({ status: "in_progress" }).where(eq(studyItems.id, itemId));
  });
  return true;
}

export async function deleteLog(userId: string, id: string) {
  const r = await db.delete(studyLogs).where(and(eq(studyLogs.id, id), eq(studyLogs.userId, userId))).returning({ id: studyLogs.id });
  return r.length > 0;
}

// ---------- edição da estrutura ----------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Quem ganhou itens dentro vira grupo (e deixa de contar como conteúdo). */
async function markGroups(tx: Tx, planId: string) {
  await tx.execute(sql`
    update study_items p set is_group = true
    where p.plan_id = ${planId} and not p.is_group
      and exists (select 1 from study_items c where c.parent_id = p.id)`);
}

export async function updateItemDetails(
  userId: string,
  id: string,
  v: { code: string | null; title: string; description: string | null; notes: string | null; durationMinutes: number | null },
) {
  const r = await db.update(studyItems).set(v).where(and(eq(studyItems.id, id), eq(studyItems.userId, userId))).returning({ id: studyItems.id });
  return r.length > 0;
}

/** Adiciona um item dentro de `parentId` (null = tema novo): na ordem do código, ou no fim se não tiver código. */
export async function addItem(
  userId: string,
  planId: string,
  parentId: string | null,
  v: { code: string | null; title: string; durationMinutes: number | null; isGroup: boolean },
) {
  const [plan] = await db.select({ id: studyPlans.id }).from(studyPlans).where(and(eq(studyPlans.id, planId), eq(studyPlans.userId, userId)));
  if (!plan) return false;
  return db.transaction(async (tx) => {
    if (parentId) {
      const [parent] = await tx.select({ id: studyItems.id }).from(studyItems).where(and(eq(studyItems.id, parentId), eq(studyItems.planId, planId)));
      if (!parent) return false;
    }
    const sameParent = and(eq(studyItems.planId, planId), parentId ? eq(studyItems.parentId, parentId) : isNull(studyItems.parentId));
    const siblings = await tx.select().from(studyItems).where(sameParent).orderBy(asc(studyItems.position), asc(studyItems.createdAt));
    const idx = insertIndex(siblings, v.code);
    const position = idx < siblings.length ? siblings[idx].position : (siblings.at(-1)?.position ?? -1) + 1;
    if (idx < siblings.length) {
      await tx
        .update(studyItems)
        .set({ position: sql`${studyItems.position} + 1` })
        .where(and(sameParent, gte(studyItems.position, position)));
    }
    await tx.insert(studyItems).values({
      userId,
      planId,
      parentId,
      position,
      code: v.code,
      title: v.title,
      isGroup: v.isGroup,
      durationMinutes: v.isGroup ? null : v.durationMinutes,
    });
    if (parentId) await markGroups(tx, planId);
    return true;
  });
}

/** Troca de lugar com o vizinho de cima ou de baixo (mesmo pai). */
export async function moveItem(userId: string, id: string, direction: "up" | "down") {
  const item = await ownedItem(userId, id);
  if (!item) return false;
  const siblings = await db
    .select()
    .from(studyItems)
    .where(and(eq(studyItems.planId, item.planId), item.parentId ? eq(studyItems.parentId, item.parentId) : isNull(studyItems.parentId)))
    .orderBy(asc(studyItems.position), asc(studyItems.createdAt));
  const i = siblings.findIndex((s) => s.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= siblings.length) return true;
  // renumera para garantir posições distintas e troca as duas
  const order = siblings.map((s) => s.id);
  [order[i], order[j]] = [order[j], order[i]];
  await db.transaction(async (tx) => {
    for (const [pos, sid] of order.entries()) await tx.update(studyItems).set({ position: pos }).where(eq(studyItems.id, sid));
  });
  return true;
}

/** Exclui o item e tudo que está dentro dele (e os registros). */
export async function deleteItem(userId: string, id: string) {
  const r = await db.delete(studyItems).where(and(eq(studyItems.id, id), eq(studyItems.userId, userId))).returning({ id: studyItems.id });
  return r.length > 0;
}

// ---------- reimportação ----------

/** Junta um PDF novo a um plano existente sem perder status, datas e registros. */
export async function mergeIntoPlan(userId: string, planId: string, nodes: OutlineNode[]) {
  const [plan] = await db.select({ id: studyPlans.id }).from(studyPlans).where(and(eq(studyPlans.id, planId), eq(studyPlans.userId, userId)));
  if (!plan) return null;
  const existing = await db.select().from(studyItems).where(eq(studyItems.planId, planId));
  const m = planMerge(existing, nodes);
  await db.transaction(async (tx) => {
    for (const u of m.updates) {
      await tx.update(studyItems).set({ position: u.position, description: u.description, durationMinutes: u.durationMinutes, tags: u.tags }).where(eq(studyItems.id, u.id));
    }
    const realId = new Map<string, string>();
    for (const ins of m.inserts) {
      const parentId = ins.parent === null ? null : "existing" in ins.parent ? ins.parent.existing : realId.get(ins.parent.temp)!;
      const [row] = await tx
        .insert(studyItems)
        .values({
          userId,
          planId,
          parentId,
          position: ins.position,
          code: ins.node.code,
          title: ins.node.title,
          description: ins.node.description,
          durationMinutes: ins.node.durationMinutes,
          tags: ins.node.tags,
          status: (ins.node.done ? "done" : "not_started") as StudyStatus,
        })
        .returning({ id: studyItems.id });
      realId.set(ins.temp, row.id);
    }
    await markGroups(tx, planId);
  });
  return { added: m.inserts.length, kept: m.updates.length - m.missing.length, missing: m.missing.length };
}
export type PlanList = Awaited<ReturnType<typeof listPlans>>;

/** Cria os planos e a árvore de itens (tudo ou nada). */
export async function importPlans(userId: string, fileName: string, plans: { name: string; color: string; nodes: OutlineNode[] }[]) {
  return db.transaction(async (tx) => {
    const created: string[] = [];
    for (const p of plans) {
      const [plan] = await tx.insert(studyPlans).values({ userId, name: p.name, color: p.color, sourceFileName: fileName }).returning({ id: studyPlans.id });
      created.push(plan.id);
      // insere nível por nível (o pai precisa existir antes dos filhos)
      let level: { parentId: string | null; nodes: OutlineNode[] }[] = [{ parentId: null, nodes: p.nodes }];
      while (level.length) {
        const next: typeof level = [];
        for (const { parentId, nodes } of level) {
          if (!nodes.length) continue;
          const rows = await tx
            .insert(studyItems)
            .values(
              nodes.map((n, position) => ({
                userId,
                planId: plan.id,
                parentId,
                position,
                code: n.code,
                title: n.title,
                isGroup: n.children.length > 0,
                description: n.description,
                durationMinutes: n.durationMinutes,
                tags: n.tags,
                status: (n.done ? "done" : "not_started") as StudyStatus,
              })),
            )
            .returning({ id: studyItems.id });
          rows.forEach((r, i) => next.push({ parentId: r.id, nodes: nodes[i].children }));
        }
        level = next;
      }
    }
    return created;
  });
}

export async function updateItem(
  userId: string,
  id: string,
  patch: { status?: StudyStatus; plannedDate?: string | null; plannedTime?: string | null; plannedMinutes?: number | null; notes?: string | null },
) {
  const r = await db
    .update(studyItems)
    .set(patch)
    .where(and(eq(studyItems.id, id), eq(studyItems.userId, userId)))
    .returning({ id: studyItems.id });
  return r.length > 0;
}

/** Muda o status de vários itens de uma vez (ex.: marcar um tema inteiro como concluído). */
export async function setStatusMany(userId: string, ids: string[], status: StudyStatus) {
  if (!ids.length) return 0;
  const r = await db
    .update(studyItems)
    .set({ status })
    .where(and(eq(studyItems.userId, userId), inArray(studyItems.id, ids)))
    .returning({ id: studyItems.id });
  return r.length;
}

export async function updatePlan(userId: string, id: string, v: { name: string; objective: string | null; color: string }) {
  const r = await db.update(studyPlans).set(v).where(and(eq(studyPlans.id, id), eq(studyPlans.userId, userId))).returning({ id: studyPlans.id });
  return r.length > 0;
}

export async function setPlanArchived(userId: string, id: string, archived: boolean) {
  const r = await db
    .update(studyPlans)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(studyPlans.id, id), eq(studyPlans.userId, userId)))
    .returning({ id: studyPlans.id });
  return r.length > 0;
}

export async function deletePlan(userId: string, id: string) {
  const r = await db.delete(studyPlans).where(and(eq(studyPlans.id, id), eq(studyPlans.userId, userId))).returning({ id: studyPlans.id });
  return r.length > 0;
}

/** Conteúdos agendados entre as datas (para o calendário), com nome e cor do plano. */
export async function plannedItems(userId: string, from: string, to: string) {
  return db
    .select({
      id: studyItems.id,
      planId: studyItems.planId,
      code: studyItems.code,
      title: studyItems.title,
      status: studyItems.status,
      plannedDate: studyItems.plannedDate,
      plannedTime: studyItems.plannedTime,
      plannedMinutes: studyItems.plannedMinutes,
      durationMinutes: studyItems.durationMinutes,
      planName: studyPlans.name,
      planColor: studyPlans.color,
      planArchived: studyPlans.archivedAt,
    })
    .from(studyItems)
    .innerJoin(studyPlans, eq(studyPlans.id, studyItems.planId))
    .where(
      and(
        eq(studyItems.userId, userId),
        isNotNull(studyItems.plannedDate),
        gte(studyItems.plannedDate, from),
        lte(studyItems.plannedDate, to),
      ),
    );
}
