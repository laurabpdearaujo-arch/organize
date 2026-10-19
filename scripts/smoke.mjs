// Smoke test logado: cria usuária temporária, gera cookie de sessão do @supabase/ssr,
// visita páginas no servidor de dev e apaga a usuária.
// Uso (com `npm run dev` rodando, dentro de organize/): node scripts/smoke.mjs . / /habitos
// Erros do servidor aparecem em .next/dev/logs/next-development.log
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";

const projectDir = path.resolve(process.argv[2] ?? ".");
const paths = process.argv.slice(3);
process.chdir(projectDir);
process.loadEnvFile(".env.local");
const require = createRequire(path.join(projectDir, "package.json"));
const { createClient } = require("@supabase/supabase-js");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL.trim();
const ref = new URL(url).hostname.split(".")[0];
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY.trim(), { auth: { persistSession: false } });
const email = `teste-smoke-${randomUUID()}@example.com`;
const password = randomUUID();

const { data: created, error: e1 } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (e1) throw e1;
try {
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.trim(), { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const value = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const name = `sb-${ref}-auth-token`;
  const CHUNK = 3180;
  const cookie =
    value.length <= CHUNK
      ? `${name}=${value}`
      : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => `${name}.${i}=${value.slice(i * CHUNK, (i + 1) * CHUNK)}`).join("; ");

  for (const p of paths) {
    const res = await fetch(`http://localhost:3000${p}`, { headers: { cookie }, redirect: "manual" });
    const body = await res.text();
    const suspicious = body.includes("Error") && body.includes("digest");
    console.log(`${p} -> ${res.status} ${res.headers.get("location") ?? ""}${suspicious ? " (possível erro na página)" : ""}`);
  }
} finally {
  await admin.auth.admin.deleteUser(created.user.id);
  console.log("usuária temporária apagada");
}
