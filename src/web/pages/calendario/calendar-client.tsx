import { lazy, Suspense } from "react";

// O calendário (FullCalendar) é pesado: carrega só quando a página abre.
const CalendarView = lazy(() => import("./calendar-view"));

export function CalendarClient({ timezone, openNew }: { timezone: string; openNew?: boolean }) {
  return (
    <Suspense fallback={<div className="h-[720px] animate-pulse rounded-2xl border border-border bg-card" />}>
      <CalendarView timezone={timezone} openNew={openNew} />
    </Suspense>
  );
}
