import { Suspense } from "react";
import { Layers } from "lucide-react";
import { SidebarNav } from "@/components/sidebar-nav";
import { MobileNav } from "@/components/mobile-nav";
import { UserBadge } from "@/components/user-badge";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-card/60 p-3 md:flex">
        <div className="mb-6 flex items-center gap-3 px-2 pt-1">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Layers className="size-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Organize</p>
            <p className="text-xs text-muted-foreground">Central pessoal</p>
          </div>
        </div>

        <SidebarNav />

        <div className="mt-auto border-t border-border px-1 pt-3">
          <Suspense fallback={<div className="h-9 animate-pulse rounded bg-muted" />}>
            <UserBadge />
          </Suspense>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10 md:pt-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      <MobileNav />
    </div>
  );
}
