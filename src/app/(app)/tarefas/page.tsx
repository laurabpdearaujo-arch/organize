import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth";
import { localDate } from "@/lib/calendar/dto";
import { listTasks } from "@/lib/tasks/repository";
import { TasksView, type TasksTab } from "./tasks-view";

export default function TarefasPage({ searchParams }: PageProps<"/tarefas">) {
  return (
    <>
      <PageHeader title="Tarefas" subtitle="To-dos do dia a dia, carreira, prazos e feedbacks" />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl border border-border bg-card" />}>
        <TasksSection searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function TasksSection({ searchParams }: { searchParams: PageProps<"/tarefas">["searchParams"] }) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const data = await listTasks(user.id);
  const today = localDate(new Date(), user.timezone);
  const tab: TasksTab = sp.aba === "carreira" ? "carreira" : "geral";
  return <TasksView data={data} today={today} initialTab={tab} />;
}
