/**
 * Leitor genérico de extratos. As "páginas" abaixo imitam a ESTRUTURA real (posições, quebras de linha,
 * cabeçalhos) de Bradesco, Itaú e Sicoob, observada em versões mascaradas — com valores e nomes inventados.
 */
import { describe, expect, it } from "vitest";
import { parseStatement, type PdfLine } from "@/lib/finance/import/statement";

/** Monta uma linha: [x, texto] → largura aproximada pelo nº de caracteres. */
function L(page: number, y: number, ...items: [number, string][]): PdfLine {
  return { page, y, items: items.map(([x, s]) => ({ x, y, w: Math.round(s.length * 4.6), s })) };
}
// Valores alinhados à direita: calcula x a partir da borda direita desejada.
const R = (right: number, s: string): [number, string] => [right - Math.round(s.length * 4.6), s];

describe("Bradesco: 3 linhas por lançamento, crédito/débito em colunas, saldo por linha", () => {
  const header = (p: number) => [
    L(p, 789, [194, "Bradesco Celular"]),
    L(p, 754, [194, "Nome: FULANA DE TAL"]),
    L(p, 719, [38, "Extrato de: Agência: 1234 | Conta: 5678-9 | Movimentações entre: 01/03/2024 e 31/03/2024"], [510, "Folha: 1/2"]),
    L(p, 684, [38, "Data"], [106, "Histórico"], [287, "Docto."], [373, "Crédito (R$)"], [445, "Débito (R$)"], [516, "Saldo (R$)"]),
  ];
  const pages: PdfLine[] = [
    ...header(1),
    L(1, 657, [38, "25/03/2024"], [106, "SALDO ANTERIOR"], R(560, "100,00")),
    L(1, 629, [106, "TRANSFERENCIA PIX"]),
    L(1, 624, [38, "28/03/2024"], [287, "1718084"], R(489, "-30,00"), R(560, "70,00")),
    L(1, 619, [106, "DES: Padaria Boa 28/03"]),
    L(1, 592, [106, "TRANSFERENCIA PIX"]),
    L(1, 587, [287, "2801025"], R(421, "1.200,50"), R(560, "1.270,50")), // mesma data: herda
    L(1, 582, [106, "REM: Empresa X 28/03"]),
    L(1, 554, [106, "TARIFA BANCARIA"]),
    L(1, 549, [287, "12345"], R(489, "-12,40"), R(560, "1.258,10")),
    L(1, 544, [106, "Cesta Facil"]),
    ...header(2), // página 2 repete o cabeçalho (não pode virar descrição!)
    L(2, 657, [38, "29/03/2024"], [106, "PIX QR CODE DINAMICO"], [287, "777"], R(489, "-58,10"), R(560, "1.200,00")),
    L(2, 432, [38, "Total"], R(421, "1.200,50"), R(489, "-100,50"), R(560, "1.200,00")),
  ];

  const r = parseStatement(pages, { fallbackYear: 2024 });

  it("lê os lançamentos com data herdada e descrição das linhas de cima e de baixo", () => {
    expect(r.rows).toEqual([
      { date: "2024-03-28", description: "TRANSFERENCIA PIX · DES: Padaria Boa 28/03", amountCents: -3000 },
      { date: "2024-03-28", description: "TRANSFERENCIA PIX · REM: Empresa X 28/03", amountCents: 120050 },
      { date: "2024-03-28", description: "TARIFA BANCARIA · Cesta Facil", amountCents: -1240 },
      { date: "2024-03-29", description: "PIX QR CODE DINAMICO", amountCents: -5810 },
    ]);
  });

  it("confere os saldos linha a linha e a linha Total", () => {
    expect(r.reconciliation).toMatchObject({ status: "ok", checked: 4, order: "oldest_first", totals: "ok" });
    expect(r.period).toEqual({ start: "2024-03-01", end: "2024-03-31" });
  });

  it("acusa diferença quando um valor foi lido errado", () => {
    const broken = pages.map((l) => (l.y === 549 ? L(1, 549, [287, "12345"], R(489, "-12,00"), R(560, "1.258,10")) : l));
    const b = parseStatement(broken, { fallbackYear: 2024 });
    expect(b.reconciliation.status).toBe("mismatch");
    expect(b.reconciliation.mismatches[0]).toMatchObject({ expectedCents: 125850, foundCents: 125810 });
  });
});

