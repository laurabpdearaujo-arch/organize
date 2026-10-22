/*
 * Regras das tarefas (funções puras, testadas em tests/tasks-rules.test.ts).
 * Datas como texto "AAAA-MM-DD".
 */
import { daysBetween } from "@/lib/habits/dates";

export type TaskArea = "general" | "career";
export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "low" | "medium" | "high";

export const STATUS_ORDER: TaskStatus[] = ["todo", "doing", "done"];
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: "A fazer", doing: "Fazendo", done: "Feito" };
export const PRIORITY_LABEL: Record<TaskPriority, string> = { low: "Baixa", medium: "Média", high: "Alta" };
export const AREA_LABEL: Record<TaskArea, string> = { general: "Geral", career: "Carreira" };

export type TaskLite = { id: string; status: TaskStatus; dueDate: string | null; hardDeadline: boolean; position: number; projectId?: string | null };

export const isOverdue = (t: Pick<TaskLite, "status" | "dueDate">, today: string) => t.status !== "done" && !!t.dueDate && t.dueDate < today;

/** "Hoje", "Amanhã", "Atrasada há 3 dias", "em 5 dias" ou a data (dd/mm). */
export function dueLabel(due: string, today: string): { text: string; tone: "overdue" | "today" | "soon" | "later" } {
  const d = daysBetween(today, due);
  if (d < 0) return { text: d === -1 ? "Atrasada (ontem)" : `Atrasada há ${-d} dias`, tone: "overdue" };
  if (d === 0) return { text: "Hoje", tone: "today" };
  if (d === 1) return { text: "Amanhã", tone: "soon" };
  if (d <= 6) return { text: `em ${d} dias`, tone: "soon" };
  return { text: `${due.slice(8, 10)}/${due.slice(5, 7)}`, tone: "later" };
}

/** Ordem da coluna: posição; em "Feito", o concluído mais recente primeiro. */
export function columnOf<T extends TaskLite & { completedOn?: string | null }>(tasks: T[], status: TaskStatus): T[] {
  const col = tasks.filter((t) => t.status === status);
  if (status === "done") return col.sort((a, b) => (b.completedOn ?? "").localeCompare(a.completedOn ?? "") || a.position - b.position);
  return col.sort((a, b) => a.position - b.position);
}

/**
 * Move uma tarefa para `status` na posição `index` (contada sem a própria tarefa).
 * Devolve as novas posições das tarefas da coluna de destino, na ordem.
 */
export function placeInColumn<T extends TaskLite>(tasks: T[], id: string, status: TaskStatus, index: number): { id: string; position: number }[] {
  const col = tasks.filter((t) => t.status === status && t.id !== id).sort((a, b) => a.position - b.position);
  const i = Math.max(0, Math.min(index, col.length));
  const ids = [...col.slice(0, i).map((t) => t.id), id, ...col.slice(i).map((t) => t.id)];
  return ids.map((x, position) => ({ id: x, position }));
}

export function summary(tasks: TaskLite[], today: string) {
  const open = tasks.filter((t) => t.status !== "done");
  return {
    hardOpen: open.filter((t) => t.hardDeadline).length,
    overdue: open.filter((t) => isOverdue(t, today)).length,
    dueToday: open.filter((t) => t.dueDate === today).length,
    done: tasks.length - open.length,
    total: tasks.length,
  };
}
