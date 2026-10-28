/**
 * Conta apagada pelo painel do Supabase com a sessão ainda aberta no navegador: o token continua
 * com assinatura válida até expirar, mas a API tem de tratar como sessão encerrada (401), e "Sair" funciona.
 */
import { afterAll, beforeAll, expect, it } from "vitest";
import { createTempLogin, deleteTempUser } from "../db/helpers";
import { ApiClient } from "./client";

let dbModule: typeof import("@/db");
let u: Awaited<ReturnType<typeof createTempLogin>>;
const C = new ApiClient();

beforeAll(async () => {
  dbModule = await import("@/db");
  u = await createTempLogin();
  expect((await C.login(u.email, u.password)).status).toBe(200);
  expect((await C.raw("/api/auth/me")).status).toBe(200);
  await deleteTempUser(u.id);
}, 60_000);

afterAll(async () => {
  await dbModule?.db.$client.end();
}, 30_000);

it("conta apagada: a API responde 401 e já apaga o cookie de sessão", async () => {
  const res = await C.raw("/api/auth/me");
  expect(res.status).toBe(401);
  expect(res.headers.getSetCookie().some((l) => /max-age=0/i.test(l))).toBe(true);
  // Sem cookie, o resto também é 401 (a tela leva para o login), não erro 500
  expect((await C.raw("/api/pages/painel")).status).toBe(401);
});

it("conta apagada: sair continua funcionando", async () => {
  expect((await C.raw("/api/auth/logout", { method: "POST" })).status).toBe(200);
});