describe("Itaú: do mais novo para o mais antigo, SALDO DO DIA acima dos lançamentos do dia", () => {
  const pages: PdfLine[] = [
    L(1, 781, [243, "FULANA DE TAL"], [376, "123.456.789-00"], [440, "agência: 1234"], [500, "conta: 12345-6"]),
    L(1, 723, [31, "saldo em conta"], [137, "Limite da Conta utilizado"]),
    L(1, 704, [31, "R$ 2.000,00"], [137, "R$ 0,00"]),
    L(1, 630, [28, "período de visualização: 27/11/2023 até 11/12/2023"]),
    L(1, 597, [31, "data"], [96, "lançamentos"], [411, "valor (R$)"], [516, "saldo (R$)"]),
    L(1, 572, [31, "11/12/2023"], [96, "SALDO DO DIA"], R(565, "850,00")),
    L(1, 553, [31, "11/12/2023"], [96, "PIX TRANSF FULANO 11/12"], R(450, "-150,00")),
    L(1, 534, [31, "08/12/2023"], [96, "SALDO DO DIA"], R(565, "1.000,00")),
    L(1, 516, [31, "08/12/2023"], [96, "REMUNERACAO/SALARIO"], R(450, "1.500,00")),
    L(1, 497, [31, "08/12/2023"], [96, "PAG BOLETO BANCO 237"], R(450, "-700,00")),
    L(1, 478, [31, "05/12/2023"], [96, "SALDO DO DIA"], R(565, "200,00")),
    L(2, 803, [31, "05/12/2023"], [96, "CARTAO PAG ONLINE 05/12"], R(450, "-50,00")), // página 2 sem cabeçalho
    L(2, 784, [31, "27/11/2023"], [96, "SALDO DO DIA"], R(565, "250,00")),
    L(2, 669, [28, "Atenção!"]),
    L(2, 649, [28, "Os saldos acima são baseados nas informações disponíveis até 12,34 de algo"]),
  ];
  const r = parseStatement(pages, { fallbackYear: 2023 });

  it("inverte para ordem cronológica e confere os saldos do dia", () => {
    expect(r.reconciliation).toMatchObject({ status: "ok", order: "newest_first", checked: 3 });
    expect(r.rows.map((x) => [x.date, x.amountCents])).toEqual([
      ["2023-12-05", -5000],
      ["2023-12-08", -70000],
      ["2023-12-08", 150000],
      ["2023-12-11", -15000],
    ]);
  });

  it("para no rodapé e não lê o bloco de saldo do topo", () => {
    expect(r.rows).toHaveLength(4);
    expect(r.rows.some((x) => x.description.includes("Atenção"))).toBe(false);
  });
});

