/*
 * Ritmo de leitura e resumos (funções puras, testadas em tests/reading-stats.test.ts).
 * Datas como texto "AAAA-MM-DD".
 */
import { addDays, daysBetween } from "@/lib/habits/dates";

export type BookStatus = "want" | "reading" | "read" | "dropped";
export type MediaStatus = "want" | "watching" | "watched";
export type MediaKind = "movie" | "series";

export const BOOK_STATUS_LABEL: Record<BookStatus, string> = { want: "Quero ler", reading: "Lendo", read: "Lido", dropped: "Abandonado" };
export const MEDIA_STATUS_LABEL: Record<MediaStatus, string> = { want: "Quero ver", watching: "Vendo", watched: "Visto" };
export const MEDIA_KIND_LABEL: Record<MediaKind, string> = { movie: "Filme", series: "Série" };

export type ProgressRow = { bookId: string; date: string; pagesRead: number };
export type BookLite = { id: string; status: BookStatus; totalPages: number | null; currentPage: number; finishedOn: string | null };

export const PACE_WINDOW = 14;

/** Páginas por dia, em média, nos últimos 14 dias (ou desde o primeiro registro, se for mais recente). null = sem ritmo. */
export function pace(rows: ProgressRow[], today: string): number | null {
  if (!rows.length) return null;
  const from = addDays(today, -(PACE_WINDOW - 1));
  const first = rows.reduce((m, r) => (r.date < m ? r.date : m), rows[0].date);
  const total = rows.filter((r) => r.date >= from && r.date <= today).reduce((s, r) => s + r.pagesRead, 0);
  if (total <= 0) return null;
  const days = Math.min(PACE_WINDOW, daysBetween(first, today) + 1);
  return total / Math.max(1, days);
}

/** Dias que faltam para terminar no ritmo atual. null = sem nº de páginas ou sem ritmo. */
export function daysLeft(book: Pick<BookLite, "totalPages" | "currentPage">, p: number | null): number | null {
  if (!book.totalPages || !p) return null;
  const left = book.totalPages - book.currentPage;
  return left <= 0 ? 0 : Math.ceil(left / p);
}

export function percent(book: Pick<BookLite, "totalPages" | "currentPage">): number {
  if (!book.totalPages) return 0;
  return Math.min(1, Math.max(0, book.currentPage / book.totalPages));
}

/** Páginas lidas por dia (todos os livros) entre as datas, inclusive; dia sem leitura = 0. */
export function pagesByDay(rows: ProgressRow[], from: string, to: string): { date: string; pages: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.date, (m.get(r.date) ?? 0) + r.pagesRead);
  const out: { date: string; pages: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push({ date: d, pages: Math.max(0, m.get(d) ?? 0) });
  return out;
}

export function bookSummary(books: BookLite[], rows: ProgressRow[], today: string) {
  const year = today.slice(0, 4);
  const week = pagesByDay(rows, addDays(today, -6), today);
  return {
    reading: books.filter((b) => b.status === "reading").length,
    readThisYear: books.filter((b) => b.status === "read" && b.finishedOn?.startsWith(year)).length,
    pagesLast7: week.reduce((s, d) => s + d.pages, 0),
    want: books.filter((b) => b.status === "want").length,
  };
}
