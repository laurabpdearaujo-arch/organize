import { z } from "zod";
import { EVENT_COLOR_KEYS } from "@/lib/calendar/colors";
import type { OutlineNode } from "./outline";

const MAX_NODES = 3000;

/** Nó da estrutura enviada pela pré-visualização (validado de novo no servidor). */
export const outlineNodeSchema: z.ZodType<OutlineNode> = z.lazy(() =>
  z.object({
    code: z.string().max(40).nullable(),
    title: z.string().trim().min(1).max(300),
    description: z.string().max(4000).nullable(),
    durationMinutes: z.number().int().min(1).max(10_000).nullable(),
    tags: z.array(z.string().max(20)).max(10),
    done: z.boolean(),
    children: z.array(outlineNodeSchema).max(500),
  }),
);

function countNodes(nodes: OutlineNode[]): number {
  return nodes.reduce((s, n) => s + 1 + countNodes(n.children), 0);
}

export const importOutlineSchema = z
  .object({
    fileName: z.string().max(200),
    plans: z
      .array(
        z.object({
          name: z.string().trim().min(1, "Dê um nome ao plano.").max(120),
          color: z.enum(EVENT_COLOR_KEYS),
          nodes: z.array(outlineNodeSchema).max(500),
          /** Preenchido = atualizar esse plano existente (sem perder progresso) em vez de criar um novo. */
          targetPlanId: z.uuid().nullable().default(null),
        }),
      )
      .min(1, "Escolha pelo menos uma parte para importar.")
      .max(20),
  })
  .refine((v) => v.plans.every((p) => countNodes(p.nodes) <= MAX_NODES), "Conteúdo grande demais para um plano.");

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const itemUpdateSchema = z.object({
  id: z.uuid(),
  status: z.enum(["not_started", "in_progress", "partial", "done"]).optional(),
  /** null remove o agendamento */
  plannedDate: dateStr.nullable().optional(),
  plannedTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  plannedMinutes: z.number().int().min(5).max(1440).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

const optInt = (max: number) =>
  z
    .union([z.number().int().min(0).max(max), z.literal(""), z.null()])
    .transform((v) => (v === "" ? null : v));

export const logInputSchema = z
  .object({
    itemId: z.uuid(),
    date: dateStr,
    minutes: optInt(1440),
    questionsDone: optInt(10_000),
    questionsCorrect: optInt(10_000),
    difficulties: z.string().trim().max(2000).default(""),
    mistakes: z.string().trim().max(2000).default(""),
  })
  .refine((v) => v.minutes || v.questionsDone || v.difficulties || v.mistakes, "Preencha pelo menos o tempo, as questões ou uma anotação.")
  .refine((v) => v.questionsCorrect === null || (v.questionsDone !== null && v.questionsCorrect <= v.questionsDone), "Acertos não podem ser mais que as questões feitas.");

/** Duração da aula em minutos (0 ou vazio = sem duração). */
const optDuration = z
  .union([z.number().int().min(0).max(10_000), z.literal(""), z.null()])
  .default(null)
  .transform((v) => (v === "" || v === 0 ? null : v));

export const itemDetailsSchema = z.object({
  id: z.uuid(),
  code: z.string().trim().max(40).default(""),
  title: z.string().trim().min(1, "Dê um título.").max(300),
  description: z.string().trim().max(4000).default(""),
  notes: z.string().trim().max(4000).default(""),
  durationMinutes: optDuration,
});

export const addItemSchema = z.object({
  planId: z.uuid(),
  parentId: z.uuid().nullable(),
  code: z.string().trim().max(40).default(""),
  title: z.string().trim().min(1, "Dê um nome.").max(300),
  durationMinutes: optDuration,
  isGroup: z.boolean().default(false),
});

export const planUpdateSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "Dê um nome ao plano.").max(120),
  objective: z.string().trim().max(1000).default(""),
  color: z.enum(EVENT_COLOR_KEYS),
});
