/*
 * Leitor GENÉRICO de extratos bancários em PDF (sem IA, sem regras por banco).
 *
 * Entrada: as linhas de texto do PDF com a posição de cada pedaço (ver pdf-lines.ts).
 * Funciona com o padrão comum dos extratos: uma linha de títulos (Data / Histórico / Valor ou
 * Crédito-Débito / Saldo) seguida de linhas com data + descrição + valor.
 *
 * Testado com os formatos de Bradesco (3 linhas por lançamento, colunas crédito/débito, saldo por linha),
 * Itaú (do mais novo para o mais antigo, "SALDO DO DIA") e Sicoob (dd/mm sem ano, valor com C/D,
 * descrição nas linhas de baixo, bloco "RESUMO" no fim). Ver tests/statement-import.test.ts.
 *
 * Segurança: o resultado é conferido com os saldos do próprio extrato (reconcile); se não bater,
 * quem chama não deve importar sem a pessoa revisar.
 */

export type TextItem = { x: number; y: number; w: number; s: string };
export type PdfLine = { page: number; y: number; items: TextItem[] };

export type ParsedRow = {
  date: string; // AAAA-MM-DD
  description: string;
  /** Positivo = entrada (crédito), negativo = saída (débito). */
  amountCents: number;
};

export type Reconciliation = {
  status: "ok" | "mismatch" | "unchecked";
  /** Quantos saldos do extrato foram comparados com a soma calculada. */
  checked: number;
  mismatches: { afterRow: number; expectedCents: number; foundCents: number }[];
  /** Ordem em que o extrato lista os lançamentos. */
  order: "oldest_first" | "newest_first";
  /** Linha "Total" (créditos/débitos) conferida, quando existe. */
  totals: "ok" | "mismatch" | "absent";
};

export type StatementResult = {
  rows: ParsedRow[];
  period: { start: string; end: string } | null;
  reconciliation: Reconciliation;
  warnings: string[];
};

// ---------- utilidades de texto ----------

// "-1.234,56", "1.234,56D", "(1.234,56)", "R$ 1.234,56", e "1.234,56 -" (crédito em fatura de cartão)
const MONEY_RE = /^(-)?\(?(?:R\$\s?)?(\d{1,3}(?:\.\d{3})*,\d{2})\)?\s?([CD*])?(\s?-)?$/i;
const DATE_RE = /^(\d{2})\/(\d{2})(?:\/(\d{2}|\d{4}))?$/;
const FULL_DATE_G = /(\d{2})\/(\d{2})\/(\d{4})/g;

