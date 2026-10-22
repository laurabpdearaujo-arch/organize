import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookProgress, books, media } from "@/db/schema";
import type { BookInput, MediaInput } from "./schemas";

/* Leituras e Filmes. Todas as funções recebem o userId (de getCurrentUser) e filtram por ele. */

export async function listReading(userId: string) {
  const [bookRows, progress, mediaRows] = await Promise.all([
    db.select().from(books).where(eq(books.userId, userId)).orderBy(desc(books.updatedAt)),
    db
      .select({ bookId: bookProgress.bookId, date: bookProgress.date, pagesRead: bookProgress.pagesRead })
      .from(bookProgress)
      .where(eq(bookProgress.userId, userId))
      .orderBy(asc(bookProgress.date)),
    db.select().from(media).where(eq(media.userId, userId)).orderBy(desc(media.updatedAt)),
  ]);
  return { books: bookRows, progress, media: mediaRows };
}
export type ReadingData = Awaited<ReturnType<typeof listReading>>;

/** Ao mudar de status: "lendo" ganha data de início; "lido" ganha data de fim e vai para a última página. */
function withStatusDefaults(v: BookInput, today: string): BookInput {
  const out = { ...v };
  if (v.status === "reading") out.startedOn ??= today;
  if (v.status === "read") {
    out.finishedOn ??= today;
    if (v.totalPages) out.currentPage = v.totalPages;
  }
  return out;
}

export async function createBook(userId: string, v: BookInput, today: string) {
  const [row] = await db
    .insert(books)
    .values({ userId, ...withStatusDefaults(v, today) })
    .returning({ id: books.id });
  return row.id;
}

/** Edição completa. Mudar a página por aqui é correção: não entra no ritmo de leitura. */
export async function updateBook(userId: string, id: string, v: BookInput, today: string) {
  const r = await db
    .update(books)
    .set(withStatusDefaults(v, today))
    .where(and(eq(books.id, id), eq(books.userId, userId)))
    .returning({ id: books.id });
  return r.length > 0;
}

/**
 * Registra até onde leu no dia: soma as páginas no registro do dia (entra no ritmo),
 * começa a leitura se ainda era "quero ler" e conclui ao chegar na última página.
 */
export async function setPage(userId: string, id: string, page: number, date: string): Promise<"ok" | "finished" | "too_far" | null> {
  return db.transaction(async (tx) => {
    const [b] = await tx.select().from(books).where(and(eq(books.id, id), eq(books.userId, userId))).for("update");
    if (!b) return null;
    if (b.totalPages && page > b.totalPages) return "too_far";
    const delta = page - b.currentPage;
    await tx
      .insert(bookProgress)
      .values({ userId, bookId: id, date, page, pagesRead: delta })
      .onConflictDoUpdate({
        target: [bookProgress.bookId, bookProgress.date],
        set: { page, pagesRead: sql`${bookProgress.pagesRead} + ${delta}` },
      });
    const finished = !!b.totalPages && page >= b.totalPages && b.status !== "read";
    await tx
      .update(books)
      .set({
        currentPage: page,
        status: finished ? "read" : b.status === "want" || b.status === "dropped" ? "reading" : b.status,
        startedOn: b.startedOn ?? date,
        finishedOn: finished ? date : b.finishedOn,
      })
      .where(eq(books.id, id));
    return finished ? "finished" : "ok";
  });
}

export async function deleteBook(userId: string, id: string) {
  const r = await db.delete(books).where(and(eq(books.id, id), eq(books.userId, userId))).returning({ id: books.id });
  return r.length > 0;
}

// ---------- filmes e séries ----------

/** Filme não tem temporada/episódio; "visto" ganha a data de hoje se não tiver. */
function mediaValues(v: MediaInput, today: string) {
  return {
    ...v,
    season: v.kind === "series" ? v.season : null,
    episode: v.kind === "series" ? v.episode : null,
    finishedOn: v.status === "watched" ? (v.finishedOn ?? today) : null,
  };
}

export async function createMedia(userId: string, v: MediaInput, today: string) {
  const [row] = await db
    .insert(media)
    .values({ userId, ...mediaValues(v, today) })
    .returning({ id: media.id });
  return row.id;
}

export async function updateMedia(userId: string, id: string, v: MediaInput, today: string) {
  const r = await db
    .update(media)
    .set(mediaValues(v, today))
    .where(and(eq(media.id, id), eq(media.userId, userId)))
    .returning({ id: media.id });
  return r.length > 0;
}

export async function deleteMedia(userId: string, id: string) {
  const r = await db.delete(media).where(and(eq(media.id, id), eq(media.userId, userId))).returning({ id: media.id });
  return r.length > 0;
}
