import { createContext, useContext, useEffect, useState } from "react";
import { apiFetch } from "./api";

export type Me = { name: string; email: string; timezone: string };

const MeContext = createContext<Me | null>(null);

/** Carrega quem está logada (/api/auth/me). Sem sessão, apiFetch leva para o login. */
export function MeProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    apiFetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => {});
  }, []);
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

/** null enquanto carrega. */
export function useMe() {
  return useContext(MeContext);
}
