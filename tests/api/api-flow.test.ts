/**
 * API (Hono) contra o banco real: login, segurança (401/403/CSRF), dados de cada página,
 * ações de cada módulo pela API, importação de PDF e isolamento entre duas usuárias.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempLogin, deleteTempUser } from "../db/helpers";
import { ApiClient } from "./client";

let dbModule: typeof import("@/db");
let a: Awaited<ReturnType<typeof createTempLogin>>;
let b: Awaited<ReturnType<typeof createTempLogin>>;
const A = new ApiClient();
const B = new ApiClient();
const anon = new ApiClient();

/** PDF mínimo de verdade (Helvetica, WinAnsi), uma linha de texto por item. */
function makePdf(lines: string[]) {
  const esc = (s: string) => s.replace(/[\\()]/g, (m) => `\\${m}`).replace(/•/g, "\\225");
  const content = ["BT", "/F1 11 Tf", ...lines.map((l, i) => `1 0 0 1 50 ${780 - i * 16} Tm (${esc(l)}) Tj`), "ET"].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

function upload(client: ApiClient, path: string, bytes: Uint8Array, fields: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("file", new File([new Uint8Array(bytes)], "teste.pdf", { type: "application/pdf" }));
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return client.raw(path, { method: "POST", body: fd });
}

beforeAll(async () => {
  dbModule = await import("@/db");
  a = await createTempLogin();
  b = await createTempLogin();
  expect((await A.login(a.email, a.password)).status).toBe(200);
  expect((await B.login(b.email, b.password)).status).toBe(200);
}, 60_000);

afterAll(async () => {
  await deleteTempUser(a?.id);
  await deleteTempUser(b?.id);
  await dbModule?.db.$client.end();
}, 30_000);

describe("login e segurança", () => {
  it("sem sessão: páginas, ações e rotas antigas respondem 401", async () => {
    expect((await anon.raw("/api/auth/me")).status).toBe(401);
    expect((await anon.raw("/api/pages/painel")).status).toBe(401);
    expect((await anon.raw("/api/calendar?start=2026-10-01T00:00:00Z&end=2026-11-01T00:00:00Z")).status).toBe(401);
    const r = await anon.raw("/api/actions/tarefas/createTask", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(r.status).toBe(401);
  });

  it("login errado não revela se o e-mail existe", async () => {
    const c = new ApiClient();
    const r1 = await c.login(a.email, "senha-errada");
    const r2 = await c.login("ninguem@example.com", "senha-errada");
    expect(r1.status).toBe(401);
    expect(await r1.json()).toEqual(await r2.json());
  });

  it("escrita sem Origin, ou de outro site, é recusada (CSRF)", async () => {
    const noOrigin = await A.raw("/api/actions/tarefas/createTask", { method: "POST", headers: { origin: "", "content-type": "application/json" }, body: "{}" });
    expect(noOrigin.status).toBe(403);
    const foreign = await A.raw("/api/actions/tarefas/createTask", { method: "POST", headers: { origin: "https://site-malicioso.example", "content-type": "application/json" }, body: "{}" });
    expect(foreign.status).toBe(403);
  });

  it("ação ou página inexistente (inclusive nomes internos do JS) dá 404", async () => {
    for (const path of ["/api/actions/tarefas/naoExiste", "/api/actions/tarefas/constructor", "/api/actions/__proto__/x", "/api/actions/toString/x"]) {
      const r = await A.raw(path, { method: "POST", headers: { "content-type": "application/json" }, body: "null" });
      expect(r.status, path).toBe(404);
    }
    expect((await A.raw("/api/pages/constructor")).status).toBe(404);
    expect((await A.raw("/api/rota-que-nao-existe")).status).toBe(404);
  });

  it("me devolve nome, e-mail e fuso; sair encerra a sessão", async () => {
    const c = new ApiClient();
    await c.login(a.email, a.password);
    const me = await (await c.raw("/api/auth/me")).json();
    expect(me).toMatchObject({ email: a.email, timezone: "America/Sao_Paulo" });
    expect((await c.raw("/api/auth/logout", { method: "POST" })).status).toBe(200);
    expect((await c.raw("/api/auth/me")).status).toBe(401);
  });

  it("payload inválido vira mensagem amigável, não erro 500", async () => {
    expect(await A.action("tarefas", "createTask", { area: "general", title: "" })).toEqual({ ok: false, error: "Dê um título." });
    expect((await A.action("calendario", "saveEvent", { mode: "nada" })).ok).toBe(false);
  });
});

describe("dados das páginas", () => {
  it("todas as páginas carregam com os campos que a tela usa", async () => {
    const today = (await A.page("tarefas")).today as string;
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Object.keys(await A.page("painel")).sort()).toEqual(["bills", "books", "events", "highlights", "openToday", "progress", "study", "timezone", "today"]);
    expect(await A.page("calendario")).toEqual({ timezone: "America/Sao_Paulo" });
    expect(Object.keys((await A.page("tarefas")).data).sort()).toEqual(["feedbacks", "projects", "tasks"]);
    expect((await A.page("estudos")).plans).toEqual([]);
    const fin = await A.page("financas", "?mes=2026-09");
    expect(fin.month).toBe("2026-09");
    expect(Object.keys(fin).sort()).toEqual(["bills", "data", "imports", "investments", "month", "today"]);
    expect((await A.page("financas", "?mes=bobagem")).month).toBe(today.slice(0, 7));
    expect((await A.page("habitos")).habits).toEqual([]);
    expect(Object.keys((await A.page("leituras")).data).sort()).toEqual(["books", "media", "progress"]);
  }, 60_000);

  it("datas chegam na tela como Date (como no Next)", async () => {
    const fin = await A.page("financas");
    const carteira = fin.data.accounts[0];
    expect(carteira.name).toBe("Carteira (dinheiro)");
    expect(carteira.createdAt).toBeInstanceOf(Date);
  });
});

describe("ações de cada módulo pela API", () => {
  it("tarefas: criar, mover, aparecer no painel e no calendário", async () => {
    const { today } = await A.page("tarefas");
    expect(await A.action("tarefas", "createTask", { area: "career", title: "Entregar relatório", dueDate: today, hardDeadline: true })).toEqual({ ok: true });
    expect(await A.action("tarefas", "createTask", { area: "general", title: "Comprar pão" })).toEqual({ ok: true });
    let tasks = (await A.page("tarefas")).data.tasks;
    const rel = tasks.find((t: { title: string }) => t.title === "Entregar relatório");
    expect(rel).toMatchObject({ status: "todo", hardDeadline: true, area: "career" });

    const painel = await A.page("painel");
    expect(painel.highlights.list.map((t: { title: string }) => t.title)).toContain("Entregar relatório");
    expect(painel.openToday).toBe(1);

    expect(await A.action("tarefas", "moveTask", { id: rel.id, status: "done", index: 0 })).toEqual({ ok: true });
    tasks = (await A.page("tarefas")).data.tasks;
    expect(tasks.find((t: { id: string }) => t.id === rel.id)).toMatchObject({ status: "done", completedOn: today });

    const cal = await (await A.raw(`/api/calendar?start=${today}T00:00:00Z&end=${today}T23:59:59Z`)).json();
    expect(cal.find((e: { id: string }) => e.id === `task-${rel.id}`)).toMatchObject({ allDay: true, extendedProps: { kind: "task", done: true, hard: true } });
  }, 60_000);

  it("calendário: criar evento, mover e apagar", async () => {
    const input = { title: "Reunião", description: "", location: "Sala 3", color: "teal", allDay: false, startDate: "2026-11-03", startTime: "09:00", endDate: "2026-11-03", endTime: "10:00", recurrence: null };
    expect(await A.action("calendario", "saveEvent", { mode: "create", input })).toEqual({ ok: true });
    const range = "start=2026-11-01T00:00:00Z&end=2026-11-08T00:00:00Z";
    let evs = await (await A.raw(`/api/calendar?${range}`)).json();
    const ev = evs.find((e: { title: string }) => e.title === "Reunião");
    expect(ev).toMatchObject({ start: "2026-11-03T12:00:00.000Z", end: "2026-11-03T13:00:00.000Z" }); // 9h em São Paulo = 12h UTC
    expect(
      await A.action("calendario", "moveEvent", { eventId: ev.extendedProps.eventId, originalStart: ev.extendedProps.originalStart, allDay: false, start: "2026-11-04T12:00:00.000Z", end: "2026-11-04T13:30:00.000Z" }),
    ).toEqual({ ok: true });
    evs = await (await A.raw(`/api/calendar?${range}`)).json();
    expect(evs.find((e: { title: string }) => e.title === "Reunião")).toMatchObject({ start: "2026-11-04T12:00:00.000Z", end: "2026-11-04T13:30:00.000Z" });
    expect(await A.action("calendario", "deleteEvent", { eventId: ev.extendedProps.eventId, scope: "series" })).toEqual({ ok: true });
    evs = await (await A.raw(`/api/calendar?${range}`)).json();
    expect(evs.some((e: { title: string }) => e.title === "Reunião")).toBe(false);
  }, 60_000);

  it("hábitos: criar e marcar o dia", async () => {
    const { today } = await A.page("habitos");
    const goal = { scheduleType: "days", weekdays: [0, 1, 2, 3, 4, 5, 6], timesPerWeek: null, target: null };
    expect(await A.action("habitos", "createHabit", { name: "Beber água", direction: "build", measure: "boolean", unit: "", category: "Saúde", color: "teal", startDate: today, goal })).toEqual({ ok: true });
    const h = (await A.page("habitos")).habits[0];
    expect(await A.action("habitos", "setLog", { habitId: h.id, date: today, value: 1 })).toEqual({ ok: true });
    expect((await A.page("habitos")).habits[0].logs[today]).toBe(1);
    expect((await A.action("habitos", "setLog", { habitId: h.id, date: "2099-01-01", value: 1 })).ok).toBe(false);
  }, 60_000);

  it("leituras: livro com página do dia e conclusão automática; série", async () => {
    expect(await A.action("leituras", "createBook", { title: "Dom Casmurro", status: "reading", totalPages: 100 })).toEqual({ ok: true });
    const { data, today } = await A.page("leituras");
    const book = data.books[0];
    expect(await A.action("leituras", "setBookPage", { id: book.id, page: 40, date: today })).toEqual({ ok: true, finished: false });
    expect(await A.action("leituras", "setBookPage", { id: book.id, page: 100, date: today })).toEqual({ ok: true, finished: true });
    const after = await A.page("leituras");
    expect(after.data.books[0]).toMatchObject({ status: "read", currentPage: 100, finishedOn: today });
    expect(after.data.progress).toEqual([{ bookId: book.id, date: today, pagesRead: 100 }]);
    expect(await A.action("leituras", "createMedia", { kind: "series", title: "Série", status: "watching", season: 2, episode: 3 })).toEqual({ ok: true });
    expect((await A.page("leituras")).data.media[0]).toMatchObject({ season: 2, episode: 3 });
  }, 60_000);

  it("finanças: conta, lançamento e resumo do mês", async () => {
    expect(await A.action("financas", "saveAccount", { id: null, input: { name: "Banco", type: "checking", currency: "BRL", initialBalance: "1.000,00", color: "blue", closingDay: null, dueDay: null } })).toEqual({ ok: true });
    const fin = await A.page("financas");
    const banco = fin.data.accounts.find((x: { name: string }) => x.name === "Banco");
    expect(banco.balanceCents).toBe(100_000);
    const cat = fin.data.categories.find((c: { kind: string }) => c.kind === "expense");
    expect(
      await A.action("financas", "saveTransaction", { id: null, input: { type: "expense", accountId: banco.id, toAccountId: null, amount: "250,50", date: fin.today, description: "Mercado", categoryId: cat.id, paymentMethod: "pix", notes: "" } }),
    ).toEqual({ ok: true });
    const after = await A.page("financas");
    expect(after.data.accounts.find((x: { id: string }) => x.id === banco.id).balanceCents).toBe(100_000 - 25_050);
    expect(after.data.transactions.find((t: { description: string }) => t.description === "Mercado")).toMatchObject({ amountCents: 25_050, type: "expense" });
  }, 60_000);

  it("estudos: importar PDF de conteúdo pela API, gravar o plano e registrar estudo", async () => {
    const pdf = makePdf(["PARTE I - PROGRAMA TESTE", "1. Microeconomia", "• 1. Demanda do consumidor - 1.1 Teoria do consumidor: curvas. 1.2 Curva de demanda: elasticidades."]);
    const r = await upload(A, "/api/estudos/importar", pdf);
    expect(r.status).toBe(200);
    const outline = await r.json();
    expect(outline.plans[0].name).toBe("PROGRAMA TESTE");
    const res = await A.action<{ ok: boolean; planIds?: string[] }>("estudos", "importStudyPlans", {
      fileName: "teste.pdf",
      plans: outline.plans.map((p: { name: string; nodes: unknown }) => ({ name: p.name, color: "violet", nodes: p.nodes, targetPlanId: null })),
    });
    expect(res.ok).toBe(true);
    const plan = (await A.page("estudos")).plans[0];
    const codes = plan.items.map((i: { code: string | null }) => i.code).filter(Boolean).sort();
    expect(codes).toEqual(["1", "1", "1.1", "1.2"]);
    const leaf = plan.items.find((i: { code: string | null }) => i.code === "1.1");
    const { today } = await A.page("estudos");
    expect(await A.action("estudos", "addStudyLog", { itemId: leaf.id, date: today, minutes: 30, questionsDone: 10, questionsCorrect: 8, difficulties: "", mistakes: "" })).toEqual({ ok: true });
    const after = (await A.page("estudos")).plans[0];
    expect(after.items.find((i: { id: string }) => i.id === leaf.id).status).toBe("in_progress");
    expect(after.logs).toHaveLength(1);
  }, 60_000);

  it("importação de extrato: lê o PDF no servidor e recusa arquivo que não é PDF", async () => {
    const fin = await A.page("financas");
    const banco = fin.data.accounts.find((x: { name: string }) => x.name === "Banco");
    const notPdf = await upload(A, "/api/financas/importar", new TextEncoder().encode("isto não é pdf"), { accountId: banco.id });
    expect(notPdf.status).toBe(415);
    const empty = await upload(A, "/api/financas/importar", makePdf(["Extrato sem lançamentos"]), { accountId: banco.id });
    expect(empty.status).toBe(422);
    // o PDF foi lido pelo pdfjs no servidor; só não tem tabela de lançamentos
    expect((await empty.json()).error).not.toMatch(/Não consegui ler/);
    const cash = fin.data.accounts.find((x: { type: string }) => x.type === "cash");
    const toCash = await upload(A, "/api/financas/importar", makePdf(["x"]), { accountId: cash.id });
    expect((await toCash.json()).error).toMatch(/Dinheiro em espécie/);
  }, 60_000);
});

describe("isolamento entre usuárias pela API", () => {
  it("B não vê nem altera nada de A", async () => {
    const tarefasB = await B.page("tarefas");
    expect(tarefasB.data.tasks).toEqual([]);
    expect((await B.page("leituras")).data.books).toEqual([]);
    expect((await B.page("estudos")).plans).toEqual([]);
    expect((await B.page("habitos")).habits).toEqual([]);
    expect((await B.page("financas")).data.transactions).toEqual([]);

    const taskA = (await A.page("tarefas")).data.tasks[0];
    expect((await B.action("tarefas", "deleteTask", taskA.id)).ok).toBe(false);
    expect((await B.action("tarefas", "moveTask", { id: taskA.id, status: "todo", index: 0 })).ok).toBe(false);
    const bookA = (await A.page("leituras")).data.books[0];
    expect((await B.action("leituras", "deleteBook", bookA.id)).ok).toBe(false);
    const habitA = (await A.page("habitos")).habits[0];
    expect((await B.action("habitos", "deleteHabit", { habitId: habitA.id })).ok).toBe(false);
    const planA = (await A.page("estudos")).plans[0];
    expect((await B.action("estudos", "deleteStudyPlan", { id: planA.id })).ok).toBe(false);

    // tudo continua lá para A
    expect((await A.page("tarefas")).data.tasks.some((t: { id: string }) => t.id === taskA.id)).toBe(true);
    expect((await A.page("leituras")).data.books.some((x: { id: string }) => x.id === bookA.id)).toBe(true);
    expect((await A.page("habitos")).habits).toHaveLength(1);
    expect((await A.page("estudos")).plans).toHaveLength(1);
  }, 60_000);
});