describe("Sicoob: dd/mm sem ano, valor com C/D, descrição embaixo, RESUMO no fim", () => {
  const base = (periodo: string, rows: PdfLine[]) => [
    L(1, 803, [276, "SICOOB"]),
    L(1, 745, [98, "19/10/2026"], [222, "EXTRATO CONTA CORRENTE"], [451, "15:46:52"]),
    L(1, 716, [98, "CONTA:"], [143, "1.234-5 / FULANA"]),
    L(1, 687, [98, "PERÍODO:"], [156, periodo]),
    L(1, 663, [211, "HISTÓRICO DE MOVIMENTAÇÃO"]),
    L(1, 649, [98, "DATA"], [140, "HISTÓRICO"], [460, "VALOR"]),
    ...rows,
    L(1, 466, [275, "RESUMO"]),
    L(1, 452, [98, "(+) SALDO EM CONTA:"], R(487, "999,00C")),
    L(1, 423, [98, "(-) JUROS CHEQUE ESPECIAL:"], R(487, "0,00D")),
  ];

  it("lê, junta a descrição de baixo, ignora DOC e CPF, e confere", () => {
    const r = parseStatement(
      base("17/10/2026 - 19/10/2026", [
        L(1, 634, [98, "16/10"], [140, "SALDO ANTERIOR"], R(487, "213,98C")),
        L(1, 620, [98, "16/10"], [140, "SALDO BLOQ.ANTERIOR"], R(487, "0,00*")),
        L(1, 605, [98, "19/10"], [140, "PIX RECEB.OUTRA IF"], R(487, "11.800,00C")),
        L(1, 591, [140, "Recebimento Pix"]),
        L(1, 577, [140, "***.123.456-**"]),
        L(1, 562, [140, "DOC.: Pix"]),
        L(1, 548, [98, "19/10"], [140, "DEB AUT FATUR CART"], R(487, "213,98D")),
        L(1, 533, [140, "Debito Automatico Cartao"]),
        L(1, 519, [140, "DOC.: DB.AUT.CRT"]),
        L(1, 490, [98, "19/10"], [140, "SALDO DO DIA"], R(487, "11.800,00C")),
      ]),
      { fallbackYear: 2000 },
    );
    expect(r.rows).toEqual([
      { date: "2026-10-19", description: "PIX RECEB.OUTRA IF · Recebimento Pix", amountCents: 1_180_000 },
      { date: "2026-10-19", description: "DEB AUT FATUR CART · Debito Automatico Cartao", amountCents: -21_398 },
    ]);
    expect(r.reconciliation).toMatchObject({ status: "ok", checked: 1 });
  });

  it("virada de ano: 30/12 vira 2025 e 02/01 vira 2026", () => {
    const r = parseStatement(
      base("28/12/2025 - 03/01/2026", [
        L(1, 634, [98, "27/12"], [140, "SALDO ANTERIOR"], R(487, "100,00C")),
        L(1, 605, [98, "30/12"], [140, "COMPRA DEBITO"], R(487, "40,00D")),
        L(1, 548, [98, "02/01"], [140, "PIX RECEB.OUTRA IF"], R(487, "10,00C")),
        L(1, 490, [98, "02/01"], [140, "SALDO DO DIA"], R(487, "70,00C")),
      ]),
      { fallbackYear: 2000 },
    );
    expect(r.rows.map((x) => x.date)).toEqual(["2025-12-30", "2026-01-02"]);
    expect(r.reconciliation.status).toBe("ok");
  });
});

