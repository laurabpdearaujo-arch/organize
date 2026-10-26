import { Unauthorized } from "./auth";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Executa uma ação devolvendo erro amigável em vez de quebrar a tela. */
export async function runAction(scope: string, fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Unauthorized) throw e; // sessão expirada: vira 401 e a tela leva para o login
    console.error(`[${scope}]`, e);
    return { ok: false, error: "Não foi possível salvar. Tente novamente." };
  }
}
