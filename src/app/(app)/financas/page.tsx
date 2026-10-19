import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function FinancasPage() {
  return (
    <>
      <PageHeader title="Finanças" subtitle="Receitas, despesas e contas a pagar" />
      <EmptyState
        icon={Wallet}
        title="Nenhuma movimentação ainda"
        description="Em breve: contas, categorias, transações, faturas e contas a pagar."
      />
    </>
  );
}
