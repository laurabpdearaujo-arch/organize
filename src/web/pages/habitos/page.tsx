import { PageHeader, PageSkeleton } from "@/web/components/page-header";
import { usePageData } from "@/web/lib/api";
import { HabitsView } from "./habits-view";

export function HabitosPage() {
  const d = usePageData("habitos");
  return (
    <>
      <PageHeader title="Hábitos" subtitle="Grade semanal e consistência" />
      {d ? <HabitsView habits={d.habits} today={d.today} /> : <PageSkeleton />}
    </>
  );
}
