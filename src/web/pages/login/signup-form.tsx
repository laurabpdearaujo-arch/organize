import { useActionState } from "react";

type SignupState = { error?: string; email?: string; code?: string };

const inputCls = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

async function signup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "");
  try {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, code }),
    });
    if (res.ok) {
      window.location.assign("/");
      return { email, code };
    }
    const body = await res.json().catch(() => null);
    return { error: body?.error ?? "Não foi possível criar a conta. Tente novamente.", email, code };
  } catch {
    return { error: "Sem conexão com o servidor. Tente novamente.", email, code };
  }
}

/** Criar conta com o código de convite que a dona do site passou. */
export function SignupForm() {
  const [state, action, pending] = useActionState<SignupState, FormData>(signup, {});

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="su-email" className="text-sm font-medium">E-mail</label>
        <input id="su-email" name="email" type="email" autoComplete="email" required defaultValue={state.email} className={inputCls} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="su-password" className="text-sm font-medium">Senha</label>
        <input id="su-password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required className={inputCls} />
        <p className="text-xs text-muted-foreground">Pelo menos 8 caracteres. Guarde bem: ainda não dá para trocar a senha pelo site.</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="su-code" className="text-sm font-medium">Código de convite</label>
        <input id="su-code" name="code" autoComplete="off" required defaultValue={state.code} className={inputCls} />
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
        {pending ? "Criando…" : "Criar conta"}
      </button>
    </form>
  );
}
