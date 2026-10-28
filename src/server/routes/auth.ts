import { createHash, timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { getCurrentUser } from "../auth";
import { createSupabaseServerClient } from "../supabase";

const loginSchema = z.object({
  email: z.email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe a senha."),
});

const signupSchema = z.object({
  email: z.email("Informe um e-mail válido."),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(72, "Senha longa demais (máximo 72 caracteres)."),
  code: z.string().trim().min(1, "Informe o código de convite."),
});

/*
 * Cadastro só com código de convite (SIGNUP_CODE no .env). O cadastro aberto do Supabase continua
 * desligado: a conta é criada pelo servidor com a chave secreta, já confirmada (sem e-mail).
 * Tentativas com código errado: até 10 por IP a cada 15 min (o IP real vem do proxy em X-Forwarded-For).
 */
const MAX_TRIES = 10;
const WINDOW_MS = 15 * 60_000;
const failures = new Map<string, { count: number; until: number }>();

function clientIp(c: Context) {
  return c.req.header("x-forwarded-for")?.split(",")[0].trim() || "local";
}

function blocked(ip: string) {
  const f = failures.get(ip);
  if (f && f.until < Date.now()) failures.delete(ip);
  return (failures.get(ip)?.count ?? 0) >= MAX_TRIES;
}

function countFailure(ip: string) {
  const f = failures.get(ip);
  failures.set(ip, { count: (f?.count ?? 0) + 1, until: f?.until ?? Date.now() + WINDOW_MS });
}

/** Compara sem vazar pelo tempo de resposta quantas letras do código estão certas. */
function sameCode(given: string, expected: string) {
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(given), h(expected));
}

export const authRoutes = new Hono()
  .post("/signup", async (c) => {
    const expected = process.env.SIGNUP_CODE?.trim();
    const secret = process.env.SUPABASE_SECRET_KEY?.trim();
    if (!expected || !secret) return c.json({ error: "Cadastro fechado. Peça para a dona do site criar sua conta." }, 403);
    const ip = clientIp(c);
    if (blocked(ip)) return c.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, 429);

    const parsed = signupSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, 400);
    const { email, password, code } = parsed.data;
    if (!sameCode(code, expected)) {
      countFailure(ip);
      return c.json({ error: "Código de convite inválido." }, 403);
    }

    const admin = createClient(process.env.SUPABASE_URL!.trim(), secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) {
      if (error.code === "email_exists" || error.status === 422) return c.json({ error: "Já existe uma conta com esse e-mail. Use “Entrar”." }, 409);
      if (error.code === "weak_password") return c.json({ error: "Senha fraca demais. Use uma senha mais longa." }, 400);
      console.error("[signup]", error);
      return c.json({ error: "Não foi possível criar a conta. Tente novamente." }, 500);
    }
    // Já entra logada (grava o cookie de sessão)
    await createSupabaseServerClient().auth.signInWithPassword({ email, password });
    return c.json({ ok: true });
  })
  .post("/login", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, 400);
    const { error } = await createSupabaseServerClient().auth.signInWithPassword(parsed.data);
    if (error) {
      // Mensagem genérica: não revela se o e-mail existe.
      const tooMany = error.status === 429;
      return c.json({ error: tooMany ? "Muitas tentativas. Aguarde alguns minutos." : "E-mail ou senha incorretos." }, tooMany ? 429 : 401);
    }
    return c.json({ ok: true });
  })
  .post("/logout", async (c) => {
    await createSupabaseServerClient().auth.signOut();
    return c.json({ ok: true });
  })
  /** Quem está logada (nome, e-mail, fuso). 401 se não houver sessão. */
  .get("/me", async (c) => {
    const user = await getCurrentUser();
    c.header("Cache-Control", "no-store");
    return c.json({ name: user.name, email: user.email, timezone: user.timezone });
  });
