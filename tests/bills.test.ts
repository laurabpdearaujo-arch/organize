import { describe, expect, it } from "vitest";
import { billStatus, dueDateIn, reminderDates, type BillLite } from "@/lib/finance/bills";

const bill = (over: Partial<BillLite> = {}): BillLite => ({ id: "b", dueDay: 10, autoDebit: false, archivedAt: null, createdAt: "2026-01-01", ...over });

describe("vencimento no mês", () => {
  it("dia 31 vira o último dia em meses curtos", () => {
    expect(dueDateIn("2026-02", 31)).toBe("2026-02-28");
    expect(dueDateIn("2028-02", 30)).toBe("2028-02-29");
    expect(dueDateIn("2026-04", 31)).toBe("2026-04-30");
    expect(dueDateIn("2026-05", 31)).toBe("2026-05-31");
  });
});

describe("situação da conta", () => {
  const today = "2026-10-21";
  it("sem débito automático: pendente até o vencimento, depois atrasada; paga quando marcada", () => {
    expect(billStatus(bill({ dueDay: 25 }), "2026-10", new Set(), today)).toBe("pending");
    expect(billStatus(bill({ dueDay: 21 }), "2026-10", new Set(), today)).toBe("pending"); // vence hoje
    expect(billStatus(bill({ dueDay: 10 }), "2026-10", new Set(), today)).toBe("overdue");
    expect(billStatus(bill({ dueDay: 10 }), "2026-10", new Set(["2026-10"]), today)).toBe("paid");
    expect(billStatus(bill({ dueDay: 10 }), "2026-11", new Set(["2026-10"]), today)).toBe("pending"); // outro mês
  });

  it("débito automático nunca fica atrasado", () => {
    expect(billStatus(bill({ autoDebit: true, dueDay: 5 }), "2026-10", new Set(), today)).toBe("auto_done");
    expect(billStatus(bill({ autoDebit: true, dueDay: 28 }), "2026-10", new Set(), today)).toBe("auto_upcoming");
  });
});

describe("lembretes no calendário", () => {
  it("só contas sem débito automático e não arquivadas, mês a mês no intervalo", () => {
    const bills = [
      bill({ id: "luz", dueDay: 31 }),
      bill({ id: "net", dueDay: 5, autoDebit: true }),
      bill({ id: "velha", dueDay: 3, archivedAt: "2026-05-01" }),
    ];
    expect(reminderDates(bills, "2026-01-25", "2026-03-10")).toEqual([
      { billId: "luz", date: "2026-01-31", month: "2026-01" },
      { billId: "luz", date: "2026-02-28", month: "2026-02" },
    ]);
  });

  it("virada de ano", () => {
    expect(reminderDates([bill({ id: "x", dueDay: 15 })], "2026-12-01", "2027-01-31").map((r) => r.date)).toEqual(["2026-12-15", "2027-01-15"]);
  });
});
