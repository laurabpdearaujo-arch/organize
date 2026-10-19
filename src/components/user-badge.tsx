import { LogOut } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { ThemeToggle } from "./theme-toggle";

export async function UserBadge() {
  const user = await getCurrentUser();

  return (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
      </div>
      <ThemeToggle />
      <form action={logout}>
        <button
          type="submit"
          aria-label="Sair"
          title="Sair"
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}
