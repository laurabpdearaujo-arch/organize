import { GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function EstudosPage() {
  return (
    <>
      <PageHeader title="Estudos" subtitle="Planos, atividades e desempenho" />
      <EmptyState
        icon={GraduationCap}
        title="Nenhum plano de estudo ainda"
        description="Em breve você poderá importar o PDF com o conteúdo e acompanhar cada atividade."
      />
    </>
  );
}
