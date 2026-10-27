import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

// Reaproveita a conexão entre recarregamentos do servidor de desenvolvimento.
const globalForDb = globalThis as unknown as { pgClient?: postgres.Sql };

const client =
  globalForDb.pgClient ??
  postgres(process.env.DATABASE_URL!.trim(), {
    prepare: false, // compatível com o pooler do Supabase
    max: 5,
    ssl: "require", // TLS sempre, mesmo que a URL venha sem ?sslmode=require (e a URL não consegue desligar)
  });

if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
