import { z } from "zod";
import { EVENT_COLOR_KEYS } from "@/lib/calendar/colors";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const optDate = z.union([dateStr, z.literal(""), z.null()]).default(null).transform((v) => v || null);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .default("")
    .transform((v) => v || null);

export const taskInputSchema = z
  .object({
    area: z.enum(["general", "career"]),
    projectId: z.union([z.uuid(), z.literal(""), z.null()]).default(null).transform((v) => v || null),
    title: z.string().trim().min(1, "Dê um título.").max(300),
    notes: optText(4000),
    status: z.enum(["todo", "doing", "done"]).default("todo"),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    dueDate: optDate,
    hardDeadline: z.boolean().default(false),
  })
  .refine((v) => !v.hardDeadline || v.dueDate, { message: "Prazo fatal precisa de uma data.", path: ["dueDate"] })
  // projeto só existe na parte de carreira
  .transform((v) => ({ ...v, projectId: v.area === "career" ? v.projectId : null }));
export type TaskInput = z.infer<typeof taskInputSchema>;

export const moveTaskSchema = z.object({
  id: z.uuid(),
  status: z.enum(["todo", "doing", "done"]),
  index: z.number().int().min(0).max(10_000),
});

export const projectInputSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome ao projeto.").max(120),
  color: z.enum(EVENT_COLOR_KEYS),
});

export const feedbackInputSchema = z.object({
  date: dateStr,
  fromWhom: optText(200),
  topic: optText(200),
  content: z.string().trim().min(1, "Escreva o feedback.").max(4000),
  action: optText(4000),
});
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;
