"use client";

import { useState, useTransition } from "react";
import { BookOpen, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/components/modal";
import type { ReadingData } from "@/lib/reading/repository";
import { BOOK_STATUS_LABEL, daysLeft, pace, percent, type BookStatus } from "@/lib/reading/stats";
import { createBook, deleteBook, setBookPage, updateBook } from "./actions";
import { Stars, brDate } from "./stars";

type Book = ReadingData["books"][number];

/** Dados do livro no formato do formulário (para ações rápidas como "Começar a ler"). */
const asInput = (b: Book) => ({
  title: b.title,
  author: b.author ?? "",
  totalPages: b.totalPages ?? "",
  currentPage: b.currentPage,
  status: b.status,
  startedOn: b.startedOn ?? "",
  finishedOn: b.finishedOn ?? "",
  rating: b.rating,
  notes: b.notes ?? "",
});

export function BookLists({ data, today, onNew }: { data: ReadingData; today: string; onNew: () => void }) {
  const [editing, setEditing] = useState<Book | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const by = (s: BookStatus) => data.books.filter((b) => b.status === s);
  const reading = by("reading");
  const want = by("want");
  const read = by("read").sort((a, b) => (b.finishedOn ?? "").localeCompare(a.finishedOn ?? ""));
  const dropped = by("dropped");

  if (!data.books.length) {
    return (
      <div className="space-y-3">
        <EmptyState icon={BookOpen} title="Nenhum livro ainda" description="Cadastre o que está lendo, o que quer ler e o que já leu. Os livros em andamento mostram o progresso e quantos dias faltam no seu ritmo." />
        <div className="flex justify-center">
          <button type="button" onClick={onNew} className={primaryBtn}>Novo livro</button>
        </div>
      </div>
    );
  }

  function start(b: Book) {
    setError(null);
    startTransition(async () => {
      const r = await updateBook({ id: b.id, data: { ...asInput(b), status: "reading" } });
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <Section title="Lendo" count={reading.length} empty="Nenhum livro em andamento. Em “Quero ler”, clique em Começar.">
        <div className="grid gap-3 md:grid-cols-2">
          {reading.map((b) => (
            <ReadingCard key={b.id} book={b} rows={data.progress.filter((p) => p.bookId === b.id)} today={today} onOpen={() => setEditing(b)} />
          ))}
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Quero ler" count={want.length} empty="A fila está vazia.">
          <ul className="divide-y divide-border">
            {want.map((b) => (
              <li key={b.id} className="flex items-center gap-2 py-2">
                <button type="button" onClick={() => setEditing(b)} className="min-w-0 flex-1 text-left text-sm hover:underline">
                  {b.title}
                  <span className="block truncate text-xs text-muted-foreground">{[b.author, b.totalPages ? `${b.totalPages} páginas` : null].filter(Boolean).join(" · ")}</span>
                </button>
                <button type="button" onClick={() => start(b)} className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted">Começar</button>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Lidos" count={read.length} empty="Nenhum livro concluído ainda. Ao chegar na última página, ele aparece aqui.">
          <ul className="divide-y divide-border">
            {read.map((b) => (
              <li key={b.id} className="flex items-center gap-2 py-2">
                <button type="button" onClick={() => setEditing(b)} className="min-w-0 flex-1 text-left text-sm hover:underline">
                  {b.title}
                  <span className="block truncate text-xs text-muted-foreground">{[b.author, b.finishedOn ? `terminou em ${brDate(b.finishedOn)}` : null].filter(Boolean).join(" · ")}</span>
                </button>
                <Stars value={b.rating} />
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {dropped.length > 0 && (
        <Section title="Abandonados" count={dropped.length} empty="">
          <ul className="divide-y divide-border">
            {dropped.map((b) => (
              <li key={b.id} className="flex items-center gap-2 py-2">
                <button type="button" onClick={() => setEditing(b)} className="min-w-0 flex-1 text-left text-sm text-muted-foreground hover:underline">
                  {b.title}
                  {b.totalPages ? <span className="block text-xs">parou na pág. {b.currentPage} de {b.totalPages}</span> : null}
                </button>
                <button type="button" onClick={() => start(b)} className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted">Retomar</button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {editing && <BookDialog key={editing.id} book={editing} today={today} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Section({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-2 font-medium">
        {title} <span className="text-sm font-normal text-muted-foreground">({count})</span>
      </h2>
      {count ? children : <p className="py-3 text-sm text-muted-foreground">{empty}</p>}
    </section>
  );
}

function ReadingCard({ book: b, rows, today, onOpen }: { book: Book; rows: ReadingData["progress"]; today: string; onOpen: () => void }) {
  const [page, setPage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const p = pace(rows, today);
  const left = daysLeft(b, p);
  const pct = percent(b);

  function save(n: number) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const r = await setBookPage({ id: b.id, page: n, date: today });
      if (!r.ok) return setError(r.error);
      setPage("");
      if (r.finished) setNotice("Livro concluído! Ele foi para “Lidos”. Abra para dar uma nota.");
    });
  }

  return (
    <div className="rounded-xl border border-border p-3">
      <button type="button" onClick={onOpen} className="block w-full text-left hover:underline">
        <span className="font-medium">{b.title}</span>
        {b.author && <span className="block text-xs text-muted-foreground">{b.author}</span>}
      </button>
      <div className="mt-2 h-2 rounded-full bg-muted">
        <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${pct * 100}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {b.totalPages ? `Pág. ${b.currentPage} de ${b.totalPages} · ${Math.round(pct * 100)}%` : `Pág. ${b.currentPage} (sem nº total de páginas)`}
      </p>
      <p className="text-xs text-muted-foreground">
        {p ? `Ritmo: ${p < 10 ? p.toFixed(1).replace(".", ",") : Math.round(p)} pág./dia` : "Atualize a página para ver seu ritmo"}
        {left !== null && left > 0 ? ` · faltam ~${left} dia${left === 1 ? "" : "s"}` : ""}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (page.trim() !== "") save(Number(page));
        }}
        className="mt-2 flex gap-2"
      >
        <input
          type="number"
          min={0}
          max={b.totalPages ?? undefined}
          className={`${inputCls} py-1.5`}
          value={page}
          onChange={(e) => setPage(e.target.value)}
          placeholder="Parei na página…"
          aria-label={`Página em que parou em ${b.title}`}
        />
        <button type="submit" disabled={pending || page.trim() === ""} className={`${primaryBtn} shrink-0 py-1.5`}>Salvar</button>
        <button type="button" disabled={pending} onClick={() => save(b.totalPages ? Math.min(b.totalPages, b.currentPage + 10) : b.currentPage + 10)} className={`${secondaryBtn} shrink-0 px-3 py-1.5`}>
          +10
        </button>
      </form>
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
      {notice && <p role="status" className="mt-1 text-xs text-success">{notice}</p>}
    </div>
  );
}

export function BookDialog({ book, today, onClose }: { book: Book | null; today: string; onClose: () => void }) {
  const [title, setTitle] = useState(book?.title ?? "");
  const [author, setAuthor] = useState(book?.author ?? "");
  const [totalPages, setTotalPages] = useState(book?.totalPages ? String(book.totalPages) : "");
  const [status, setStatus] = useState<BookStatus>(book?.status ?? "want");
  const [currentPage, setCurrentPage] = useState(String(book?.currentPage ?? 0));
  const [startedOn, setStartedOn] = useState(book?.startedOn ?? "");
  const [finishedOn, setFinishedOn] = useState(book?.finishedOn ?? "");
  const [rating, setRating] = useState<number | null>(book?.rating ?? null);
  const [notes, setNotes] = useState(book?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const showPage = status === "reading" || status === "dropped";
  const showFinish = status === "read" || status === "dropped";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const data = {
      title,
      author,
      totalPages: totalPages.trim() === "" ? "" : Number(totalPages),
      currentPage: status === "want" ? 0 : Number(currentPage || 0),
      status,
      startedOn: status === "want" ? "" : startedOn,
      finishedOn: showFinish ? finishedOn : "",
      rating,
      notes,
    };
    startTransition(async () => {
      const r = book ? await updateBook({ id: book.id, data }) : await createBook(data);
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <Modal title={book ? "Editar livro" : "Novo livro"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div>
          <label htmlFor="btitle" className={labelCls}>Título</label>
          <input id="btitle" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={300} autoFocus={!book} />
        </div>
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <div>
            <label htmlFor="bauthor" className={labelCls}>Autor(a)</label>
            <input id="bauthor" className={inputCls} value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={200} />
          </div>
          <div>
            <label htmlFor="bpages" className={labelCls}>Nº de páginas</label>
            <input id="bpages" type="number" min={1} max={30000} className={inputCls} value={totalPages} onChange={(e) => setTotalPages(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="bstatus" className={labelCls}>Situação</label>
            <select id="bstatus" className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as BookStatus)}>
              {(Object.keys(BOOK_STATUS_LABEL) as BookStatus[]).map((s) => <option key={s} value={s}>{BOOK_STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          {showPage && (
            <div>
              <label htmlFor="bcur" className={labelCls}>Página atual</label>
              <input id="bcur" type="number" min={0} max={30000} className={inputCls} value={currentPage} onChange={(e) => setCurrentPage(e.target.value)} />
            </div>
          )}
        </div>
        {status !== "want" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="bstart" className={labelCls}>Começou em</label>
              <input id="bstart" type="date" className={inputCls} value={startedOn} max={today} onChange={(e) => setStartedOn(e.target.value)} />
            </div>
            {showFinish && (
              <div>
                <label htmlFor="bend" className={labelCls}>{status === "read" ? "Terminou em" : "Parou em"}</label>
                <input id="bend" type="date" className={inputCls} value={finishedOn} max={today} onChange={(e) => setFinishedOn(e.target.value)} />
              </div>
            )}
          </div>
        )}
        {status === "read" && (
          <div>
            <span className={labelCls}>Nota</span>
            <Stars value={rating} onChange={setRating} size="md" />
          </div>
        )}
        <div>
          <label htmlFor="bnotes" className={labelCls}>Comentário</label>
          <textarea id="bnotes" rows={3} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} placeholder="O que achou, citações, para quem indicaria…" />
        </div>
        {book && showPage && <p className="text-xs text-muted-foreground">Mudar a página aqui é só correção e não entra no ritmo. Para registrar a leitura do dia, use “Parei na página” no card.</p>}
        <div className="flex items-center gap-2">
          {book && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Excluir “${book.title}”?`)) return;
                startTransition(async () => {
                  const r = await deleteBook(book.id);
                  if (r.ok) onClose();
                  else setError(r.error);
                });
              }}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-danger hover:bg-danger/10"
            >
              <Trash2 className="size-3" /> Excluir
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className={secondaryBtn}>Cancelar</button>
            <button type="submit" disabled={pending} className={primaryBtn}>{pending ? "Salvando…" : "Salvar"}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
