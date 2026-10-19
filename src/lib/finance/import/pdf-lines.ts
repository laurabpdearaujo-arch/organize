import type { PdfLine, TextItem } from "./statement";

/**
 * Extrai o texto de um PDF agrupado em linhas (de cima para baixo, esquerda para a direita),
 * guardando a posição de cada pedaço. Roda só no servidor/local — o PDF não é enviado a ninguém.
 */
export async function pdfToLines(data: Uint8Array): Promise<{ lines: PdfLine[]; pageCount: number }> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
  const lines: PdfLine[] = [];
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const it of content.items) {
        if (!("str" in it) || it.str.trim() === "") continue;
        items.push({ x: Math.round(it.transform[4]), y: Math.round(it.transform[5]), w: Math.round(it.width), s: it.str });
      }
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const pageLines: PdfLine[] = [];
      for (const it of items) {
        const line = pageLines.find((l) => Math.abs(l.y - it.y) <= 2);
        if (line) line.items.push(it);
        else pageLines.push({ page: p, y: it.y, items: [it] });
      }
      for (const l of pageLines) l.items.sort((a, b) => a.x - b.x);
      lines.push(...pageLines);
    }
    return { lines, pageCount: pdf.numPages };
  } finally {
    await pdf.destroy();
  }
}
