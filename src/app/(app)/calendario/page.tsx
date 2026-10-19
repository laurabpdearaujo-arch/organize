import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth";
import { CalendarClient } from "./calendar-client";

export default function CalendarioPage() {
  return (
    <>
      <PageHeader title="Calendário" subtitle="Compromissos, sessões de estudo e prazos" />
      <Suspense fallback={<div className="h-[720px] animate-pulse rounded-2xl border border-border bg-card" />}>
        <CalendarSection />
      </Suspense>
    </>
  );
}

async function CalendarSection() {
  const user = await getCurrentUser();
  return <CalendarClient timezone={user.timezone} />;
}
