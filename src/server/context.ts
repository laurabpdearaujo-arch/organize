import { AsyncLocalStorage } from "node:async_hooks";
import type { Context } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "./auth";

/**
 * Dados de UMA requisição (cookies, cliente Supabase, usuária logada), disponíveis em qualquer
 * função chamada durante ela — assim getCurrentUser() funciona sem passar o contexto adiante.
 */
type RequestStore = { c: Context; supabase?: SupabaseClient; user?: Promise<CurrentUser> };

const storage = new AsyncLocalStorage<RequestStore>();

export function runWithRequest<T>(c: Context, fn: () => Promise<T>): Promise<T> {
  return storage.run({ c }, fn);
}

export function currentRequest(): RequestStore {
  const store = storage.getStore();
  if (!store) throw new Error("Chamado fora de uma requisição.");
  return store;
}
