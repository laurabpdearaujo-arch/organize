/**
 * Leituras e Filmes contra o banco real: progresso do livro, ritmo, conclusão automática,
 * filmes/séries e isolamento entre duas usuárias.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bookInputSchema, mediaInputSchema } from "@/lib/reading/schemas";
import { pace } from "@/lib/reading/stats";
import { createTempUser, deleteTempUser } from "./helpers";

let a = "";
let b = "";
let repo: typeof import("@/lib/reading/repository");
let dbModule: typeof import("@/db");

const book = (over: Record<string, unknown> = {}) => bookInputSchema.parse({ title: "Livro", status: "want", ...over });
const show = (over: Record<string, unknown> = {}) => mediaInputSchema.parse({ kind: "series", title: "Série", status: "want", ...over });

beforeAll(async () => {
  repo = await import("@/lib/reading/repository");
  dbModule = await import("@/db");
  a = await createTempUser();
  b = await createTempUser();
}, 30_000);

afterAll(async () => {
  await deleteTempUser(a);
  await deleteTempUser(b);
  await dbModule?.db.$client.end();
}, 30_000);

describe("livros", () => {
  it("atualizar a página: soma no dia, começa a leitura, conclui na última página", async () => {
    const id = await repo.createBook(a, book({ title: "Dom Casmurro", totalPages: 100, currentPage: 20 }), "2026-10-20");
    // já estava na pág. 20 ao cadastrar: isso não conta como leitura
    expect(await repo.setPage(a, id, 40, "2026-10-21")).toBe("ok");
    expect(await repo.setPage(a, id, 50, "2026-10-21")).toBe("ok"); // mesmo dia: soma
    expect(await repo.setPage(a, id, 45, "2026-10-22")).toBe("ok"); // correção para trás
    let data = await repo.listReading(a);
    let bk = data.books.find((x) => x.id === id)!;
    expect(bk).toMatchObject({ status: "reading", currentPage: 45, startedOn: "2026-10-21" });
    expect(data.progress.map((p) => [p.date, p.pagesRead])).toEqual([
      ["2026-10-21", 30],
      ["2026-10-22", -5],
    ]);
    expect(pace(data.progress, "2026-10-22")).toBe(12.5); // 25 páginas em 2 dias

    expect(await repo.setPage(a, id, 101, "2026-10-22")).toBe("too_far");
    expect(await repo.setPage(a, id, 100, "2026-10-22")).toBe("finished");
    data = await repo.listReading(a);
    bk = data.books.find((x) => x.id === id)!;
    expect(bk).toMatchObject({ status: "read", currentPage: 100, finishedOn: "2026-10-22" });
  }, 60_000);

  it("status pelo formulário: 'lendo' ganha início, 'lido' ganha fim e vai para a última página", async () => {
    const id = await repo.createBook(a, book({ title: "Fila", totalPages: 300 }), "2026-10-22");
    expect(await repo.updateBook(a, id, book({ title: "Fila", totalPages: 300, status: "reading" }), "2026-10-22")).toBe(true);
    let bk = (await repo.listReading(a)).books.find((x) => x.id === id)!;
    expect(bk.startedOn).toBe("2026-10-22");
    expect(await repo.updateBook(a, id, book({ title: "Fila", totalPages: 300, status: "read", startedOn: "2026-10-22", rating: 4 }), "2026-10-23")).toBe(true);
    bk = (await repo.listReading(a)).books.find((x) => x.id === id)!;
    expect(bk).toMatchObject({ status: "read", currentPage: 300, finishedOn: "2026-10-23", rating: 4 });
  }, 60_000);

  it("validação: página além do total e nota fora de 1–5", () => {
    expect(bookInputSchema.safeParse({ title: "x", status: "reading", totalPages: 10, currentPage: 11 }).success).toBe(false);
    expect(bookInputSchema.safeParse({ title: "x", status: "read", rating: 6 }).success).toBe(false);
  });
});

describe("filmes e séries", () => {
  it("filme não guarda temporada; 'visto' ganha a data", async () => {
    const id = await repo.createMedia(a, show({ kind: "movie", title: "Filme", status: "watched", season: 2 }), "2026-10-22");
    const m = (await repo.listReading(a)).media.find((x) => x.id === id)!;
    expect(m).toMatchObject({ season: null, finishedOn: "2026-10-22" });

    const sid = await repo.createMedia(a, show({ status: "watching", season: 2, episode: 3 }), "2026-10-22");
    expect(await repo.updateMedia(a, sid, show({ status: "watching", season: 2, episode: 4 }), "2026-10-22")).toBe(true);
    expect((await repo.listReading(a)).media.find((x) => x.id === sid)).toMatchObject({ season: 2, episode: 4, finishedOn: null });
  }, 60_000);
});

describe("isolamento entre usuárias (leituras)", () => {
  it("B não vê, não altera e não apaga os livros e filmes de A", async () => {
    const bookId = await repo.createBook(a, book({ title: "Da A", totalPages: 50 }), "2026-10-22");
    const mediaId = await repo.createMedia(a, show({ title: "Da A" }), "2026-10-22");
    const seen = await repo.listReading(b);
    expect(seen.books).toEqual([]);
    expect(seen.media).toEqual([]);
    expect(seen.progress).toEqual([]);
    expect(await repo.setPage(b, bookId, 10, "2026-10-22")).toBeNull();
    expect(await repo.updateBook(b, bookId, book({ title: "Invadido" }), "2026-10-22")).toBe(false);
    expect(await repo.deleteBook(b, bookId)).toBe(false);
    expect(await repo.updateMedia(b, mediaId, show({ title: "Invadido" }), "2026-10-22")).toBe(false);
    expect(await repo.deleteMedia(b, mediaId)).toBe(false);
    const still = await repo.listReading(a);
    expect(still.books.find((x) => x.id === bookId)).toMatchObject({ title: "Da A", currentPage: 0 });
    expect(still.media.find((x) => x.id === mediaId)!.title).toBe("Da A");
  }, 60_000);
});
