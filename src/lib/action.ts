import "server-only";
import { unstable_rethrow } from "next/navigation";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Executa uma Server Action devolvendo erro amigável em vez de quebrar a tela. */
export async function runAction(scope: string, fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e); // redirect() (sessão expirada) precisa continuar subindo
    console.error(`[${scope}]`, e);
    return { ok: false, error: "Não foi possível salvar. Tente novamente." };
  }
}
