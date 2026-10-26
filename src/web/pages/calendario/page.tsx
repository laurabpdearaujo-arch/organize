import { useSearchParams } from "react-router";
import { PageHeader, PageSkeleton } from "@/web/components/page-header";
import { usePageData } from "@/web/lib/api";
import { CalendarClient } from "./calendar-client";

export function CalendarioPage() {
  const [sp] = useSearchParams();
  const d = usePageData("calendario");
  return (
    <>
      <PageHeader title="Calendário" subtitle="Compromissos, sessões de estudo e prazos" />
      {d ? <CalendarClient timezone={d.timezone} openNew={sp.get("novo") === "1"} /> : <PageSkeleton height="h-[720px]" />}
    </>
  );
}
