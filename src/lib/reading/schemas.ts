import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const optDate = z.union([dateStr, z.literal(""), z.null()]).default(null).transform((v) => v || null);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .default("")
    .transform((v) => v || null);
const optInt = (min: number, max: number, msg: string) =>
  z
    .union([z.number().int().min(min, msg).max(max, msg), z.literal(""), z.null()])
    .default(null)
    .transform((v) => (v === "" ? null : v));
const rating = optInt(1, 5, "A nota vai de 1 a 5.");

export const bookInputSchema = z
  .object({
    title: z.string().trim().min(1, "Dê um título.").max(300),
    author: optText(200),
    totalPages: optInt(1, 30_000, "Nº de páginas inválido."),
    currentPage: z.number().int().min(0).max(30_000).default(0),
    status: z.enum(["want", "reading", "read", "dropped"]),
    startedOn: optDate,
    finishedOn: optDate,
    rating,
    notes: optText(4000),
  })
  .refine((v) => v.totalPages === null || v.currentPage <= v.totalPages, { message: "A página atual passa do total do livro.", path: ["currentPage"] })
  .refine((v) => !v.startedOn || !v.finishedOn || v.startedOn <= v.finishedOn, { message: "O fim não pode ser antes do início.", path: ["finishedOn"] });
export type BookInput = z.infer<typeof bookInputSchema>;

export const setPageSchema = z.object({
  id: z.uuid(),
  page: z.number({ message: "Informe a página." }).int().min(0, "Página inválida.").max(30_000, "Página inválida."),
  date: dateStr,
});

export const mediaInputSchema = z.object({
  kind: z.enum(["movie", "series"]),
  title: z.string().trim().min(1, "Dê um título.").max(300),
  status: z.enum(["want", "watching", "watched"]),
  season: optInt(1, 999, "Temporada inválida."),
  episode: optInt(1, 9999, "Episódio inválido."),
  finishedOn: optDate,
  rating,
  notes: optText(4000),
});
export type MediaInput = z.infer<typeof mediaInputSchema>;
