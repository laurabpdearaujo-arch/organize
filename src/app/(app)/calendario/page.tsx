import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth";
import { CalendarClient } from "./calendar-client";

export default function CalendarioPage({ searchParams }: PageProps<"/calendario">) {
  return (
    <>
      <PageHeader title="Calendário" subtitle="Compromissos, sessões de estudo e prazos" />
      <Suspense fallback={<div className="h-[720px] animate-pulse rounded-2xl border border-border bg-card" />}>
        <CalendarSection searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function CalendarSection({ searchParams }: { searchParams: PageProps<"/calendario">["searchParams"] }) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  return <CalendarClient timezone={user.timezone} openNew={sp.novo === "1"} />;
}
