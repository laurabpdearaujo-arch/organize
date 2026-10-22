import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth";
import { localDate } from "@/lib/calendar/dto";
import { loadFinance } from "@/lib/finance/repository";
import { listImports } from "@/lib/finance/import/repository";
import { listBills } from "@/lib/finance/bills-repository";
import { listInvestments } from "@/lib/finance/investments-repository";
import { FinanceView, type FinanceTab } from "./finance-view";

const TABS: FinanceTab[] = ["visao", "lancamentos", "pagar", "importar", "investimentos", "categorias", "metas"];

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
  const [data, imports, bills, investments] = await Promise.all([
    loadFinance(user.id, mes),
    listImports(user.id),
    listBills(user.id),
    listInvestments(user.id),
  ]);
  return <FinanceView data={data} imports={imports} bills={bills} investments={investments} month={mes} today={today} initialTab={aba} openNewTx={sp.novo === "1"} />;
}
