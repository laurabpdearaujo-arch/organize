"use client";

import dynamic from "next/dynamic";

// O calendário depende do tamanho da tela e do relógio do navegador: renderiza só no cliente.
const CalendarView = dynamic(() => import("./calendar-view"), {
  ssr: false,
  loading: () => <div className="h-[720px] animate-pulse rounded-2xl border border-border bg-card" />,
});

export function CalendarClient({ timezone }: { timezone: string }) {
  return <CalendarView timezone={timezone} />;
}
