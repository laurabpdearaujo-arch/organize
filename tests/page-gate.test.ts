import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { pageGate } from "@/server/page-gate";

const app = new Hono();
app.use("*", pageGate);
app.get("*", (c) => c.text("tela"));

const get = (path: string, cookie?: string) => app.request(`http://localhost${path}`, cookie ? { headers: { cookie } } : {});

describe("pageGate (antes de mandar a tela)", () => {
  it("sem cookie de sessão: páginas vão direto para o login", async () => {
    for (const path of ["/", "/financas", "/estudos?x=1"]) {
      const res = await get(path);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/login");
    }
  });

  it("com cookie de sessão (inteiro ou em pedaços): manda a tela", async () => {
    expect((await get("/", "sb-abc-auth-token=x")).status).toBe(200);
    expect((await get("/financas", "outro=1; sb-abc-auth-token.0=x")).status).toBe(200);
  });

  it("outros cookies não contam como sessão", async () => {
    expect((await get("/", "theme=dark")).status).toBe(302);
  });

  it("login, API e arquivos passam sem cookie", async () => {
    for (const path of ["/login", "/api/auth/me", "/assets/index-abc.js", "/favicon.svg"]) {
      expect((await get(path)).status).toBe(200);
    }
  });
});
