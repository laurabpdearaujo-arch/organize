import { useState, useTransition } from "react";
import { Clapperboard, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "@/web/components/empty-state";
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/web/components/modal";
import type { ReadingData } from "@/lib/reading/repository";
import { MEDIA_KIND_LABEL, MEDIA_STATUS_LABEL, type MediaKind, type MediaStatus } from "@/lib/reading/stats";
import { createMedia, deleteMedia, updateMedia } from "./actions";
import { Stars, brDate } from "./stars";

type Media = ReadingData["media"][number];
type KindFilter = "all" | MediaKind;

const asInput = (m: Media) => ({
  kind: m.kind,
  title: m.title,
  status: m.status,
  season: m.season,
  episode: m.episode,
  finishedOn: m.finishedOn ?? "",
  rating: m.rating,
  notes: m.notes ?? "",
});

const whereStopped = (m: Pick<Media, "kind" | "season" | "episode">) =>
  m.kind === "series" && (m.season || m.episode) ? [m.season ? `T${m.season}` : null, m.episode ? `E${m.episode}` : null].filter(Boolean).join(" · ") : null;

export function MediaTab({ items, today }: { items: Media[]; today: string }) {
  const [kind, setKind] = useState<KindFilter>("all");
  const [editing, setEditing] = useState<Media | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const shown = items.filter((m) => kind === "all" || m.kind === kind);
  const by = (s: MediaStatus) => shown.filter((m) => m.status === s);
  const watched = by("watched").sort((a, b) => (b.finishedOn ?? "").localeCompare(a.finishedOn ?? ""));
  const watchedThisYear = items.filter((m) => m.status === "watched" && m.finishedOn?.startsWith(today.slice(0, 4))).length;

  function quick(m: Media, patch: Partial<ReturnType<typeof asInput>>) {
    setError(null);
    startTransition(async () => {
      const r = await updateMedia({ id: m.id, data: { ...asInput(m), ...patch } });
      if (!r.ok) setError(r.error);
    });
  }

  const row = (m: Media) => (
    <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
      <span className="w-12 shrink-0 rounded bg-muted px-1.5 py-0.5 text-center text-[11px] text-muted-foreground">{MEDIA_KIND_LABEL[m.kind]}</span>
      <button type="button" onClick={() => setEditing(m)} className="min-w-0 flex-1 text-left text-sm hover:underline">
        {m.title}
        {(whereStopped(m) || m.finishedOn) && (
          <span className="block text-xs text-muted-foreground">
            {[m.status === "watching" && whereStopped(m) ? `parou em ${whereStopped(m)}` : null, m.finishedOn ? `visto em ${brDate(m.finishedOn)}` : null].filter(Boolean).join(" · ")}
          </span>
        )}
      </button>
      <Stars value={m.rating} />
      {m.status === "watching" && m.kind === "series" && (
        <button type="button" disabled={pending} onClick={() => quick(m, { episode: (m.episode ?? 0) + 1 })} className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted" title="Próximo episódio">
          +1 ep.
        </button>
      )}
      {m.status === "want" && (
        <button type="button" disabled={pending} onClick={() => quick(m, { status: "watching" })} className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted">
          Comecei
        </button>
      )}
      {m.status !== "watched" && (
        <button type="button" disabled={pending} onClick={() => quick(m, { status: "watched", finishedOn: today })} className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted">
          Terminei
        </button>
      )}
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs">
          {(
            [
              ["all", "Todos"],
              ["movie", "Filmes"],
              ["series", "Séries"],
            ] as [KindFilter, string][]
          ).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-md px-2 py-1 ${kind === k ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {watchedThisYear > 0 && <span className="text-xs text-muted-foreground">{watchedThisYear} visto(s) em {today.slice(0, 4)}</span>}
          <button type="button" onClick={() => setEditing("new")} className={`flex items-center gap-1.5 ${primaryBtn}`}>
            <Plus className="size-4" /> Novo filme ou série
          </button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {items.length === 0 ? (
        <EmptyState icon={Clapperboard} title="Nenhum filme ou série ainda" description="Monte sua lista do que quer ver, acompanhe as séries em andamento e dê nota ao que já viu." />
      ) : (
        <>
          <Section title="Vendo" list={by("watching")} empty="Nada em andamento." row={row} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Quero ver" list={by("want")} empty="A lista está vazia." row={row} />
            <Section title="Vistos" list={watched} empty="Nada visto ainda." row={row} />
          </div>
        </>
      )}

      {editing && <MediaDialog key={editing === "new" ? "new" : editing.id} item={editing === "new" ? null : editing} today={today} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Section({ title, list, empty, row }: { title: string; list: Media[]; empty: string; row: (m: Media) => React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-1 font-medium">
        {title} <span className="text-sm font-normal text-muted-foreground">({list.length})</span>
      </h2>
      {list.length ? <ul className="divide-y divide-border">{list.map(row)}</ul> : <p className="py-3 text-sm text-muted-foreground">{empty}</p>}
    </section>
  );
}

function MediaDialog({ item, today, onClose }: { item: Media | null; today: string; onClose: () => void }) {
  const [kind, setKind] = useState<MediaKind>(item?.kind ?? "movie");
  const [title, setTitle] = useState(item?.title ?? "");
  const [status, setStatus] = useState<MediaStatus>(item?.status ?? "want");
  const [season, setSeason] = useState(item?.season ? String(item.season) : "");
  const [episode, setEpisode] = useState(item?.episode ? String(item.episode) : "");
  const [finishedOn, setFinishedOn] = useState(item?.finishedOn ?? today);
  const [rating, setRating] = useState<number | null>(item?.rating ?? null);
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const num = (s: string) => (s.trim() === "" ? "" : Number(s));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const data = { kind, title, status, season: num(season), episode: num(episode), finishedOn: status === "watched" ? finishedOn : "", rating, notes };
    startTransition(async () => {
      const r = item ? await updateMedia({ id: item.id, data }) : await createMedia(data);
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <Modal title={item ? "Editar" : "Novo filme ou série"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm" role="radiogroup" aria-label="Tipo">
          {(["movie", "series"] as MediaKind[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`flex-1 rounded-md px-2 py-1.5 ${kind === k ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>
              {MEDIA_KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="mtitle" className={labelCls}>Título</label>
          <input id="mtitle" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={300} autoFocus={!item} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mstatus" className={labelCls}>Situação</label>
            <select id="mstatus" className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as MediaStatus)}>
              {(Object.keys(MEDIA_STATUS_LABEL) as MediaStatus[]).map((s) => <option key={s} value={s}>{MEDIA_STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          {status === "watched" && (
            <div>
              <label htmlFor="mend" className={labelCls}>Terminou em</label>
              <input id="mend" type="date" className={inputCls} value={finishedOn} max={today} onChange={(e) => setFinishedOn(e.target.value)} />
            </div>
          )}
        </div>
        {kind === "series" && status === "watching" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="mseason" className={labelCls}>Temporada</label>
              <input id="mseason" type="number" min={1} max={999} className={inputCls} value={season} onChange={(e) => setSeason(e.target.value)} />
            </div>
            <div>
              <label htmlFor="mep" className={labelCls}>Episódio</label>
              <input id="mep" type="number" min={1} max={9999} className={inputCls} value={episode} onChange={(e) => setEpisode(e.target.value)} />
            </div>
          </div>
        )}
        {status === "watched" && (
          <div>
            <span className={labelCls}>Nota</span>
            <Stars value={rating} onChange={setRating} size="md" />
          </div>
        )}
        <div>
          <label htmlFor="mnotes" className={labelCls}>Comentário</label>
          <textarea id="mnotes" rows={3} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} placeholder="Onde assistir, quem indicou, o que achou…" />
        </div>
        <div className="flex items-center gap-2">
          {item && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Excluir “${item.title}”?`)) return;
                startTransition(async () => {
                  const r = await deleteMedia(item.id);
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
