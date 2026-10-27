import { defineConfig } from "drizzle-kit";

process.loadEnvFile(".env.local");

// Migrações sempre com TLS, mesmo que a URL do .env.local não traga o ?sslmode=require.
const url = new URL(process.env.DATABASE_URL!.trim());
url.searchParams.set("sslmode", "require");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: url.toString() },
  schemaFilter: ["public"],
});