describe("Fatura de cartão (estrutura da fatura Bradesco): modo cartão", () => {
  // Página 1: resumo. Página 2: lançamentos com painel lateral, seções por portador, cidade, US$ e créditos com "-".
  const pages: PdfLine[] = [
    L(1, 749, [421, "Total da fatura"], [497, "Vencimento"]),
    L(1, 733, [430, "R$ 1.290,00"], [497, "10/01/2027"]),
    L(1, 712, [417, "Data de fechamento da próxima fatura: 25/01/2027"]),
    L(1, 422, [40, "Saldo anterior......................... R$"], [143, "500,00"]),
    L(1, 414, [40, "(-) Créditos/Pagamentos..... R$"], [143, "530,00"]),
    L(1, 405, [40, "(+)Compras/Débitos............"], [133, "R$"], [143, "1.320,00"]),
    L(1, 397, [40, "(=)Total.................................... R$"], [143, "1.290,00"]),
    L(2, 727, [45, "Data"], [67, "Histórico de Lançamentos"], [204, "Cidade"], [253, "US$"], [332, "R$"]),
    L(2, 713, [45, "11/12"], [74, "PAGTO. POR DEB EM C/C"], R(355, "500,00 -")),
    L(2, 705, [45, "26/12"], [74, "IOF S/ COMPRA INTER"], R(355, "10,00")),
    L(2, 695, [45, "FULANA DE TAL"], [210, "Cartão"], [232, "1234 XXXX XXXX 5678"]),
    L(2, 692, [364, "Compras"], [401, "R$ 9.999,99"], [453, "R$ 9.999,99"]), // painel lateral: ignorar
    L(2, 686, [45, "28/12"], [67, "PADARIA BOA"], [205, "RIO DE JANEIRO"], R(355, "300,00"), [364, "Saque"], [401, "R$ 999,99"]),
    L(2, 678, [45, "02/01"], [67, "LOJA ONLINE"], [185, "100,00 SEATTLE"], R(355, "510,00")), // compra internacional
    L(2, 575, [45, "Total para FULANA DE TAL"]),
    L(2, 567, [45, "TAL"], R(345, "810,00")),
    L(2, 559, [45, "CICLANO DA SILVA"], [210, "Cartão"], [232, "1234 XXXX XXXX 9999"]),
    L(2, 548, [45, "03/01"], [67, "FARMACIA"], [205, "SAO PAULO"], R(355, "500,00")),
    L(2, 376, [45, "04/01"], [67, "ESTORNO LOJA"], [205, "SAO PAULO"], R(355, "20,00"), [347, "-"]),
    L(2, 319, [45, "05/01"], [67, "LOJA X"], [205, "SAO PAULO"], R(355, "10,00")),
    L(2, 316, [347, "-"]), // "-" desalinhado 3pt abaixo
    L(3, 721, [45, "Total da fatura em REAIS"], R(350, "1.290,00")),
    L(3, 699, [44, "Nome: FULANA DE TAL"], [228, "Cartão: 1234 XXXX XXXX 5678"]),
  ];
  const r = parseStatement(pages, { fallbackYear: 2000, mode: "card" });

  it("compras viram saída, créditos viram entrada; ano deduzido pelo vencimento (virada de ano)", () => {
    expect(r.rows).toEqual([
      { date: "2026-12-11", description: "PAGTO. POR DEB EM C/C", amountCents: 50_000 },
      { date: "2026-12-26", description: "IOF S/ COMPRA INTER", amountCents: -1_000 },
      { date: "2026-12-28", description: "PADARIA BOA", amountCents: -30_000 },
      { date: "2027-01-02", description: "LOJA ONLINE 100,00 SEATTLE", amountCents: -51_000 }, // valor em US$ junto da cidade fica no texto
      { date: "2027-01-03", description: "FARMACIA", amountCents: -50_000 },
      { date: "2027-01-04", description: "ESTORNO LOJA", amountCents: 2_000 },
      { date: "2027-01-05", description: "LOJA X", amountCents: 1_000 },
    ]);
  });

  it("confere com o Resumo da fatura e ignora painel lateral, portadores e totais", () => {
    expect(r.reconciliation).toMatchObject({ status: "ok", totals: "ok" });
    expect(r.warnings).toEqual([]);
  });
});

describe("PDF que não é extrato", () => {
  it("avisa em vez de inventar lançamentos", () => {
    const r = parseStatement([L(1, 700, [50, "Relatório qualquer"]), L(1, 680, [50, "Valor: 10,00"])], { fallbackYear: 2026 });
    expect(r.rows).toEqual([]);
    expect(r.warnings[0]).toMatch(/linha de títulos/);
  });

  it("sem saldos no extrato: lê, mas avisa que não conseguiu conferir", () => {
    const r = parseStatement(
      [L(1, 700, [30, "Data"], [100, "Descrição"], [400, "Valor"]), L(1, 680, [30, "01/02/2026"], [100, "MERCADO"], R(430, "-10,00"))],
      { fallbackYear: 2026 },
    );
    expect(r.rows).toHaveLength(1);
    expect(r.reconciliation.status).toBe("unchecked");
  });
});