export function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoneyToken(s: string): { cents: number; sign: -1 | 1 | 0; suffix: string } | null {
  const m = MONEY_RE.exec(s.trim());
  if (!m) return null;
  const cents = Number(m[2].replace(/\./g, "").replace(",", ""));
  const paren = s.trim().startsWith("(") && s.trim().includes(")");
  const suffix = (m[3] ?? "").toUpperCase();
  const sign: -1 | 1 | 0 = m[1] || m[4] || paren || suffix === "D" ? -1 : suffix === "C" ? 1 : 0;
  return { cents, sign, suffix };
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function validDate(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// ---------- colunas ----------

type Role = "date" | "desc" | "doc" | "city" | "foreign" | "credit" | "debit" | "value" | "balance";
type Columns = Partial<Record<Role, { left: number; right: number }>>;

const HEADER_WORDS: [Role, RegExp][] = [
  ["date", /^DATA( MOV.*)?$/],
  ["desc", /^(HISTORICO|HISTORICO DE LANCAMENTOS|LANCAMENTOS?|DESCRICAO|DESCRICAO DO LANCAMENTO|MOVIMENTACAO|ESTABELECIMENTO)$/],
  ["doc", /^(DOCTO\.?|DOCUMENTO|DOC\.?|N[º°O]? DOC\.?)$/],
  ["city", /^(CIDADE|LOCAL|LOCALIDADE)$/],
  ["foreign", /^(US\$|USD|VALOR (EM )?US\$|VALOR EM DOLAR|DOLAR)$/],
  ["credit", /^(CREDITO|CREDITOS|ENTRADAS?)( \(R\$\))?$/],
  ["debit", /^(DEBITO|DEBITOS|SAIDAS?)( \(R\$\))?$/],
  ["value", /^(VALOR( \(R\$\))?( R\$)?( EM R\$)?|R\$|VALOR EM REAIS)$/],
  ["balance", /^SALDO( \(R\$\))?( R\$)?$/],
];

function headerColumns(line: PdfLine): Columns | null {
  const cols: Columns = {};
  for (const it of line.items) {
    const n = norm(it.s).replace(/\s*\(R\$\)\s*/, " (R$)").trim();
    for (const [role, re] of HEADER_WORDS) {
      if (re.test(n) && !cols[role]) cols[role] = { left: it.x, right: it.x + it.w };
    }
  }
  const hasAmount = cols.value || cols.credit || cols.debit;
  return cols.date && hasAmount ? cols : null;
}

/** Papel de um valor pela coluna mais próxima (valores são alinhados à direita do título). */
function amountRole(it: TextItem, cols: Columns): "credit" | "debit" | "value" | "balance" {
  const right = it.x + it.w;
  let best: "credit" | "debit" | "value" | "balance" = "value";
  let dist = Infinity;
  for (const role of ["credit", "debit", "value", "balance"] as const) {
    const c = cols[role];
    if (!c) continue;
    const d = Math.min(Math.abs(right - c.right), Math.abs(it.x - c.left));
    if (d < dist) {
      dist = d;
      best = role;
    }
  }
  return best;
}

// ---------- classificação das linhas ----------

/**
 * tx: lançamento · balance: linha de saldo · text: continuação de descrição ·
 * section: divisória (ex.: nome do portador do cartão) — pula, sem encerrar ·
 * total: "Total…" (guarda os valores e segue) · stop: fim da tabela (RESUMO, rodapé)
 */
type Kind = "tx" | "balance" | "text" | "section" | "total" | "stop";
type Classified = {
  kind: Kind;
  index: number;
  page: number;
  y: number;
  date: { d: number; m: number; y?: number } | null;
  desc: string;
  amount: { cents: number; sign: -1 | 1 | 0; role: "credit" | "debit" | "value" } | null;
  balance: number | null;
  blocked: boolean;
  amounts: { cents: number; sign: -1 | 1 | 0; suffix: string; role: string }[];
};

const STOP_RE = /^(RESUMO|SALDO EM CONTA:|\(\+\)|\(-\)|\(=\)|LEGENDA|OBSERVAC|ATENCAO)/;
const TOTAL_RE = /^(TOTAL|TOTAIS|SUBTOTAL)\b/;

function classify(line: PdfLine, index: number, cols: Columns): Classified {
  const descLeft = cols.desc?.left ?? (cols.date!.right + 4);
  const amountCols = (["credit", "debit", "value", "balance"] as const).filter((r) => cols[r]).map((r) => cols[r]!);
  const amountLeft = Math.min(...amountCols.map((c) => c.left)) - 40;
  // Tudo à direita da última coluna de valor é outro bloco da página (ex.: painel lateral da fatura).
  const rightBound = Math.max(...amountCols.map((c) => c.right)) + 18;
  const cityEnd = cols.foreign?.left ?? amountLeft;
  let date: Classified["date"] = null;
  const descParts: string[] = [];
  const amounts: Classified["amounts"] = [];
  let firstNonDateInDateCol = false;

  for (const it of line.items) {
    if (it.x >= rightBound) continue;
    const t = it.s.trim();
    // "-" solto logo depois de um valor = crédito (fatura de cartão: "9,99  -")
    if (t === "-" && amounts.length) {
      amounts[amounts.length - 1].sign = -1;
      continue;
    }
    const money = parseMoneyToken(t);
    if (money && cols.foreign && Math.abs(it.x + it.w - cols.foreign.right) < 25) continue; // valor em dólar: ignora
    if (money && it.x >= amountLeft) {
      const role = amountRole(it, cols);
      amounts.push({ ...money, role });
      continue;
    }
    if (cols.city && it.x >= cols.city.left - 3 && it.x < cityEnd) continue; // cidade da compra: fora da descrição
    const dm = DATE_RE.exec(t);
    if (dm && it.x < descLeft - 2 && !date) {
      date = { d: Number(dm[1]), m: Number(dm[2]), y: dm[3] ? Number(dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : undefined };
      continue;
    }
    if (it.x < descLeft - 6 && !date) firstNonDateInDateCol = true;
    if (cols.doc && Math.abs(it.x - cols.doc.left) < 25 && /^\d[\d./-]*$/.test(t)) continue; // nº do documento
    descParts.push(t);
  }

  const desc = descParts.join(" ").replace(/\s+/g, " ").trim();
  const nd = norm(desc);
  const base = { index, page: line.page, y: line.y, date, desc, amounts, balance: null, blocked: false, amount: null };

  if (STOP_RE.test(nd)) return { ...base, kind: "stop" };
  if (TOTAL_RE.test(nd)) return { ...base, kind: "total" };
  if (firstNonDateInDateCol && !/^SALDO/.test(nd)) return { ...base, kind: "section" };

  if (/^SALDO\b/.test(nd)) {
    const a = amounts[0];
    // saldo bloqueado ("SALDO BLOQ.ANTERIOR 0,00*") não serve para conferência
    const blocked = /BLOQ/.test(nd) || amounts.some((x) => x.suffix === "*");
    const signed = a ? (a.sign === -1 ? -a.cents : a.cents) : null;
    return { ...base, kind: "balance", balance: blocked ? null : signed, blocked };
  }

  const value = amounts.find((a) => a.role !== "balance");
  const bal = amounts.find((a) => a.role === "balance");
  if (value) {
    return {
      ...base,
      kind: "tx",
      amount: { cents: value.cents, sign: value.sign, role: value.role as "credit" | "debit" | "value" },
      balance: bal ? (bal.sign === -1 ? -bal.cents : bal.cents) : null,
    };
  }
  return { ...base, kind: "text" };
}

/** Linhas que não ajudam a descrever (nº de documento, CPF parcial, só números). */
function isNoise(text: string) {
  const n = norm(text);
  return !/[A-Z]{2,}/.test(n.replace(/\bDOC\b|\bDOCTO\b/g, "")) || /^DOC(TO)?\.?:/.test(n);
}

// ---------- período e ano ----------

function findPeriod(lines: PdfLine[]): { start: string; end: string } | null {
  for (const l of lines) {
    const text = l.items.map((i) => i.s).join(" ");
    const found = [...text.matchAll(FULL_DATE_G)].map((m) => ({ d: +m[1], m: +m[2], y: +m[3] }));
    if (found.length >= 2 && /PERIODO|ENTRE|DE .* A |MOVIMENTA|EXTRATO|\s-\s|\sATE\s|\sA\s|\sE\s/i.test(norm(text))) {
      const [a, b] = found;
      if (validDate(a.y, a.m, a.d) && validDate(b.y, b.m, b.d)) {
        const s = iso(a.y, a.m, a.d);
        const e = iso(b.y, b.m, b.d);
        return s <= e ? { start: s, end: e } : { start: e, end: s };
      }
    }
  }
  return null;
}

/** Maior data completa (dd/mm/aaaa) do documento — numa fatura, o vencimento ou o próximo fechamento. */
function maxFullDate(lines: PdfLine[]): string | null {
  let max: string | null = null;
  for (const l of lines) {
    for (const it of l.items) {
      for (const m of it.s.matchAll(FULL_DATE_G)) {
        const [d, mo, y] = [+m[1], +m[2], +m[3]];
        if (!validDate(y, mo, d)) continue;
        const t = iso(y, mo, d);
        if (!max || t > max) max = t;
      }
    }
  }
  return max;
}

/** "Resumo da fatura": total de compras/débitos e de créditos/pagamentos, onde houver no PDF. */
function cardSummary(lines: PdfLine[]) {
  const lastMoney = (l: PdfLine) => {
    for (let i = l.items.length - 1; i >= 0; i--) {
      const m = parseMoneyToken(l.items[i].s.trim());
      if (m) return m.cents;
    }
    return null;
  };
  let purchases: number | null = null;
  let credits: number | null = null;
  for (const l of lines) {
    const n = norm(l.items.map((i) => i.s).join(" "));
    if (purchases === null && /COMPRAS ?\/ ?DEBITOS|DEBITOS ?\/ ?COMPRAS|TOTAL (DE|DAS) COMPRAS/.test(n)) purchases = lastMoney(l);
    if (credits === null && /CREDITOS ?\/ ?PAGAMENTOS|PAGAMENTOS ?\/ ?CREDITOS|PAGAMENTOS E CREDITOS/.test(n)) credits = lastMoney(l);
  }
  return { purchases, credits };
}

/** Ano para datas "dd/mm": o que deixa a data mais perto do período do extrato. */
function inferYear(d: number, m: number, period: { start: string; end: string } | null, fallbackYear: number) {
  if (!period) return fallbackYear;
  const sy = Number(period.start.slice(0, 4));
  const ey = Number(period.end.slice(0, 4));
  let best = sy;
  let bestDist = Infinity;
  for (const y of [sy - 1, sy, ey, ey + 1]) {
    if (!validDate(y, m, d)) continue;
    const t = iso(y, m, d);
    const dist = t < period.start ? Date.parse(period.start) - Date.parse(t) : t > period.end ? Date.parse(t) - Date.parse(period.end) : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = y;
    }
  }
  return best;
}

// ---------- montagem ----------

/** `dated`: saldo de um dia ("SALDO DO DIA/ANTERIOR"), conferível pela data; senão, saldo da própria linha. */
type Event = { type: "tx"; row: number } | { type: "check"; cents: number; date: string | null; dated: boolean };

/**
 * mode "bank": extrato de conta (entrada sem sinal = crédito).
 * mode "card": fatura de cartão — compra vem sem sinal e é SAÍDA; crédito/pagamento vem com "-".
 */
export function parseStatement(pages: PdfLine[], opts: { fallbackYear: number; mode?: "bank" | "card" }): StatementResult {
  const warnings: string[] = [];
  const card = opts.mode === "card";
  const period = card ? null : findPeriod(pages);
  // Fatura: datas "dd/mm" são anteriores ao vencimento/fechamento; a maior data completa do PDF serve de âncora.
  const anchor = card ? maxFullDate(pages) : null;

  // 1) Classifica as linhas abaixo de cada cabeçalho de tabela.
  //    Página com cabeçalho repetido: ignora o topo (logo, nome, conta) até a linha de títulos.
  //    Página sem cabeçalho: a tabela da página anterior continua desde o topo.
  const headerPages = new Set(pages.filter((l) => headerColumns(l)).map((l) => l.page));
  const classified: Classified[] = [];
  let cols: Columns | null = null;
  let active = false;
  let currentPage = -1;
  let idx = 0;
  for (const line of pages) {
    if (line.page !== currentPage) {
      currentPage = line.page;
      active = cols !== null && !headerPages.has(line.page);
    }
    const header = headerColumns(line);
    if (header) {
      cols = header;
      active = true;
      continue;
    }
    if (!cols || !active) continue;
    const c = classify(line, idx++, cols);
    classified.push(c);
    if (c.kind === "stop") active = false;
  }
  if (!cols) {
    return {
      rows: [],
      period,
      reconciliation: { status: "unchecked", checked: 0, mismatches: [], order: "oldest_first", totals: "absent" },
      warnings: ["Não encontrei a linha de títulos da tabela (Data / Histórico / Valor). Este PDF não parece um extrato com texto."],
    };
  }

  // 1b) Um "-" sozinho numa linha logo abaixo de um valor (desalinhado poucos pontos) é o sinal desse valor.
  classified.forEach((c, i) => {
    const prev = classified[i - 1];
    if (c.kind === "text" && c.desc === "-" && !c.amounts.length && prev?.kind === "tx" && prev.amount && prev.page === c.page && Math.abs(prev.y - c.y) <= 5) {
      prev.amount.sign = -1;
      c.desc = "";
    }
  });

  // 2) Liga as linhas de texto aos lançamentos.
  const claimed = new Set<number>();
  const extra = new Map<number, { before: string[]; after: string[] }>();
  const add = (txPos: number, where: "before" | "after", text: string) => {
    const e = extra.get(txPos) ?? { before: [], after: [] };
    e[where].push(text);
    extra.set(txPos, e);
  };
  const sameBlock = (a: Classified, b: Classified) => a.page === b.page && Math.abs(a.y - b.y) <= 12;

  // 2a) Lançamento sem descrição na própria linha (ex.: Bradesco): pega a linha logo acima e logo abaixo.
  classified.forEach((c, i) => {
    if (c.kind !== "tx" || c.desc) return;
    const prev = classified[i - 1];
    const next = classified[i + 1];
    if (prev?.kind === "text" && !claimed.has(i - 1) && sameBlock(prev, c)) {
      claimed.add(i - 1);
      add(i, "before", prev.desc);
      if (!c.date && prev.date) c.date = prev.date;
    }
    if (next?.kind === "text" && !claimed.has(i + 1) && sameBlock(next, c)) {
      claimed.add(i + 1);
      add(i, "after", next.desc);
      if (!c.date && next.date) c.date = next.date;
    }
  });
  // 2b) Demais linhas de texto continuam o lançamento anterior (ex.: Sicoob).
  let lastTx = -1;
  classified.forEach((c, i) => {
    if (i > 0 && c.page !== classified[i - 1].page) lastTx = -1;
    if (c.kind === "tx") lastTx = i;
    else if (c.kind !== "text") lastTx = -1;
    else if (c.kind === "text" && !claimed.has(i) && lastTx >= 0) {
      claimed.add(i);
      add(lastTx, "after", c.desc);
    }
  });

  // 3) Datas (herda a última vista) e eventos na ordem do PDF.
  type Raw = { date: string | null; description: string; amountCents: number; sign: number };
  const raws: Raw[] = [];
  const events: Event[] = [];
  let lastDate: string | null = null;
  const toIso = (dt: NonNullable<Classified["date"]>) => {
    let y = dt.y;
    if (y === undefined && anchor) {
      const ay = Number(anchor.slice(0, 4));
      y = validDate(ay, dt.m, dt.d) && iso(ay, dt.m, dt.d) <= anchor ? ay : ay - 1;
    }
    y ??= inferYear(dt.d, dt.m, period, opts.fallbackYear);
    return validDate(y, dt.m, dt.d) ? iso(y, dt.m, dt.d) : null;
  };
  let unsigned = 0;
  let totalsCredit: number | null = null;
  let totalsDebit: number | null = null;

  for (let i = 0; i < classified.length; i++) {
    const c = classified[i];
    if (c.date) lastDate = toIso(c.date) ?? lastDate;
    if (c.kind === "total") {
      totalsCredit = c.amounts.find((a) => a.role === "credit")?.cents ?? totalsCredit;
      totalsDebit = c.amounts.find((a) => a.role === "debit")?.cents ?? totalsDebit;
      continue;
    }
    if (c.kind === "balance") {
      if (c.balance !== null) events.push({ type: "check", cents: c.balance, date: c.date ? toIso(c.date) : null, dated: true });
      continue;
    }
    if (c.kind !== "tx" || !c.amount) continue;
    const a = c.amount;
    let sign = a.role === "credit" ? 1 : a.role === "debit" ? -1 : a.sign;
    if (sign === 0) {
      unsigned++;
      sign = 1; // numa coluna única de valor, sem "-" nem D = entrada (avisamos se NENHUM valor tiver sinal)
    }
    const e = extra.get(i);
    const parts = [...(e?.before ?? []), c.desc, ...(e?.after ?? [])].filter((p) => p && !isNoise(p));
    raws.push({ date: lastDate, description: parts.join(" · ") || "(sem descrição)", amountCents: sign * a.cents, sign });
    events.push({ type: "tx", row: raws.length - 1 });
    if (c.balance !== null) events.push({ type: "check", cents: c.balance, date: lastDate, dated: false });
  }
  if (!card && unsigned > 0 && unsigned === raws.length) {
    warnings.push("Nenhum valor indica se é entrada ou saída (sem “-”, C ou D). Todos foram tratados como entrada: revise.");
  }
  if (card) {
    // Conferência da fatura pelo "Resumo": compras/débitos e créditos/pagamentos (antes de inverter o sinal).
    const resumo = cardSummary(pages);
    if (resumo.purchases !== null || resumo.credits !== null) {
      totalsDebit = resumo.purchases; // compras (sem sinal no PDF)
      totalsCredit = resumo.credits; // créditos/pagamentos (com "-")
    }
    // No cartão, compra é saída e crédito é entrada: inverte o sinal de tudo.
    for (const r of raws) r.amountCents = -r.amountCents;
  }
  const undated = raws.filter((r) => !r.date).length;
  if (undated > 0) warnings.push(`${undated} lançamento(s) sem data reconhecida.`);

  // 4) Confere os saldos. Três jeitos; fica com o que tiver menos diferenças:
  //    - na ordem das linhas (saldo por linha, ex.: Bradesco), de cima para baixo ou de baixo para cima;
  //    - pela data (saldo do dia = saldo inicial + tudo até aquele dia), qualquer que seja a posição da linha (ex.: Itaú).
  const forward = reconcile(events, raws, false);
  const backward = reconcile(events, raws, true);
  const byDate = reconcileByDate(events, raws);
  const candidates = [forward, backward, ...(byDate ? [byDate] : [])].filter((c) => c.checked > 0);
  const pick = candidates.sort((a, b) => a.mismatches.length - b.mismatches.length || b.checked - a.checked)[0] ?? forward;
  // Ordem do PDF: pelas datas (independe da conferência)
  const dates = raws.map((r) => r.date).filter(Boolean) as string[];
  const order: Reconciliation["order"] = dates.length > 1 && dates[0] > dates[dates.length - 1] ? "newest_first" : "oldest_first";

  let totals: Reconciliation["totals"] = "absent";
  if (totalsCredit !== null || totalsDebit !== null) {
    const credit = raws.filter((r) => r.amountCents > 0).reduce((s, r) => s + r.amountCents, 0);
    const debit = raws.filter((r) => r.amountCents < 0).reduce((s, r) => s - r.amountCents, 0);
    totals = (totalsCredit === null || totalsCredit === credit) && (totalsDebit === null || totalsDebit === debit) ? "ok" : "mismatch";
  }

  const ordered = (order === "newest_first" ? [...raws].reverse() : raws).filter((r) => r.date) as (Raw & { date: string })[];
  const rows = ordered
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.date < b.r.date ? -1 : a.r.date > b.r.date ? 1 : a.i - b.i))
    .map(({ r }) => ({ date: r.date, description: r.description, amountCents: r.amountCents }));

  const status: Reconciliation["status"] =
    pick.mismatches.length > 0 || totals === "mismatch" ? "mismatch" : pick.checked > 0 || totals === "ok" ? "ok" : "unchecked";
  if (rows.length === 0) warnings.push("Nenhum lançamento encontrado na tabela.");

  return { rows, period, reconciliation: { status, checked: pick.checked, mismatches: pick.mismatches, order, totals }, warnings };
}

