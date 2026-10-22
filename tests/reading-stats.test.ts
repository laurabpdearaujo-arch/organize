import { describe, expect, it } from "vitest";
import { bookSummary, daysLeft, pace, pagesByDay, percent, type BookLite, type ProgressRow } from "@/lib/reading/stats";

const r = (date: string, pagesRead: number, bookId = "b1"): ProgressRow => ({ bookId, date, pagesRead });

describe("ritmo de leitura", () => {
  const today = "2026-10-22";

  it("sem registros ou sem páginas: sem ritmo", () => {
    expect(pace([], today)).toBeNull();
    expect(pace([r("2026-10-20", 0)], today)).toBeNull();
  });

  it("começou há poucos dias: divide pelos dias desde o primeiro registro (dias sem leitura contam)", () => {
    // 20, 21 e 22: 30 + 0 + 30 = 60 em 3 dias
    expect(pace([r("2026-10-20", 30), r("2026-10-22", 30)], today)).toBe(20);
  });

  it("janela de 14 dias: o que é mais antigo não entra", () => {
    const rows = [r("2026-09-01", 500), r("2026-10-09", 70), r("2026-10-22", 70)];
    expect(pace(rows, today)).toBe(10); // 140 / 14
  });

  it("correção para trás desconta", () => {
    expect(pace([r("2026-10-22", 50), r("2026-10-21", -10)], today)).toBe(20); // 40 / 2
  });

  it("estimativa de dias e porcentagem", () => {
    expect(daysLeft({ totalPages: 300, currentPage: 100 }, 20)).toBe(10);
    expect(daysLeft({ totalPages: 300, currentPage: 101 }, 20)).toBe(10);
    expect(daysLeft({ totalPages: 300, currentPage: 300 }, 20)).toBe(0);
    expect(daysLeft({ totalPages: null, currentPage: 10 }, 20)).toBeNull();
    expect(daysLeft({ totalPages: 300, currentPage: 10 }, null)).toBeNull();
    expect(percent({ totalPages: 200, currentPage: 50 })).toBe(0.25);
    expect(percent({ totalPages: null, currentPage: 50 })).toBe(0);
  });

  it("páginas por dia preenche dias vazios e nunca fica negativo", () => {
    expect(pagesByDay([r("2026-10-21", 10), r("2026-10-21", 5, "b2"), r("2026-10-22", -3)], "2026-10-20", "2026-10-22")).toEqual([
      { date: "2026-10-20", pages: 0 },
      { date: "2026-10-21", pages: 15 },
      { date: "2026-10-22", pages: 0 },
    ]);
  });

  it("resumo: lendo, lidos no ano, páginas da semana", () => {
    const b = (id: string, status: BookLite["status"], finishedOn: string | null = null): BookLite => ({ id, status, totalPages: 100, currentPage: 0, finishedOn });
    const books = [b("1", "reading"), b("2", "read", "2026-03-01"), b("3", "read", "2025-12-30"), b("4", "want")];
    expect(bookSummary(books, [r("2026-10-15", 99), r("2026-10-20", 12)], today)).toEqual({ reading: 1, readThisYear: 1, pagesLast7: 12, want: 1 });
  });
});
