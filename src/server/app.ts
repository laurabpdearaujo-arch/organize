import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { Unauthorized } from "./auth";
import { runWithRequest } from "./context";
import { readData, sendData } from "./json";
import { pageLoaders, type PageName } from "./pages";
import * as calendario from "./actions/calendario";
import * as estudos from "./actions/estudos";
import * as financas from "./actions/financas";
import * as habitos from "./actions/habitos";
import * as leituras from "./actions/leituras";
import * as tarefas from "./actions/tarefas";
import { authRoutes } from "./routes/auth";
import { calendarRoutes } from "./routes/calendar";
import { studyImportRoutes } from "./routes/estudos-importar";
import { statementImportRoutes } from "./routes/financas-importar";

/*
 * API do site. Toda rota (menos login) exige sessão: getCurrentUser() lança Unauthorized → 401.
 * As "ações" são as mesmas funções de antes (validam o payload com zod e filtram pela usuária):
 * POST /api/actions/:modulo/:acao com o payload em superjson.
 */

type Action = (payload: unknown) => Promise<unknown>;
const ACTIONS: Record<string, Record<string, unknown>> = { calendario, estudos, financas, habitos, leituras, tarefas };

function findAction(module: string, name: string): Action | null {
  const mod = Object.hasOwn(ACTIONS, module) ? ACTIONS[module] : null;
  const fn = mod && Object.hasOwn(mod, name) ? mod[name] : null;
  return typeof fn === "function" ? (fn as Action) : null;
}

const api = new Hono();

// Contexto da requisição (cookies/sessão) disponível para getCurrentUser() em qualquer lugar
api.use("*", (c, next) => runWithRequest(c, () => next()));

// Proteção contra CSRF: escrita só a partir do próprio site. Compara pelo host porque,
// atrás do Cloudflare/Caddy, o servidor recebe http e o navegador usa https.
api.use("*", async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    const origin = c.req.header("origin");
    const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
    let ok = false;
    try {
      ok = !!origin && !!host && new URL(origin).host === host;
    } catch {
      ok = false;
    }
    if (!ok) return c.json({ error: "Origem não permitida." }, 403);
  }
  await next();
});

api.route("/auth", authRoutes);
api.route("/calendar", calendarRoutes);
api.route("/estudos/importar", studyImportRoutes);
api.route("/financas/importar", statementImportRoutes);

api.get("/pages/:page", async (c) => {
  const page = c.req.param("page");
  if (!Object.hasOwn(pageLoaders, page)) return c.json({ error: "Página não encontrada." }, 404);
  const query = new URL(c.req.url).searchParams;
  const data = await pageLoaders[page as PageName](query);
  return sendData(c, data);
});

api.post("/actions/:module/:name", async (c) => {
  const fn = findAction(c.req.param("module"), c.req.param("name"));
  if (!fn) return c.json({ error: "Ação não encontrada." }, 404);
  let payload: unknown;
  try {
    payload = await readData(c);
  } catch {
    return sendData(c, { ok: false, error: "Requisição inválida." }, 400);
  }
  return sendData(c, await fn(payload));
});

api.all("*", (c) => c.json({ error: "Não encontrado." }, 404));

api.onError((err, c) => {
  if (err instanceof Unauthorized) return c.json({ error: "Sessão expirada. Entre de novo." }, 401);
  console.error("[api]", err);
  return c.json({ error: "Erro no servidor. Tente novamente." }, 500);
});

const app = new Hono();
app.use("*", secureHeaders({ crossOriginEmbedderPolicy: false }));
app.route("/api", api);

export default app;
