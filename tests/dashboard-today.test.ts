import { describe, expect, it } from "vitest";
import { billsDue, studyToday, taskHighlights } from "@/lib/dashboard/today";

const today = "2026-10-22"; // quinta-feira

describe("painel: o que entra em cada quadro", () => {
  it("contas a vencer: próximos 7 dias e atrasadas do mês; ignora pagas e débito automático", () => {
    const b = (id: string, dueDay: number, over: Record<string, unknown> = {}) => ({
      id,
      name: id,
      dueDay,
      autoDebit: false,
      archivedAt: null,
      createdAt: new Date("2026-01-01"),
      amountCents: 1000,
      payments: [] as { month: string }[],
      ...over,
    });
    const list = billsDue(
      [b("luz", 25), b("agua", 10), b("paga", 15, { payments: [{ month: "2026-10" }] }), b("auto", 24, { autoDebit: true }), b("longe", 30), b("virada", 2)],
      today,
    );
    expect(list.map((x) => [x.bill.id, x.date, x.overdue])).toEqual([
      ["virada", "2026-10-02", true],
      ["agua", "2026-10-10", true],
      ["luz", "2026-10-25", false],
    ]);
    // perto da virada do mês, pega o vencimento do mês seguinte
    expect(billsDue([b("virada", 2, { payments: [{ month: "2026-10" }] })], "2026-10-28").map((x) => x.date)).toEqual(["2026-11-02"]);
  });

  it("tarefas em destaque: atrasadas, de hoje e prazos fatais próximos", () => {
    const t = (id: string, dueDate: string | null, over: Record<string, unknown> = {}) => ({ id, title: id, status: "todo" as const, position: 0, dueDate, hardDeadline: false, ...over });
    const r = taskHighlights(
      [t("atrasada", "2026-10-20"), t("hoje", today), t("fatal", "2026-10-30", { hardDeadline: true }), t("normal", "2026-10-30"), t("feita", "2026-10-01", { status: "done" }), t("fatal-longe", "2026-12-01", { hardDeadline: true })],
      today,
    );
    expect(r.list.map((x) => x.id)).toEqual(["atrasada", "hoje", "fatal"]);
    expect(r.more).toBe(0);
  });

  it("estudos de hoje: ordem de horário, concluídos e minutos", () => {
    const s = (status: string, plannedTime: string | null, minutes: number | null, archived = false) => ({ status, plannedTime, plannedMinutes: minutes, durationMinutes: 30, planArchived: archived ? new Date() : null });
    const r = studyToday([s("not_started", null, null), s("done", "08:00", 60), s("not_started", "19:00", 45), s("not_started", "07:00", 10, true)]);
    expect(r.list.map((x) => x.plannedTime)).toEqual(["08:00", "19:00", null]);
    expect(r.done).toBe(1);
    expect(r.minutes).toBe(60 + 45 + 30);
  });
});
