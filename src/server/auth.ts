import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { currentRequest } from "./context";
import { createSupabaseServerClient } from "./supabase";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  timezone: string;
  currency: string;
};

/** Sessão ausente ou expirada: a API responde 401 e a tela leva para o login. */
export class Unauthorized extends Error {
  constructor() {
    super("Sessão expirada.");
  }
}

/**
 * Ponto único para saber quem está logada (Data Access Layer).
 * Toda leitura/gravação de dados deve partir daqui, nunca de um id vindo do navegador.
 * Calculado uma vez por requisição.
 */
export function getCurrentUser(): Promise<CurrentUser> {
  const store = currentRequest();
  store.user ??= loadUser();
  return store.user;
}

async function loadUser(): Promise<CurrentUser> {
  const supabase = createSupabaseServerClient();
  // getClaims valida o token (assinatura/expiração) e renova a sessão quando preciso.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) throw new Unauthorized();

  const userId = claims.sub;
  const email = typeof claims.email === "string" ? claims.email : "";

  let [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (!profile) {
    [profile] = await db.insert(profiles).values({ userId }).onConflictDoNothing().returning();
    profile ??= (await db.select().from(profiles).where(eq(profiles.userId, userId)))[0];
  }

  return {
    id: userId,
    email,
    name: profile.displayName ?? email.split("@")[0],
    timezone: profile.timezone,
    currency: profile.currency,
  };
}
