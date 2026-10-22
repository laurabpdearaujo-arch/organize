import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth";
import { localDate } from "@/lib/calendar/dto";
import { listPlans } from "@/lib/studies/repository";
import { StudiesView } from "./studies-view";

export default function EstudosPage({ searchParams }: PageProps<"/estudos">) {
  return (
    <>
      <PageHeader title="Estudos" subtitle="Planos, temas e o que já foi estudado" />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl border border-border bg-card" />}>
        <StudiesSection searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function StudiesSection({ searchParams }: { searchParams: PageProps<"/estudos">["searchParams"] }) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const plans = await listPlans(user.id);
  const today = localDate(new Date(), user.timezone);
  const requested = typeof sp.plano === "string" ? sp.plano : null;
  return <StudiesView plans={plans} today={today} initialPlanId={requested} />;
}
