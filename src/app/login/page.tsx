import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar · azeitona" };

export default function LoginPage() {
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
