import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

export const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!.trim(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Usuária descartável para testes. Apagar com deleteTempUser (os dados dela somem em cascata). */
export async function createTempUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: `teste-${randomUUID()}@example.com`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

export async function deleteTempUser(id: string) {
  if (id) await admin.auth.admin.deleteUser(id);
}
