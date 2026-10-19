import { Target } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function HabitosPage() {
  return (
    <>
      <PageHeader title="Hábitos" subtitle="Grade semanal e consistência" />
      <EmptyState
        icon={Target}
        title="Nenhum hábito ainda"
        description="Em breve você poderá criar hábitos, registrar o dia e ver sequências e estatísticas."
      />
    </>
  );
}
