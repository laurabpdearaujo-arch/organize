import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function LeiturasPage() {
  return (
    <>
      <PageHeader title="Leituras e Filmes" subtitle="Livros, séries e meta diária" />
      <EmptyState
        icon={BookOpen}
        title="Nenhum livro ou filme ainda"
        description="Em breve: livros com progresso e meta de páginas, filmes e séries."
      />
    </>
  );
}
