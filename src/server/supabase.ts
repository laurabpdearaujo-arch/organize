import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { createServerClient } from "@supabase/ssr";
import { currentRequest } from "./context";

/** Cliente Supabase da requisição (usado só para Auth). Lê e grava os cookies de sessão. */
function supabaseFor(c: Context) {
  return createServerClient(process.env.SUPABASE_URL!.trim(), process.env.SUPABASE_PUBLISHABLE_KEY!.trim(), {
    cookies: {
      getAll() {
        return Object.entries(getCookie(c)).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          setCookie(c, name, value, {
            path: options.path ?? "/",
            domain: options.domain,
            maxAge: options.maxAge,
            expires: options.expires,
            // Só o servidor lê a sessão (a tela nunca fala direto com o Supabase): o JavaScript da página não acessa o cookie.
            httpOnly: true,
            // Em produção o site é servido por HTTPS (Cloudflare): cookie só trafega cifrado.
            secure: options.secure ?? process.env.NODE_ENV === "production",
            sameSite: options.sameSite === true ? "Strict" : options.sameSite === false || options.sameSite === undefined ? "Lax" : (options.sameSite as "Lax" | "Strict" | "None"),
          });
        }
        // Cabeçalhos que impedem cache de respostas com sessão renovada
        for (const [key, value] of Object.entries(headers ?? {})) c.header(key, value);
      },
    },
  });
}

export function createSupabaseServerClient() {
  const store = currentRequest();
  store.supabase ??= supabaseFor(store.c);
  return store.supabase;
}
