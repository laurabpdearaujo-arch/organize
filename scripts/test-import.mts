// Testa o leitor genérico em extratos REAIS, mostrando só um resumo (sem valores nem descrições).
// Uso (dentro de organize/): npx tsx scripts/test-import.mts "..\extrato.pdf" ["..\outro.pdf" ...] [--cartao]
import { readFileSync } from "node:fs";
import path from "node:path";
import { pdfToLines } from "../src/lib/finance/import/pdf-lines";
import { parseStatement } from "../src/lib/finance/import/statement";

const mode = process.argv.includes("--cartao") ? "card" : "bank";
for (const file of process.argv.slice(2).filter((a) => !a.startsWith("--"))) {
  const { lines, pageCount } = await pdfToLines(new Uint8Array(readFileSync(file)));
  const r = parseStatement(lines, { fallbackYear: new Date().getFullYear(), mode });
  const rec = r.reconciliation;
  const entradas = r.rows.filter((x) => x.amountCents > 0).length;
  const saidas = r.rows.filter((x) => x.amountCents < 0).length;
  console.log(`\n${path.basename(file)} (${pageCount} pág.)`);
  console.log(`  lançamentos: ${r.rows.length} (${entradas} entradas, ${saidas} saídas)`);
  console.log(`  período: ${r.period ? `${r.period.start} a ${r.period.end}` : "não identificado"}; datas lidas: ${r.rows[0]?.date ?? "-"} a ${r.rows.at(-1)?.date ?? "-"}`);
  console.log(`  ordem no PDF: ${rec.order === "newest_first" ? "mais novo primeiro" : "mais antigo primeiro"}`);
  console.log(`  conferência: ${rec.status === "ok" ? "✅ saldos conferem" : rec.status === "mismatch" ? "❌ diferença" : "⚠️ sem saldos para conferir"} (${rec.checked} saldo(s) comparado(s)); linha Total: ${rec.totals}`);
  if (rec.mismatches.length) console.log(`  diferenças após os lançamentos nº: ${rec.mismatches.map((m) => m.afterRow + 1).join(", ")}`);
  const semDescricao = r.rows.filter((x) => x.description === "(sem descrição)").length;
  if (semDescricao) console.log(`  sem descrição: ${semDescricao}`);
  for (const w of r.warnings) console.log(`  aviso: ${w}`);
}
