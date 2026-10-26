import superjson from "superjson";
import app from "@/server/app";

/** Navegador de mentira para testar a API: guarda os cookies e manda Origin/Host como o site. */
export class ApiClient {
  private cookies = new Map<string, string>();

  private headers(extra: Record<string, string> = {}) {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    return { host: "localhost", origin: "http://localhost", ...(cookie ? { cookie } : {}), ...extra };
  }

  private keepCookies(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (value === "" || /max-age=0/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return res;
  }

  async raw(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
    const res = await app.request(`http://localhost${path}`, { ...init, headers: this.headers(init.headers) });
    return this.keepCookies(res);
  }

  async login(email: string, password: string) {
    return this.raw("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  }

  // Nos testes os dados da página são lidos campo a campo; tipo solto de propósito.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async page<T = any>(name: string, query = ""): Promise<T> {
    const res = await this.raw(`/api/pages/${name}${query}`);
    if (res.status !== 200) throw new Error(`página ${name}: ${res.status} ${await res.text()}`);
    return superjson.parse<T>(await res.text());
  }

  async action<T = { ok: boolean; error?: string }>(module: string, name: string, payload: unknown): Promise<T> {
    const res = await this.raw(`/api/actions/${module}/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: superjson.stringify(payload),
    });
    if (res.status !== 200) throw new Error(`ação ${module}/${name}: ${res.status} ${await res.text()}`);
    return superjson.parse<T>(await res.text());
  }
}
