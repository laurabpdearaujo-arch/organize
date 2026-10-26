import { useSearchParams } from "react-router";
import { PageHeader, PageSkeleton } from "@/web/components/page-header";
import { usePageData } from "@/web/lib/api";
import { StudiesView } from "./studies-view";

export function EstudosPage() {
  const [sp] = useSearchParams();
  const d = usePageData("estudos");
  return (
    <>
      <PageHeader title="Estudos" subtitle="Planos, temas e o que já foi estudado" />
      {d ? <StudiesView plans={d.plans} today={d.today} initialPlanId={sp.get("plano")} /> : <PageSkeleton />}
    </>
  );
}
