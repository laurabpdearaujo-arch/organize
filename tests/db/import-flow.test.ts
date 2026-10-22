/**
 * Confirmação de importação no banco real (usuárias temporárias, apagadas no final).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempUser, deleteTempUser } from "./helpers";

let a = "";
let b = "";
let fin: typeof import("@/lib/finance/repository");
let imp: typeof import("@/lib/finance/import/repository");
let dbModule: typeof import("@/db");

const acc = (name: string, type: "checking" | "credit_card" = "checking") => ({
  name,
  type,
  currency: "BRL" as const,
  initialBalanceCents: 0,
  color: "violet",
  closingDay: type === "credit_card" ? 3 : null,
  dueDay: type === "credit_card" ? 10 : null,
});

beforeAll(async () => {
  fin = await import("@/lib/finance/repository");
  imp = await import("@/lib/finance/import/repository");
  dbModule = await import("@/db");
  a = await createTempUser();
  b = await createTempUser();
}, 30_000);

afterAll(async () => {
  await deleteTempUser(a);
  await deleteTempUser(b);
  await dbModule?.db.$client.end();
}, 30_000);

describe("importação de extrato", () => {
  it("importa, não duplica ao reimportar, faz a transferência da fatura e lembra a categoria", async () => {
    const cc = await fin.createAccount(a, acc("Banco"));
    const card = await fin.createAccount(a, acc("Cartão", "credit_card"));
    const data = await fin.loadFinance(a, "2026-10");
    const mercado = data.categories.find((c) => c.name === "Mercado")!;
    const salario = data.categories.find((c) => c.name === "Salário")!;

    const rows = [
      { date: "2026-10-01", originalDescription: "PIX RECEB · Empresa X", description: "Salário", amountCents: 500_000, occurrence: 0, type: "income" as const, categoryId: salario.id, toAccountId: null, remember: false },
      { date: "2026-10-02", originalDescription: "PIX QR CODE · Mercado Bom 02/10", description: "Mercado Bom", amountCents: -12_000, occurrence: 0, type: "expense" as const, categoryId: mercado.id, toAccountId: null, remember: true },
      { date: "2026-10-02", originalDescription: "PIX QR CODE · Mercado Bom 02/10", description: "Mercado Bom", amountCents: -12_000, occurrence: 1, type: "expense" as const, categoryId: mercado.id, toAccountId: null, remember: true },
      { date: "2026-10-13", originalDescription: "DEB AUT FATUR CART", description: "Pagamento fatura", amountCents: -30_000, occurrence: 0, type: "transfer" as const, categoryId: null, toAccountId: card, remember: true },
    ];
    const input = { accountId: cc, fileName: "extrato.pdf", fileHash: "a".repeat(64), period: { start: "2026-10-01", end: "2026-10-31" }, rows };

    expect(await imp.commitImport(a, input)).toEqual({ imported: 4, skipped: 0 });
    // mesmo extrato de novo (ou período sobreposto): nada duplica, mesmo com descrição editada
    expect(await imp.commitImport(a, { ...input, rows: rows.map((r) => ({ ...r, description: "outra" })) })).toEqual({ imported: 0, skipped: 4 });

    const after = await fin.loadFinance(a, "2026-10");
    const bal = Object.fromEntries(after.accounts.map((x) => [x.name, x.balanceCents]));
    expect(bal.Banco).toBe(500_000 - 24_000 - 30_000);
    expect(bal["Cartão"]).toBe(30_000); // pagamento de fatura entrou no cartão como transferência
    const transfer = after.transactions.find((t) => t.type === "transfer")!;
    expect([transfer.accountId, transfer.toAccountId]).toEqual([cc, card]);
    expect(after.transactions.filter((t) => t.type === "expense")).toHaveLength(2); // dois "Mercado Bom" no mesmo dia

    // regra aprendida aparece como sugestão
    const ruleRows = await dbModule.db.$client`select pattern, type from import_rules where user_id = ${a} order by pattern`;
    expect(ruleRows.map((r) => r.pattern)).toEqual(["DEB AUT FATUR CART", "PIX QR CODE MERCADO BOM"]);
  }, 60_000);

  it("desfazer importação apaga só os lançamentos dela; manuais ficam; outra usuária não desfaz", async () => {
    const cc = await fin.createAccount(a, acc("Banco desfazer"));
    const manual = await fin.createTx(a, {
      type: "expense", accountId: cc, toAccountId: null, amount: 1_000, date: "2026-09-01",
      description: "Manual", categoryId: null, paymentMethod: "other", notes: "",
    });
    expect(manual).toBe("ok");
    const rows = [1, 2, 3].map((n) => ({
      date: `2026-09-0${n}`, originalDescription: `LINHA ${n}`, description: `Linha ${n}`, amountCents: -100 * n,
      occurrence: 0, type: "expense" as const, categoryId: null, toAccountId: null, remember: false,
    }));
    expect(await imp.commitImport(a, { accountId: cc, fileName: "teste.pdf", fileHash: "c".repeat(64), period: null, rows })).toEqual({ imported: 3, skipped: 0 });

    const batch = (await imp.listImports(a)).find((x) => x.fileName === "teste.pdf")!;
    expect(batch.remaining).toBe(3);
    expect(await imp.undoImport(b, batch.id)).toBe(false);
    expect(await imp.undoImport(a, batch.id)).toBe(true);

    const data = await fin.loadFinance(a, "2026-09");
    const left = data.transactions.filter((t) => t.accountId === cc);
    expect(left.map((t) => t.description)).toEqual(["Manual"]);
    expect(data.accounts.find((x) => x.id === cc)!.balanceCents).toBe(-1_000);
    expect((await imp.listImports(a)).some((x) => x.id === batch.id)).toBe(false);
  }, 60_000);

  it("recusa sinal incoerente, transferência sem destino e conta de outra usuária", async () => {
    const cc = await fin.createAccount(a, acc("Banco 2"));
    const base = { accountId: cc, fileName: "x.pdf", fileHash: "b".repeat(64), period: null };
    const row = { date: "2026-10-01", originalDescription: "X", description: "X", amountCents: -100, occurrence: 0, type: "income" as const, categoryId: null, toAccountId: null, remember: false };
    expect(await imp.commitImport(a, { ...base, rows: [row] })).toEqual({ error: "sign_mismatch" });
    expect(await imp.commitImport(a, { ...base, rows: [{ ...row, type: "transfer" }] })).toEqual({ error: "transfer_invalid" });
    expect(await imp.commitImport(b, { ...base, rows: [{ ...row, type: "expense" }] })).toEqual({ error: "account_not_found" });
  }, 60_000);
});
