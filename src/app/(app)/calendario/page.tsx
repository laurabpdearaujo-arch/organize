import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function CalendarioPage() {
  return (
    <>
      <PageHeader title="Calendário" subtitle="Compromissos, sessões de estudo e prazos" />
      <EmptyState
        icon={CalendarDays}
        title="Calendário em construção"
        description="Na Etapa 2 você poderá criar eventos únicos e recorrentes e ver por dia, semana, mês ou lista."
      />
    </>
  );
}
