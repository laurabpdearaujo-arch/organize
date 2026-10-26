import { useEffect } from "react";
import { Logo } from "@/web/components/logo";
import { ThemeToggle } from "@/web/components/theme-toggle";
import { LoginForm } from "./login-form";

export function LoginPage() {
  useEffect(() => {
    document.title = "Entrar · azeitona";
    // Já logada? Vai direto para o painel (antes isso era feito pelo proxy do Next).
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => r.ok && window.location.replace("/"))
      .catch(() => {});
    return () => {
      document.title = "azeitona";
    };
  }, []);

  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <Logo className="size-12 shrink-0 text-primary" strokeWidth={4.5} />
          <div>
            <h1 className="font-semibold">azeitona</h1>
            <p className="text-sm text-muted-foreground">Central pessoal</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
