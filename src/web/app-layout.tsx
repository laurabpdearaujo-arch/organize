import { Outlet } from "react-router";
import { Logo } from "@/web/components/logo";
import { SidebarNav } from "@/web/components/sidebar-nav";
import { MobileNav } from "@/web/components/mobile-nav";
import { UserBadge } from "@/web/components/user-badge";
import { MeProvider } from "@/web/lib/me";

export function AppLayout() {
  return (
    <MeProvider>
      <div className="min-h-dvh md:flex">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-card/60 p-3 md:flex">
          <div className="mb-6 flex items-center gap-3 px-2 pt-1">
            <Logo className="size-10 shrink-0 text-primary" strokeWidth={5} />
            <div className="leading-tight">
              <p className="text-sm font-semibold">azeitona</p>
              <p className="text-xs text-muted-foreground">Central pessoal</p>
            </div>
          </div>

          <SidebarNav />

          <div className="mt-auto border-t border-border px-1 pt-3">
            <UserBadge />
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10 md:pt-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>

        <MobileNav />
      </div>
    </MeProvider>
  );
}
