import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth";
import { localDate } from "@/lib/calendar/dto";
import { listReading } from "@/lib/reading/repository";
import { ReadingView, type ReadingTab } from "./reading-view";

export default function LeiturasPage({ searchParams }: PageProps<"/leituras">) {
  return (
    <>
      <PageHeader title="Leituras e Filmes" subtitle="Livros, filmes e séries" />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl border border-border bg-card" />}>
        <ReadingSection searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ReadingSection({ searchParams }: { searchParams: PageProps<"/leituras">["searchParams"] }) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const data = await listReading(user.id);
  const today = localDate(new Date(), user.timezone);
  const tab: ReadingTab = sp.aba === "filmes" ? "filmes" : "livros";
  return <ReadingView data={data} today={today} initialTab={tab} />;
}
