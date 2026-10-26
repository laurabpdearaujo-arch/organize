import { useState } from "react";
import { BookOpen, BookMarked, CalendarCheck, Clapperboard, Plus } from "lucide-react";
import { primaryBtn } from "@/web/components/modal";
import type { ReadingData } from "@/lib/reading/repository";
import { bookSummary } from "@/lib/reading/stats";
import { BookDialog, BookLists } from "./books";
import { MediaTab } from "./media";

export type ReadingTab = "livros" | "filmes";

export function ReadingView({ data, today, initialTab }: { data: ReadingData; today: string; initialTab: ReadingTab }) {
  const [tab, setTabState] = useState<ReadingTab>(initialTab);
  const [newBook, setNewBook] = useState(false);
  const s = bookSummary(data.books, data.progress, today);

  function setTab(t: ReadingTab) {
    setTabState(t);
    const url = new URL(window.location.href);
    url.searchParams.set("aba", t);
    window.history.replaceState(null, "", url);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 rounded-xl bg-muted p-1 text-sm" aria-label="Seções">
          {(
            [
              ["livros", "Livros", BookOpen],
              ["filmes", "Filmes e séries", Clapperboard],
            ] as const
          ).map(([t, label, Icon]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-current={tab === t ? "page" : undefined}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${tab === t ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </nav>
        {tab === "livros" && (
          <button type="button" onClick={() => setNewBook(true)} className={`flex items-center gap-1.5 ${primaryBtn}`}>
            <Plus className="size-4" /> Novo livro
          </button>
        )}
      </div>

      {tab === "livros" ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={BookOpen} label="Lendo agora" value={String(s.reading)} hint="Livros em andamento" />
            <StatCard icon={CalendarCheck} label={`Lidos em ${today.slice(0, 4)}`} value={String(s.readThisYear)} hint="Concluídos este ano" />
            <StatCard icon={BookMarked} label="Últimos 7 dias" value={String(s.pagesLast7)} unit="páginas" hint="Somando todos os livros" />
            <StatCard icon={Plus} label="Quero ler" value={String(s.want)} hint="Na fila" />
          </div>
          <BookLists data={data} today={today} onNew={() => setNewBook(true)} />
          {newBook && <BookDialog book={null} today={today} onClose={() => setNewBook(false)} />}
        </>
      ) : (
        <MediaTab items={data.media} today={today} />
      )}
    </>
  );
}

function StatCard({ icon: Icon, label, value, unit, hint }: { icon: typeof BookOpen; label: string; value: string; unit?: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="size-4 text-primary" />
      </div>
      <p className="mt-2 text-2xl font-semibold">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
