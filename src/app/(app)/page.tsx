import { LayoutDashboard } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function PainelPage() {
  return (
    <>
      <PageHeader title="Painel" subtitle="Visão geral do dia" />
      <EmptyState
        icon={LayoutDashboard}
        title="Seu painel vai aparecer aqui"
        description="Conforme os módulos forem ficando prontos, o resumo do dia aparece aqui com seus dados reais."
      />
    </>
  );
}
