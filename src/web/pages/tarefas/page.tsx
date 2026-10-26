import { useSearchParams } from "react-router";
import { PageHeader, PageSkeleton } from "@/web/components/page-header";
import { usePageData } from "@/web/lib/api";
import { TasksView, type TasksTab } from "./tasks-view";

export function TarefasPage() {
  const [sp] = useSearchParams();
  const d = usePageData("tarefas");
  const tab: TasksTab = sp.get("aba") === "carreira" ? "carreira" : "geral";
  return (
    <>
      <PageHeader title="Tarefas" subtitle="To-dos do dia a dia, carreira, prazos e feedbacks" />
      {d ? <TasksView data={d.data} today={d.today} initialTab={tab} openNew={sp.get("nova") === "1"} /> : <PageSkeleton />}
    </>
  );
}
