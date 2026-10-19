import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth";
import { localDate } from "@/lib/calendar/dto";
import { loadFinance } from "@/lib/finance/repository";
import { FinanceView, type FinanceTab } from "./finance-view";

const TABS: FinanceTab[] = ["visao", "lancamentos", "contas", "categorias", "metas"];

export default function FinancasPage({ searchParams }: PageProps<"/financas">) {
  return (
    <>
      <PageHeader title="Finanças" subtitle="Receitas, despesas, contas e metas" />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl border border-border bg-card" />}>
        <FinanceSection searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function FinanceSection({ searchParams }: { searchParams: PageProps<"/financas">["searchParams"] }) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const today = localDate(new Date(), user.timezone);
  const mes = typeof sp.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : today.slice(0, 7);
  const aba = TABS.includes(sp.aba as FinanceTab) ? (sp.aba as FinanceTab) : "visao";
  const data = await loadFinance(user.id, mes);
  return <FinanceView data={data} month={mes} today={today} initialTab={aba} />;
}
