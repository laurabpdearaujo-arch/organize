import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import app from "./app";

/*
 * Servidor de produção: a API (/api) e a tela já compilada (dist/web).
 * Qualquer outro caminho devolve o index.html (a navegação entre páginas é feita no navegador).
 */
const WEB_ROOT = "./dist/web";

const server = new Hono();
server.route("/", app);
// Arquivos com hash no nome (Vite): podem ficar em cache por muito tempo
server.use("/assets/*", async (c, next) => {
  await next();
  if (c.res.ok) c.header("Cache-Control", "public, max-age=31536000, immutable");
});
server.use("*", serveStatic({ root: WEB_ROOT }));
server.get("*", serveStatic({ path: `${WEB_ROOT}/index.html` }));

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: server.fetch, port, hostname: process.env.HOSTNAME ?? "0.0.0.0" }, (info) => {
  console.log(`azeitona rodando na porta ${info.port}`);
});
