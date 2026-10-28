import { LogOut } from "lucide-react";
import { logout } from "@/web/lib/auth";
import { useMe } from "@/web/lib/me";
import { ThemeToggle } from "./theme-toggle";

export function UserBadge() {
  const user = useMe();

  // "Sair" aparece mesmo enquanto (ou se) os dados da conta não carregam: nunca fica preso sem saída.
  return (
    <div className="flex items-center gap-1">
      {user ? (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
      ) : (
        <div className="h-9 flex-1 animate-pulse rounded bg-muted" />
      )}
      <ThemeToggle />
      <button
        type="button"
        onClick={logout}
        aria-label="Sair"
        title="Sair"
        className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
