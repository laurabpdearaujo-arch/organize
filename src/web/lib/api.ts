import { useCallback, useEffect, useRef, useState } from "react";
import superjson from "superjson";
import type { PageData, PageName } from "@/server/pages";

/*
 * Comunicação com a API (/api). Só tipos vêm do servidor (import type): nenhum código do servidor
 * entra no navegador.
 */

/** Sessão expirada: volta para o login (a resposta 401 vem de qualquer rota protegida). */
function goToLogin() {
  if (window.location.pathname !== "/login") window.location.assign("/login");
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, { credentials: "same-origin", ...init });
  if (res.status === 401) {
    goToLogin();
    throw new Error("Sessão expirada.");
  }
  return res;
}

// ---------- dados das páginas ----------

/** Funções que recarregam os dados das páginas abertas (chamadas depois de cada ação que deu certo). */
const reloaders = new Set<() => Promise<void>>();

export async function reloadPageData() {
  await Promise.all([...reloaders].map((r) => r()));
}

/**
 * Dados de uma página (GET /api/pages/:pagina). Enquanto um novo pedido carrega, mostra os dados
 * anteriores (ex.: ao trocar de mês), como acontecia antes.
 */
export function usePageData<P extends PageName>(page: P, params: Record<string, string | null | undefined> = {}): PageData<P> | undefined {
  const qs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  const url = `/api/pages/${page}${qs ? `?${qs}` : ""}`;
  const [data, setData] = useState<{ url: string; value: PageData<P> } | null>(null);
  const latest = useRef(url);

  const load = useCallback(async () => {
    const res = await apiFetch(url);
    if (!res.ok) throw new Error(`Falha ao carregar ${page}`);
    const value = superjson.parse<PageData<P>>(await res.text());
    if (latest.current === url) setData({ url, value });
  }, [url, page]);

  useEffect(() => {
    latest.current = url; // respostas de um endereço antigo (ex.: mês anterior) são ignoradas
    // Busca de dados ao abrir a página: o setState acontece depois da resposta, não durante o efeito.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => console.error(e));
    reloaders.add(load);
    return () => {
      reloaders.delete(load);
    };
  }, [load, url]);

  return data?.value;
}

// ---------- ações ----------

type ActionFn = (payload: unknown) => Promise<unknown>;

/**
 * Cria a função de uma ação do servidor com a mesma assinatura e tipo de retorno de antes.
 * Se der certo, recarrega os dados das páginas abertas antes de devolver o resultado
 * (o equivalente ao refresh() do Next).
 */
export function serverAction<F extends ActionFn>(module: string, name: string): F {
  const call = async (payload: unknown) => {
    let res: Response;
    try {
      res = await apiFetch(`/api/actions/${module}/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: superjson.stringify(payload ?? null),
      });
    } catch {
      return { ok: false, error: "Sem conexão com o servidor. Tente novamente." };
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, error: body?.error ?? "Não foi possível salvar. Tente novamente." };
    }
    const result = superjson.parse<{ ok?: boolean }>(await res.text());
    if (result && result.ok) await reloadPageData().catch(() => {});
    return result;
  };
  return call as F;
}
