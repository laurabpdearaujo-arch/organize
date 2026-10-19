// Gera uma versão MASCARADA do texto de um PDF (extrato/fatura), para estudar o formato
// sem expor dados pessoais. Roda só no seu computador; nada é enviado para lugar nenhum.
//
// Uso (dentro de organize/):
//   node scripts/mask-pdf.mjs "..\extrato.pdf"
//   node scripts/mask-pdf.mjs "..\extrato.pdf" --keep=PALAVRA1,PALAVRA2   (palavras extras a não mascarar)
//   node scripts/mask-pdf.mjs "..\extrato.pdf" --keep-dates               (mantém datas como 12/08 e 12/08/2024 visíveis)
//
// Resultado: um arquivo "<nome>.mascarado.txt" ao lado do PDF. CONFIRA-O antes de compartilhar.
// - Todos os dígitos viram 9 (datas, valores, contas, documentos).
// - Palavras que não são termos bancários comuns viram XXXX (nomes de pessoas, lojas, empresas).
// - Cada linha mostra a posição horizontal (x) de cada pedaço, para entender as colunas.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const KEYWORDS = new Set(
  `SALDO ANTERIOR DIA BLOQ DISPONIVEL TOTAL TOTAIS SUBTOTAL PIX TED DOC TEF TRANSF TRANSFERENCIA TRANSFERENCIAS
  ENVIADO ENVIADA RECEBIDO RECEBIDA RECEB RECEBIMENTO PAGAMENTO PAGAMENTOS PAGTO PAG PGTO DEB DEBITO DEBITOS AUT AUTOMATICO
  FATUR FATURA CART CARTAO CARTOES CREDITO CREDITOS COMPRA COMPRAS ESTORNO EST TARIFA TARIFAS JUROS IOF MULTA ENCARGOS
  RENDIMENTO RENDIMENTOS APLICACAO RESGATE POUPANCA INVEST INVESTIMENTO BOLETO BOLETOS QR CODE ESTATICO DINAMICO
  CONV DEM EMPRES EMPRESA OUTRA OUTRO IF INSTITUICAO DES REM DEST ORIG BX ANT FINANC EMP AMORTIZ CONTR SAQUE DEPOSITO
  CHEQUE SALARIO SAL CC CP CONTA CORRENTE EXTRATO HISTORICO DATA VALOR VALORES DOCTO DOCUMENTO LANCAMENTO LANCAMENTOS
  DESCRICAO MOVIMENTACAO MOVIMENTACOES PERIODO AGENCIA COOP FOLHA PAGINA DE DA DO DAS DOS E EM ENTRE A O AS OS
  NACIONAL INTERNACIONAL PARCELA PARCELADO PARCELAS VENCIMENTO FECHAMENTO LIMITE MINIMO ANUIDADE TITULAR ADICIONAL
  RESUMO DETALHAMENTO DESPESAS GASTOS LANCAMENTOS PROXIMA PROXIMAS FATURAS ATUAL ANTERIOR PAGO PAGA DOLAR COTACAO
  SICOOB BRADESCO ITAU NUBANK SANTANDER CAIXA INTER BB BANCO BRASIL CELULAR SISTEMA COOPERATIVAS PLATAFORMA SERVICOS
  FINANCEIROS SISBR MASTERCARD VISA ELO AMEX HIPERCARD DEBAUT DB CRT CR DB R$ US$ USD BRL NOME CPF CNPJ`
    .split(/\s+/)
    .filter(Boolean),
);

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error('Uso: node scripts/mask-pdf.mjs "..\\arquivo.pdf" [--keep=PALAVRA1,PALAVRA2]');
  process.exit(1);
}
const keepArg = args.find((a) => a.startsWith("--keep="));
if (keepArg) for (const w of keepArg.slice(7).split(",")) KEYWORDS.add(norm(w));

function norm(w) {
  return w
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z$]/g, "");
}

const keepDates = args.includes("--keep-dates");
const DATE_RE = /^\d{2}\/\d{2}(\/\d{2,4})?$/;

function maskToken(tok) {
  if (keepDates && DATE_RE.test(tok)) return tok;
  if (/\d/.test(tok)) {
    // Valores/datas/números: mantém pontuação e um C/D/* final; mascara o resto.
    if (/^[\d.,\-/:*()+R$]+[CD*]?$/i.test(tok)) return tok.replace(/\d/g, "9");
    return tok.replace(/\d/g, "9").replace(/\p{L}/gu, "X");
  }
  const n = norm(tok);
  if (n.length <= 1 || KEYWORDS.has(n)) return tok;
  // termos colados por ponto/barra (ex.: "DEB.AUT", "C/SAL"): checa cada parte
  const parts = tok.split(/([./:\-])/);
  if (parts.length > 1) return parts.map((p) => (/[./:\-]/.test(p) ? p : maskToken(p))).join("");
  return tok.replace(/\p{L}/gu, "X");
}

const mask = (s) => s.split(/(\s+)/).map((t) => (/^\s+$/.test(t) || t === "" ? t : maskToken(t))).join("");

const data = new Uint8Array(readFileSync(file));
const pdf = await getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
const out = [`# ${path.basename(file)} — ${pdf.numPages} página(s) — texto mascarado (dígitos→9, nomes→X)`];

for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const content = await page.getTextContent();
  const items = content.items
    .filter((it) => "str" in it && it.str.trim() !== "")
    .map((it) => ({ x: Math.round(it.transform[4]), y: Math.round(it.transform[5]), s: it.str }));

  // Agrupa por linha (mesma altura, tolerância de 2pt), de cima para baixo e da esquerda para a direita.
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of items) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= 2);
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  out.push(`\n=== página ${p} ===`);
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    out.push(`y=${String(l.y).padStart(4)} | ` + l.items.map((it) => `[x=${it.x}] ${mask(it.s)}`).join("  "));
  }
}

const target = file.replace(/\.pdf$/i, "") + ".mascarado.txt";
writeFileSync(target, out.join("\n"), "utf8");
console.log(`Pronto: ${target}`);
console.log("Abra o arquivo e confira se nenhum dado pessoal ficou visível antes de compartilhar.");
