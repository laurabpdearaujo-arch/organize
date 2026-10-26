import { useSearchParams } from "react-router";
import { PageHeader, PageSkeleton } from "@/web/components/page-header";
import { usePageData } from "@/web/lib/api";
import { FinanceView, type FinanceTab } from "./finance-view";

const TABS: FinanceTab[] = ["visao", "lancamentos", "pagar", "importar", "investimentos", "categorias", "metas"];

export function FinancasPage() {
  const [sp] = useSearchParams();
  const d = usePageData("financas", { mes: sp.get("mes") });
  const requested = sp.get("aba") as FinanceTab | null;
  const aba = requested && TABS.includes(requested) ? requested : "visao";
  return (
    <>
      <PageHeader title="Finanças" subtitle="Receitas, despesas, contas e metas" />
      {d ? (
        <FinanceView data={d.data} imports={d.imports} bills={d.bills} investments={d.investments} month={d.month} today={d.today} initialTab={aba} openNewTx={sp.get("novo") === "1"} />
      ) : (
        <PageSkeleton />
      )}
    </>
  );
}
