import { Briefcase } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function CarreiraPage() {
  return (
    <>
      <PageHeader title="Carreira" subtitle="Tarefas, prazos e feedbacks" />
      <EmptyState
        icon={Briefcase}
        title="Nenhuma tarefa de carreira ainda"
        description="Em breve: projetos, tarefas com prazo e prioridade, e histórico de feedbacks."
      />
    </>
  );
}
