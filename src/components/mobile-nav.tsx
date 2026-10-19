"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis, LogOut, X } from "lucide-react";
import { logout } from "@/app/login/actions";
import { NAV_ITEMS, isActive } from "./nav-items";
import { ThemeToggle } from "./theme-toggle";

const primary = NAV_ITEMS.filter((i) => i.mobilePrimary);
const secondary = NAV_ITEMS.filter((i) => !i.mobilePrimary);

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const moreActive = secondary.some((i) => isActive(pathname, i.href));

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-card p-4 pb-[calc(5rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Mais</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="rounded-lg p-2 hover:bg-muted">
                <X className="size-4" />
              </button>
            </div>
            <nav className="flex flex-col gap-0.5">
              {secondary.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                    isActive(pathname, href) ? "bg-muted font-medium" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              ))}
            </nav>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                Tema <ThemeToggle />
              </span>
              <form action={logout}>
                <button type="submit" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                  <LogOut className="size-4" /> Sair
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="grid grid-cols-5">
          {primary.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 py-2 text-[11px] ${active ? "text-primary" : "text-muted-foreground"}`}
                >
                  <Icon className="size-5" />
                  {label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={`flex w-full flex-col items-center gap-1 py-2 text-[11px] ${moreActive || open ? "text-primary" : "text-muted-foreground"}`}
            >
              <Ellipsis className="size-5" />
              Mais
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
