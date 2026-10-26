import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { localDate } from "@/lib/calendar/dto";
import { buildPreview } from "@/lib/finance/import/repository";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Recebe o PDF do extrato e devolve a pré-visualização. Nada é gravado aqui
 * e o arquivo não é guardado: ele é lido em memória e descartado.
 */
export const statementImportRoutes = new Hono().post("/", bodyLimit({ maxSize: MAX_BYTES + 64 * 1024, onError: (c) => c.json({ error: "Arquivo maior que 5 MB." }, 413) }), async (c) => {
  const user = await getCurrentUser();
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  const accountId = z.uuid().safeParse(form?.get("accountId"));
  if (!(file instanceof File) || !accountId.success) {
    return c.json({ error: "Envie o PDF e escolha a conta." }, 400);
  }
  if (file.size > MAX_BYTES) return c.json({ error: "Arquivo maior que 5 MB." }, 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // "%PDF"
  if (!isPdf) {
    return c.json({ error: "Este arquivo não é um PDF. Se for um print/foto do extrato, gere o PDF no app do banco." }, 415);
  }

  const today = localDate(new Date(), user.timezone);
  const result = await buildPreview(user.id, accountId.data, file.name || "extrato.pdf", bytes, today);
  if ("error" in result) return c.json(result, 422);
  c.header("Cache-Control", "no-store");
  return c.json(result);
});
