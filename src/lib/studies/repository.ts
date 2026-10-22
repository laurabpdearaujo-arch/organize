import "server-only";
import { and, asc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { studyItems, studyPlans } from "@/db/schema";
import type { OutlineNode } from "./outline";
import type { StudyStatus } from "./progress";

/* Estudos. Todas as funções recebem o userId (de getCurrentUser) e filtram por ele. */

export async function listPlans(userId: string) {
  const [plans, items] = await Promise.all([
    db.select().from(studyPlans).where(eq(studyPlans.userId, userId)).orderBy(asc(studyPlans.createdAt)),
    db.select().from(studyItems).where(eq(studyItems.userId, userId)),
  ]);
  return plans.map((p) => ({ ...p, items: items.filter((i) => i.planId === p.id) }));
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
