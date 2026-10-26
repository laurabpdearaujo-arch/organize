import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCurrentUser } from "@/server/auth";
import { pdfToLines } from "@/lib/finance/import/pdf-lines";
import { countLeaves, parseOutline } from "@/lib/studies/outline";

const MAX_BYTES = 5 * 1024 * 1024;

/** Lê o PDF de conteúdo programático e devolve a estrutura (nada é gravado; o arquivo não é guardado). */
export const studyImportRoutes = new Hono().post("/", bodyLimit({ maxSize: MAX_BYTES + 64 * 1024, onError: (c) => c.json({ error: "Arquivo maior que 5 MB." }, 413) }), async (c) => {
  await getCurrentUser();
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return c.json({ error: "Envie o PDF." }, 400);
  if (file.size > MAX_BYTES) return c.json({ error: "Arquivo maior que 5 MB." }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
    return c.json({ error: "Este arquivo não é um PDF." }, 415);
  }

  let lines;
  try {
    lines = (await pdfToLines(bytes)).lines;
  } catch {
    return c.json({ error: "Não consegui ler este PDF (protegido por senha ou imagem escaneada?)." }, 422);
  }
  const name = (file.name || "Plano de estudos").replace(/\.pdf$/i, "");
  const { plans, warnings } = parseOutline(lines.map((l) => l.items.map((i) => i.s).join(" ")), name);
  const usable = plans.filter((p) => countLeaves(p.nodes).leaves > 0);
  if (!usable.length) {
    return c.json({ error: "Não encontrei temas e conteúdos neste PDF. Ele segue o formato com “PARTE”, temas e itens numerados?" }, 422);
  }
  c.header("Cache-Control", "no-store");
  return c.json({ fileName: file.name, plans: usable, warnings });
});
