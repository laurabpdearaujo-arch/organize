/**
 * Tarefas contra o banco real: criar, mover no quadro, concluir, projetos, feedbacks,
 * calendário e isolamento entre duas usuárias.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { columnOf } from "@/lib/tasks/rules";
import { feedbackInputSchema, taskInputSchema } from "@/lib/tasks/schemas";
import { createTempUser, deleteTempUser } from "./helpers";

let a = "";
let b = "";
let repo: typeof import("@/lib/tasks/repository");
let dbModule: typeof import("@/db");

const task = (over: Record<string, unknown> = {}) => taskInputSchema.parse({ area: "general", title: "Tarefa", ...over });
const today = "2026-10-22";

beforeAll(async () => {
  repo = await import("@/lib/tasks/repository");
  dbModule = await import("@/db");
  a = await createTempUser();
  b = await createTempUser();
}, 30_000);

afterAll(async () => {
  await deleteTempUser(a);
  await deleteTempUser(b);
  await dbModule?.db.$client.end();
}, 30_000);

describe("tarefas", () => {
  it("nova entra no fim da coluna; mover reordena; Feito ganha data e perde ao voltar", async () => {
    const t1 = (await repo.createTask(a, task({ title: "um" }), today))!;
    const t2 = (await repo.createTask(a, task({ title: "dois" }), today))!;
    const t3 = (await repo.createTask(a, task({ title: "três" }), today))!;
    let list = (await repo.listTasks(a)).tasks;
    expect(columnOf(list, "todo").map((t) => t.title)).toEqual(["um", "dois", "três"]);

    expect(await repo.moveTask(a, t3, "todo", 0, today)).toBe(true);
    list = (await repo.listTasks(a)).tasks;
    expect(columnOf(list, "todo").map((t) => t.title)).toEqual(["três", "um", "dois"]);

    expect(await repo.moveTask(a, t1, "done", 0, today)).toBe(true);
    list = (await repo.listTasks(a)).tasks;
    expect(list.find((t) => t.id === t1)).toMatchObject({ status: "done", completedOn: today });
    expect(columnOf(list, "todo").map((t) => t.title)).toEqual(["três", "dois"]);

    expect(await repo.updateTask(a, t1, task({ title: "um", status: "doing" }), today)).toBe(true);
    list = (await repo.listTasks(a)).tasks;
    expect(list.find((t) => t.id === t1)).toMatchObject({ status: "doing", completedOn: null });
    expect(await repo.deleteTask(a, t2)).toBe(true);
  }, 60_000);

  it("prazo fatal exige data; projeto só em carreira; excluir projeto mantém tarefas", async () => {
    expect(taskInputSchema.safeParse({ area: "general", title: "x", hardDeadline: true }).success).toBe(false);
    const pid = await repo.createProject(a, { name: "Mestrado", color: "teal" });
    const general = taskInputSchema.parse({ area: "general", title: "g", projectId: pid });
    expect(general.projectId).toBeNull();
    const tid = (await repo.createTask(a, task({ area: "career", title: "Entregar artigo", projectId: pid, dueDate: "2026-10-30", hardDeadline: true }), today))!;
    expect(await repo.createTask(b, task({ area: "career", title: "projeto alheio", projectId: pid }), today)).toBeNull();

    const cal = await repo.tasksForCalendar(a, "2026-10-01", "2026-10-31");
    expect(cal.find((c) => c.id === tid)).toMatchObject({ hardDeadline: true, area: "career", dueDate: "2026-10-30" });

    expect(await repo.deleteProject(a, pid)).toBe(true);
    expect((await repo.listTasks(a)).tasks.find((t) => t.id === tid)!.projectId).toBeNull();
  }, 60_000);

  it("feedbacks", async () => {
    const fid = await repo.createFeedback(a, feedbackInputSchema.parse({ date: today, fromWhom: "Gestora", content: "Boa apresentação", action: "Repetir o formato" }));
    expect((await repo.listTasks(a)).feedbacks.find((f) => f.id === fid)).toMatchObject({ fromWhom: "Gestora", topic: null });
    expect(await repo.updateFeedback(a, fid, feedbackInputSchema.parse({ date: today, content: "Editado" }))).toBe(true);
  }, 60_000);
});

describe("isolamento entre usuárias (tarefas)", () => {
  it("B não vê, não move, não altera e não apaga nada de A", async () => {
    const tid = (await repo.createTask(a, task({ title: "Da A", dueDate: today }), today))!;
    const pid = await repo.createProject(a, { name: "Da A", color: "violet" });
    const fid = await repo.createFeedback(a, feedbackInputSchema.parse({ date: today, content: "Da A" }));
    const seen = await repo.listTasks(b);
    expect(seen).toEqual({ tasks: [], projects: [], feedbacks: [] });
    expect(await repo.tasksForCalendar(b, "2026-10-01", "2026-10-31")).toEqual([]);
    expect(await repo.moveTask(b, tid, "done", 0, today)).toBe(false);
    expect(await repo.updateTask(b, tid, task({ title: "Invadido" }), today)).toBe(false);
    expect(await repo.deleteTask(b, tid)).toBe(false);
    expect(await repo.updateProject(b, pid, { name: "Invadido", color: "gray" })).toBe(false);
    expect(await repo.deleteProject(b, pid)).toBe(false);
    expect(await repo.updateFeedback(b, fid, feedbackInputSchema.parse({ date: today, content: "Invadido" }))).toBe(false);
    expect(await repo.deleteFeedback(b, fid)).toBe(false);
    const still = await repo.listTasks(a);
    expect(still.tasks.find((t) => t.id === tid)).toMatchObject({ title: "Da A", status: "todo" });
    expect(still.projects.find((p) => p.id === pid)!.name).toBe("Da A");
    expect(still.feedbacks.find((f) => f.id === fid)!.content).toBe("Da A");
  }, 60_000);
});
