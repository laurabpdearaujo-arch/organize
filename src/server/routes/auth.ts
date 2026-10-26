import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUser } from "../auth";
import { createSupabaseServerClient } from "../supabase";

const loginSchema = z.object({
  email: z.email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe a senha."),
});

export const authRoutes = new Hono()
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
