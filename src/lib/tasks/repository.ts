import { and, asc, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { feedbacks, taskProjects, tasks } from "@/db/schema";
import { placeInColumn, type TaskStatus } from "./rules";
import type { FeedbackInput, TaskInput } from "./schemas";

/* Tarefas, projetos e feedbacks. Todas as funções recebem o userId (de getCurrentUser) e filtram por ele. */

export async function listTasks(userId: string) {
  const [taskRows, projects, feedbackRows] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.userId, userId)).orderBy(asc(tasks.position), asc(tasks.createdAt)),
    db.select().from(taskProjects).where(eq(taskProjects.userId, userId)).orderBy(asc(taskProjects.createdAt)),
    db.select().from(feedbacks).where(eq(feedbacks.userId, userId)).orderBy(desc(feedbacks.date), desc(feedbacks.createdAt)),
  ]);
  return { tasks: taskRows, projects, feedbacks: feedbackRows };
}
export type TasksData = Awaited<ReturnType<typeof listTasks>>;

async function projectOk(userId: string, projectId: string | null) {
  if (!projectId) return true;
  const [p] = await db.select({ id: taskProjects.id }).from(taskProjects).where(and(eq(taskProjects.id, projectId), eq(taskProjects.userId, userId)));
  return !!p;
}

/** Tarefa nova entra no fim da coluna. */
export async function createTask(userId: string, v: TaskInput, today: string) {
  if (!(await projectOk(userId, v.projectId))) return null;
  const [{ max }] = await db
    .select({ max: sql<number | null>`max(${tasks.position})` })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.area, v.area), eq(tasks.status, v.status)));
  const [row] = await db
    .insert(tasks)
    .values({ userId, ...v, position: (max ?? -1) + 1, completedOn: v.status === "done" ? today : null })
    .returning({ id: tasks.id });
  return row.id;
}

export async function updateTask(userId: string, id: string, v: TaskInput, today: string) {
  if (!(await projectOk(userId, v.projectId))) return false;
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    if (!cur) return false;
    const moved = cur.status !== v.status || cur.area !== v.area;
    let position = cur.position;
    if (moved) {
      const [{ max }] = await tx
        .select({ max: sql<number | null>`max(${tasks.position})` })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), eq(tasks.area, v.area), eq(tasks.status, v.status)));
      position = (max ?? -1) + 1;
    }
    await tx
      .update(tasks)
      .set({ ...v, position, completedOn: v.status === "done" ? (cur.status === "done" ? cur.completedOn : today) : null })
      .where(eq(tasks.id, id));
    return true;
  });
}

/** Arrastar no quadro: muda a coluna e a ordem (renumera a coluna de destino). */
export async function moveTask(userId: string, id: string, status: TaskStatus, index: number, today: string) {
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    if (!cur) return false;
    const col = await tx
      .select({ id: tasks.id, status: tasks.status, position: tasks.position, dueDate: tasks.dueDate, hardDeadline: tasks.hardDeadline })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.area, cur.area), eq(tasks.status, status)));
    const placed = placeInColumn([...col, { ...cur }], id, status, index);
    for (const p of placed) {
      if (p.id === id) {
        const completedOn = status === "done" ? (cur.status === "done" ? cur.completedOn : today) : null;
        await tx.update(tasks).set({ status, position: p.position, completedOn }).where(eq(tasks.id, id));
      } else {
        await tx.update(tasks).set({ position: p.position }).where(eq(tasks.id, p.id));
      }
    }
    return true;
  });
}

export async function deleteTask(userId: string, id: string) {
  const r = await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId))).returning({ id: tasks.id });
  return r.length > 0;
}

/** Tarefas com prazo entre as datas (para o calendário). */
export async function tasksForCalendar(userId: string, from: string, to: string) {
  return db
    .select({ id: tasks.id, area: tasks.area, title: tasks.title, status: tasks.status, dueDate: tasks.dueDate, hardDeadline: tasks.hardDeadline })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), isNotNull(tasks.dueDate), gte(tasks.dueDate, from), lte(tasks.dueDate, to)));
}

// ---------- projetos ----------

export async function createProject(userId: string, v: { name: string; color: string }) {
  const [row] = await db
    .insert(taskProjects)
    .values({ userId, ...v })
    .returning({ id: taskProjects.id });
  return row.id;
}

export async function updateProject(userId: string, id: string, v: { name: string; color: string; archived?: boolean }) {
  const r = await db
    .update(taskProjects)
    .set({ name: v.name, color: v.color, ...(v.archived === undefined ? {} : { archivedAt: v.archived ? new Date() : null }) })
    .where(and(eq(taskProjects.id, id), eq(taskProjects.userId, userId)))
    .returning({ id: taskProjects.id });
  return r.length > 0;
}

/** Excluir projeto não apaga as tarefas: elas ficam "sem projeto". */
export async function deleteProject(userId: string, id: string) {
  const r = await db.delete(taskProjects).where(and(eq(taskProjects.id, id), eq(taskProjects.userId, userId))).returning({ id: taskProjects.id });
  return r.length > 0;
}

// ---------- feedbacks ----------

export async function createFeedback(userId: string, v: FeedbackInput) {
  const [row] = await db
    .insert(feedbacks)
    .values({ userId, ...v })
    .returning({ id: feedbacks.id });
  return row.id;
}

export async function updateFeedback(userId: string, id: string, v: FeedbackInput) {
  const r = await db
    .update(feedbacks)
    .set(v)
    .where(and(eq(feedbacks.id, id), eq(feedbacks.userId, userId)))
    .returning({ id: feedbacks.id });
  return r.length > 0;
}

export async function deleteFeedback(userId: string, id: string) {
  const r = await db.delete(feedbacks).where(and(eq(feedbacks.id, id), eq(feedbacks.userId, userId))).returning({ id: feedbacks.id });
  return r.length > 0;
}
