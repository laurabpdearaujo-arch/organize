import { describe, expect, it } from "vitest";
import { columnOf, dueLabel, isOverdue, placeInColumn, summary, type TaskLite } from "@/lib/tasks/rules";

const t = (id: string, status: TaskLite["status"], position: number, over: Partial<TaskLite> & { completedOn?: string | null } = {}) => ({
  id,
  status,
  position,
  dueDate: null,
  hardDeadline: false,
  ...over,
});
const today = "2026-10-22";

describe("tarefas", () => {
  it("rótulo do prazo", () => {
    expect(dueLabel("2026-10-19", today)).toEqual({ text: "Atrasada há 3 dias", tone: "overdue" });
    expect(dueLabel("2026-10-21", today).text).toBe("Atrasada (ontem)");
    expect(dueLabel(today, today)).toEqual({ text: "Hoje", tone: "today" });
    expect(dueLabel("2026-10-23", today).text).toBe("Amanhã");
    expect(dueLabel("2026-10-27", today).text).toBe("em 5 dias");
    expect(dueLabel("2026-11-05", today)).toEqual({ text: "05/11", tone: "later" });
  });

  it("atrasada só se não estiver feita", () => {
    expect(isOverdue({ status: "todo", dueDate: "2026-10-21" }, today)).toBe(true);
    expect(isOverdue({ status: "done", dueDate: "2026-10-21" }, today)).toBe(false);
    expect(isOverdue({ status: "doing", dueDate: today }, today)).toBe(false);
    expect(isOverdue({ status: "todo", dueDate: null }, today)).toBe(false);
  });

  it("mover entre colunas e dentro da mesma coluna", () => {
    const tasks = [t("a", "todo", 0), t("b", "todo", 1), t("c", "todo", 2), t("x", "doing", 0)];
    expect(placeInColumn(tasks, "x", "todo", 1)).toEqual([
      { id: "a", position: 0 },
      { id: "x", position: 1 },
      { id: "b", position: 2 },
      { id: "c", position: 3 },
    ]);
    expect(placeInColumn(tasks, "a", "todo", 2).map((p) => p.id)).toEqual(["b", "c", "a"]);
    expect(placeInColumn(tasks, "c", "todo", 0).map((p) => p.id)).toEqual(["c", "a", "b"]);
    expect(placeInColumn(tasks, "a", "done", 99)).toEqual([{ id: "a", position: 0 }]);
  });

  it("coluna Feito: mais recente primeiro", () => {
    const tasks = [t("old", "done", 0, { completedOn: "2026-10-01" }), t("new", "done", 1, { completedOn: "2026-10-20" }), t("o", "todo", 0)];
    expect(columnOf(tasks, "done").map((x) => x.id)).toEqual(["new", "old"]);
  });

  it("resumo", () => {
    const tasks = [
      t("1", "todo", 0, { hardDeadline: true, dueDate: "2026-10-30" }),
      t("2", "doing", 0, { dueDate: "2026-10-20" }),
      t("3", "todo", 1, { dueDate: today }),
      t("4", "done", 0, { hardDeadline: true, dueDate: "2026-10-01" }),
    ];
    expect(summary(tasks, today)).toEqual({ hardOpen: 1, overdue: 1, dueToday: 1, done: 1, total: 4 });
  });
});
