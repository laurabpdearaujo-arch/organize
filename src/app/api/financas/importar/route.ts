import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { localDate } from "@/lib/calendar/dto";
import { buildPreview } from "@/lib/finance/import/repository";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Recebe o PDF do extrato e devolve a pré-visualização. Nada é gravado aqui
 * e o arquivo não é guardado: ele é lido em memória e descartado.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const accountId = z.uuid().safeParse(form?.get("accountId"));
  if (!(file instanceof File) || !accountId.success) {
    return NextResponse.json({ error: "Envie o PDF e escolha a conta." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Arquivo maior que 5 MB." }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // "%PDF"
  if (!isPdf) {
    return NextResponse.json({ error: "Este arquivo não é um PDF. Se for um print/foto do extrato, gere o PDF no app do banco." }, { status: 415 });
  }

  const today = localDate(new Date(), user.timezone);
  const result = await buildPreview(user.id, accountId.data, file.name || "extrato.pdf", bytes, today);
  if ("error" in result) return NextResponse.json(result, { status: 422 });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
