import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";

/** Cookie de sessão do Supabase (pode vir em pedaços: sb-<projeto>-auth-token.0, .1...). */
const SESSION_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

/**
 * Antes de mandar a tela: sem cookie de sessão, as páginas do site vão direto para o login, sem
 * mostrar a tela vazia antes. Só olha se o cookie existe (validar a sessão aqui deixaria toda abertura
 * mais lenta); sessão expirada continua sendo resolvida pela API (401 → login).
 * A tela de login não redireciona quem tem cookie: com um cookie inválido isso viraria um vaivém sem fim.
 */
export const pageGate: MiddlewareHandler = async (c, next) => {
  const path = c.req.path;
  const isPage =
    c.req.method === "GET" && path !== "/login" && !path.startsWith("/api/") && !path.startsWith("/assets/") && !/\.[a-z0-9]+$/i.test(path);
  if (isPage && !Object.keys(getCookie(c)).some((name) => SESSION_COOKIE.test(name))) {
    c.header("Cache-Control", "no-store");
    return c.redirect("/login");
  }
  await next();
};
