import { useSearchParams } from "react-router";
import { PageHeader, PageSkeleton } from "@/web/components/page-header";
import { usePageData } from "@/web/lib/api";
import { ReadingView, type ReadingTab } from "./reading-view";

export function LeiturasPage() {
  const [sp] = useSearchParams();
  const d = usePageData("leituras");
  const tab: ReadingTab = sp.get("aba") === "filmes" ? "filmes" : "livros";
  return (
    <>
      <PageHeader title="Leituras e Filmes" subtitle="Livros, filmes e séries" />
      {d ? <ReadingView data={d.data} today={d.today} initialTab={tab} /> : <PageSkeleton />}
    </>
  );
}
