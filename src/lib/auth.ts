import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  timezone: string;
  currency: string;
};

/**
 * Ponto único para saber quem está logada (Data Access Layer).
 * Toda leitura/gravação de dados deve partir daqui, nunca de um id vindo do navegador.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");

  const userId = claims.sub;
  const email = typeof claims.email === "string" ? claims.email : "";

  let [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (!profile) {
    [profile] = await db
      .insert(profiles)
      .values({ userId })
      .onConflictDoNothing()
      .returning();
    profile ??= (await db.select().from(profiles).where(eq(profiles.userId, userId)))[0];
  }

  return {
    id: userId,
    email,
    name: profile.displayName ?? email.split("@")[0],
    timezone: profile.timezone,
    currency: profile.currency,
  };
});
