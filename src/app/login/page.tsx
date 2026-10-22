import type { Metadata } from "next";
import { Monogram } from "@/components/monogram";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar · Organize" };

export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <Monogram className="h-12 w-auto shrink-0 text-primary" weight={1} />
          <div>
            <h1 className="font-semibold">Organize</h1>
            <p className="text-sm text-muted-foreground">Central pessoal</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