/**
 * Conferência pela data: cada "SALDO DO DIA" de uma data D deve ser igual a
 * saldo-base + soma dos lançamentos com data ≤ D. A base vem do primeiro saldo (em data).
 */
function reconcileByDate(events: Event[], raws: { amountCents: number; date: string | null }[]) {
  const checks = events.filter((e): e is Extract<Event, { type: "check" }> => e.type === "check" && e.dated && !!e.date);
  if (checks.length < 2 || raws.some((r) => !r.date)) return null;
  const upTo = (d: string) => raws.reduce((s, r) => (r.date! <= d ? s + r.amountCents : s), 0);
  const sorted = [...checks].sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0));
  const base = sorted[0].cents - upTo(sorted[0].date!);
  const mismatches: Reconciliation["mismatches"] = [];
  let checked = 0;
  for (const c of sorted.slice(1)) {
    checked++;
    const expected = base + upTo(c.date!);
    if (expected !== c.cents) {
      const lastRow = raws.reduce((acc, r, i) => (r.date! <= c.date! ? i : acc), -1);
      mismatches.push({ afterRow: lastRow, expectedCents: expected, foundCents: c.cents });
    }
  }
  return { checked, mismatches };
}

function reconcile(events: Event[], raws: { amountCents: number }[], reverse: boolean) {
  // Na ordem invertida, um saldo que vinha DEPOIS dos lançamentos do dia passa a vir antes — por isso
  // invertemos a lista inteira e tratamos todo saldo como "saldo após o que veio antes".
  const seq = reverse ? [...events].reverse() : events;
  let running: number | null = null;
  let checked = 0;
  const mismatches: Reconciliation["mismatches"] = [];
  let lastRow = -1;
  for (const ev of seq) {
    if (ev.type === "tx") {
      lastRow = ev.row;
      if (running !== null) running += raws[ev.row].amountCents;
      continue;
    }
    if (running === null) {
      running = ev.cents;
      continue;
    }
    checked++;
    if (running !== ev.cents) {
      mismatches.push({ afterRow: lastRow, expectedCents: running, foundCents: ev.cents });
      running = ev.cents; // ressincroniza para apontar só o trecho com problema
    }
  }
  return { checked, mismatches };
}
