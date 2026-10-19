import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth";
import { localDate } from "@/lib/calendar/dto";
import { loadHabits } from "@/lib/habits/repository";
import { HabitsView } from "./habits-view";

export default function HabitosPage() {
  return (
    <>
      <PageHeader title="Hábitos" subtitle="Grade semanal e consistência" />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl border border-border bg-card" />}>
        <HabitsSection />
      </Suspense>
    </>
  );
}

async function HabitsSection() {
  const user = await getCurrentUser();
  const habits = await loadHabits(user.id);
  return <HabitsView habits={habits} today={localDate(new Date(), user.timezone)} />;
}
