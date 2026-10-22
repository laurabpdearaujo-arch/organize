import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pdfToLines } from "@/lib/finance/import/pdf-lines";
import { countLeaves, parseOutline } from "@/lib/studies/outline";

const MAX_BYTES = 5 * 1024 * 1024;

/** Lê o PDF de conteúdo programático e devolve a estrutura (nada é gravado; o arquivo não é guardado). */
export async function POST(request: NextRequest) {
  await getCurrentUser();
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Envie o PDF." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Arquivo maior que 5 MB." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
    return NextResponse.json({ error: "Este arquivo não é um PDF." }, { status: 415 });
  }

  let lines;
  try {
    lines = (await pdfToLines(bytes)).lines;
  } catch {
    return NextResponse.json({ error: "Não consegui ler este PDF (protegido por senha ou imagem escaneada?)." }, { status: 422 });
  }
  const name = (file.name || "Plano de estudos").replace(/\.pdf$/i, "");
  const { plans, warnings } = parseOutline(lines.map((l) => l.items.map((i) => i.s).join(" ")), name);
  const usable = plans.filter((p) => countLeaves(p.nodes).leaves > 0);
  if (!usable.length) {
    return NextResponse.json({ error: "Não encontrei temas e conteúdos neste PDF. Ele segue o formato com “PARTE”, temas e itens numerados?" }, { status: 422 });
  }
  return NextResponse.json({ fileName: file.name, plans: usable, warnings }, { headers: { "Cache-Control": "no-store" } });
}
