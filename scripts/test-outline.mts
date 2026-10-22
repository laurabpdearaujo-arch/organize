// Mostra como o PDF de conteúdo programático será dividido em planos/temas/conteúdos.
// Uso (dentro de organize/): npx tsx scripts/test-outline.mts "..\conteudo.pdf" [--arvore]
import { readFileSync } from "node:fs";
import path from "node:path";
import { pdfToLines } from "../src/lib/finance/import/pdf-lines";
import { countLeaves, parseOutline, type OutlineNode } from "../src/lib/studies/outline";

const file = process.argv[2];
const tree = process.argv.includes("--arvore");
const { lines } = await pdfToLines(new Uint8Array(readFileSync(file)));
const { plans, warnings } = parseOutline(
  lines.map((l) => l.items.map((i) => i.s).join(" ")),
  path.basename(file, ".pdf"),
);

function show(nodes: OutlineNode[], depth: number) {
  for (const n of nodes) {
    const c = n.children.length ? countLeaves(n.children) : null;
    const extra = [
      n.done ? "concluído" : "",
      n.durationMinutes ? `${n.durationMinutes} min` : "",
      n.tags.join(", "),
      c ? `${c.leaves} conteúdo(s)` : "",
    ].filter(Boolean);
    console.log(`${"  ".repeat(depth)}- ${n.code ? `${n.code} ` : ""}${n.title}${extra.length ? `  (${extra.join(" · ")})` : ""}`);
    if (tree) show(n.children, depth + 1);
  }
}

for (const p of plans) {
  const c = countLeaves(p.nodes);
  console.log(`\nPLANO: ${p.name} — ${p.nodes.length} tema(s), ${c.leaves} conteúdo(s) para estudar${c.minutes ? `, ${Math.round(c.minutes / 60)}h de aulas` : ""}`);
  show(p.nodes, 1);
}
for (const w of warnings) console.log("aviso:", w);
