import type { Context } from "hono";
import superjson from "superjson";

/**
 * Respostas de páginas e ações em superjson: datas (Date) chegam na tela como Date,
 * do mesmo jeito que chegavam quando a tela era renderizada no servidor.
 */
export function sendData(c: Context, data: unknown, status: 200 | 400 | 401 | 404 = 200) {
  return c.body(superjson.stringify(data), status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
}

export async function readData(c: Context): Promise<unknown> {
  const text = await c.req.text();
  return text ? superjson.parse(text) : undefined;
}
