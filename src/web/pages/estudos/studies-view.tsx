import { useMemo, useOptimistic, useState, useTransition } from "react";
import { CalendarDays, ChevronDown, ChevronRight, FileUp, GraduationCap, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { EmptyState } from "@/web/components/empty-state";
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/web/components/modal";
import { EVENT_COLORS, colorHex, type EventColor } from "@/lib/calendar/colors";
import type { PlanList } from "@/lib/studies/repository";
import { buildTree, isGroup, leavesOf, progress, stats, STATUS_LABEL, type StudyStatus, type TreeNode } from "@/lib/studies/progress";
import { archiveStudyPlan, deleteStudyPlan, setStudyStatusMany, updateStudyItem, updateStudyPlan } from "./actions";
import { AddItemDialog } from "./add-item-dialog";
import { ImportDialog } from "./import-dialog";
import { ItemDialog, logTotals, minutesText } from "./item-dialog";

type Plan = PlanList[number];
type Item = Plan["items"][number];
type Node = TreeNode<Item>;
type Filter = "all" | "pending" | "done" | "scheduled";
type Patch = { ids: string[]; patch: Partial<Item> };

const STATUS_STYLE: Record<StudyStatus, string> = {
  not_started: "border-border text-muted-foreground",
  in_progress: "border-blue-400/50 bg-blue-500/10 text-blue-600 dark:text-blue-300",
  partial: "border-warning/50 bg-warning/10 text-warning",
  done: "border-success/50 bg-success/10 text-success",
};

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const hours = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}` : `${m} min`);

export function StudiesView({ plans, today, initialPlanId }: { plans: PlanList; today: string; initialPlanId: string | null }) {
  const active = plans.filter((p) => !p.archivedAt);
  const archived = plans.filter((p) => p.archivedAt);
  const [selectedId, setSelectedId] = useState<string | null>(
    (initialPlanId && plans.some((p) => p.id === initialPlanId) ? initialPlanId : null) ?? active[0]?.id ?? null,
  );
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const selected = plans.find((p) => p.id === selectedId) ?? null;

  function select(id: string) {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("plano", id);
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Marque o que já estudou e agende datas: os conteúdos com data aparecem no calendário.</p>
        <button type="button" onClick={() => setImporting(true)} className={`flex items-center gap-1.5 ${primaryBtn}`}>
          <FileUp className="size-4" /> Importar PDF de conteúdo
        </button>
      </div>

      {notice && (
        <p role="status" className="flex items-start justify-between gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          {notice}
          <button type="button" onClick={() => setNotice(null)} className="text-xs underline">ok</button>
        </p>
      )}

      {active.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Nenhum plano de estudo ainda" description="Importe o PDF com o conteúdo programático: cada parte vira um plano, dividido em temas e conteúdos." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((p) => {
            const s = stats(buildTree(p.items));
            const pr = progress(s);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => select(p.id)}
                aria-current={p.id === selectedId ? "true" : undefined}
                className={`rounded-2xl border bg-card p-4 text-left transition-colors ${p.id === selectedId ? "border-primary ring-1 ring-primary" : "border-border hover:bg-muted/40"}`}
              >
                <p className="flex items-center gap-2 font-medium">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorHex(p.color) }} />
                  <span className="truncate">{p.name}</span>
                </p>
                <div className="mt-3 h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full" style={{ width: `${pr * 100}%`, backgroundColor: colorHex(p.color) }} />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {Math.round(pr * 100)}% · {s.done} de {s.total} concluído(s){s.scheduled ? ` · ${s.scheduled} agendado(s)` : ""}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {selected && <PlanView key={selected.id} plan={selected} today={today} />}

      {archived.length > 0 && (
        <details className="rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">Planos arquivados ({archived.length})</summary>
          <ul className="mt-2 divide-y divide-border text-sm">
            {archived.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                {p.name}
                <button type="button" className={secondaryBtn} onClick={() => archiveStudyPlan({ id: p.id, archived: false })}>Restaurar</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {importing && (
        <ImportDialog
          existingPlans={active.map((p) => ({ id: p.id, name: p.name }))}
          onClose={() => setImporting(false)}
          onImported={(id, message) => {
            setImporting(false);
            setNotice(message);
            select(id);
          }}
        />
      )}
    </div>
  );
}

function PlanView({ plan, today }: { plan: Plan; today: string }) {
  const [items, applyPatch] = useOptimistic(plan.items, (state, p: Patch) => state.map((i) => (p.ids.includes(i.id) ? { ...i, ...p.patch } : i)));
  const tree = useMemo(() => buildTree(items), [items]);
  const s = stats(tree);
  const pr = progress(s);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [schedule, setSchedule] = useState<Item | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const detail = items.find((i) => i.id === detailId) ?? null;
  const lt = logTotals(plan.logs);
  const itemMinutes = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of plan.logs) m.set(l.itemId, (m.get(l.itemId) ?? 0) + (l.minutes ?? 0));
    return m;
  }, [plan.logs]);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const q = search.trim().toLowerCase();
  const filtering = filter !== "all" || q !== "";

  const matches = (n: Node) => {
    if (q && !`${n.code ?? ""} ${n.title} ${n.description ?? ""}`.toLowerCase().includes(q)) return false;
    if (filter === "pending") return n.status !== "done";
    if (filter === "done") return n.status === "done";
    if (filter === "scheduled") return !!n.plannedDate && n.status !== "done";
    return true;
  };
  const visible = (n: Node): boolean => (isGroup(n) ? (n.children.length ? n.children.some(visible) : !filtering) : matches(n));

  function setStatus(ids: string[], status: StudyStatus) {
    setError(null);
    startTransition(async () => {
      applyPatch({ ids, patch: { status } });
      const r = ids.length === 1 ? await updateStudyItem({ id: ids[0], status }) : await setStudyStatusMany({ ids, status });
      if (!r.ok) setError(r.error);
    });
  }

  const toggle = (id: string) => setOpen((o) => {
    const n = new Set(o);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const allGroups = items.filter((i) => i.isGroup || items.some((c) => c.parentId === i.id)).map((i) => i.id);

  function renderNodes(nodes: Node[], depth: number): React.ReactNode {
    return nodes.filter(visible).map((n) => {
      if (isGroup(n)) {
        const gs = stats(n.children);
        const expanded = filtering || open.has(n.id);
        const ids = leavesOf(n).map((l) => l.id);
        return (
          <li key={n.id}>
            <div className="group flex items-center gap-2 rounded-lg py-1.5 pr-2 hover:bg-muted/40" style={{ paddingLeft: depth * 16 + 4 }}>
              <button type="button" onClick={() => toggle(n.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" aria-expanded={expanded}>
                {expanded ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
                <span className={`truncate ${depth === 0 ? "font-semibold" : "font-medium"}`}>
                  {n.code && /^\d/.test(n.code) ? `${n.code}. ` : n.code ? `${n.code} — ` : ""}
                  {n.title}
                </span>
              </button>
              <span className="hidden w-24 sm:block">
                <span className="block h-1.5 rounded-full bg-muted">
                  <span className="block h-1.5 rounded-full" style={{ width: `${progress(gs) * 100}%`, backgroundColor: colorHex(plan.color) }} />
                </span>
              </span>
              <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{gs.done}/{gs.total}</span>
              <button type="button" aria-label={`Editar ${n.title}`} onClick={() => setDetailId(n.id)} className="rounded p-1 text-muted-foreground opacity-60 hover:bg-muted group-hover:opacity-100">
                <Pencil className="size-3" />
              </button>
              <select
                aria-label={`Marcar todos de ${n.title}`}
                className="w-7 cursor-pointer appearance-none rounded bg-transparent text-center text-xs text-muted-foreground opacity-60 hover:bg-muted group-hover:opacity-100"
                value=""
                onChange={(e) => e.target.value && setStatus(ids, e.target.value as StudyStatus)}
                title="Marcar todo o tema"
              >
                <option value="">⋯</option>
                <option value="done">Marcar tudo como concluído</option>
                <option value="not_started">Marcar tudo como não iniciado</option>
              </select>
            </div>
            {expanded && n.children.length > 0 && <ul>{renderNodes(n.children, depth + 1)}</ul>}
            {expanded && n.children.length === 0 && (
              <p className="py-1 text-xs text-muted-foreground" style={{ paddingLeft: (depth + 1) * 16 + 26 }}>Vazio: use “+ Adicionar” para colocar conteúdos aqui.</p>
            )}
          </li>
        );
      }
      return (
        <li key={n.id} className="flex flex-wrap items-center gap-2 rounded-lg py-1.5 pr-2 hover:bg-muted/40" style={{ paddingLeft: depth * 16 + 26 }}>
          <select
            aria-label={`Status de ${n.title}`}
            value={n.status}
            onChange={(e) => setStatus([n.id], e.target.value as StudyStatus)}
            className={`cursor-pointer rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLE[n.status]}`}
          >
            {(Object.keys(STATUS_LABEL) as StudyStatus[]).map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setDetailId(n.id)}
            className={`min-w-0 flex-1 text-left text-sm hover:underline ${n.status === "done" ? "text-muted-foreground line-through decoration-muted-foreground/40" : ""}`}
            title="Abrir: registrar estudo, anotações e edição"
          >
            {n.code && /^\d/.test(n.code) && <span className="text-muted-foreground">{n.code} </span>}
            {n.title}
            {n.description && <span className="block truncate text-xs text-muted-foreground no-underline">{n.description}</span>}
          </button>
          {itemMinutes.get(n.id) ? <span className="text-xs tabular-nums text-primary" title="tempo já estudado">{minutesText(itemMinutes.get(n.id)!)} estudado</span> : null}
          {n.tags.map((t) => <span key={t} className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground">{t}</span>)}
          {n.durationMinutes && <span className="text-xs tabular-nums text-muted-foreground">{hours(n.durationMinutes)}</span>}
          <button
            type="button"
            onClick={() => setSchedule(n)}
            className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs ${n.plannedDate ? (n.plannedDate < today && n.status !== "done" ? "border-danger/40 text-danger" : "border-primary/40 text-primary") : "border-dashed border-border text-muted-foreground hover:bg-muted"}`}
          >
            <CalendarDays className="size-3" />
            {n.plannedDate ? `${br(n.plannedDate)}${n.plannedTime ? ` ${n.plannedTime}` : ""}` : "Agendar"}
          </button>
        </li>
      );
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="relative mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <span className="size-3 rounded-full" style={{ backgroundColor: colorHex(plan.color) }} />
            {plan.name}
          </h2>
          {plan.objective && <p className="text-sm text-muted-foreground">{plan.objective}</p>}
          <p className="text-xs text-muted-foreground">
            {Math.round(pr * 100)}% · {s.done} de {s.total} concluído(s)
            {s.partial ? ` · ${s.partial} parcial(is)` : ""}
            {s.inProgress ? ` · ${s.inProgress} em andamento` : ""}
            {s.scheduled ? ` · ${s.scheduled} agendado(s)` : ""}
            {s.minutes ? ` · faltam ${hours(s.minutes - s.minutesDone)} de aulas` : ""}
          </p>
          {(lt.minutes > 0 || lt.questions > 0) && (
            <p className="text-xs text-muted-foreground">
              Estudado: {minutesText(lt.minutes)}
              {lt.questions ? ` · ${lt.questions} questões` : ""}
              {lt.accuracy !== null ? ` · ${Math.round(lt.accuracy * 100)}% de acerto` : ""}
            </p>
          )}
        </div>
        <button type="button" aria-label="Opções do plano" onClick={() => setMenu((m) => !m)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
          <MoreHorizontal className="size-4" />
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
            <ul className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-border bg-card p-1 text-sm shadow-lg">
              <li><button type="button" className="w-full rounded-lg px-3 py-1.5 text-left hover:bg-muted" onClick={() => { setMenu(false); setEditing(true); }}>Editar plano</button></li>
              <li><button type="button" className="w-full rounded-lg px-3 py-1.5 text-left hover:bg-muted" onClick={() => { setMenu(false); archiveStudyPlan({ id: plan.id, archived: true }); }}>Arquivar</button></li>
              <li><button type="button" className="w-full rounded-lg px-3 py-1.5 text-left text-danger hover:bg-muted" onClick={() => { setMenu(false); if (window.confirm(`Excluir o plano “${plan.name}” e todo o progresso?`)) deleteStudyPlan({ id: plan.id }); }}>Excluir</button></li>
            </ul>
          </>
        )}
      </div>

      <div className="mb-2 h-2 rounded-full bg-muted">
        <div className="h-2 rounded-full transition-all" style={{ width: `${pr * 100}%`, backgroundColor: colorHex(plan.color) }} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className={`${inputCls} w-full py-1.5 sm:w-56`} placeholder="Buscar conteúdo…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar conteúdo" />
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs">
          {(
            [
              ["all", "Todos"],
              ["pending", "Pendentes"],
              ["scheduled", "Agendados"],
              ["done", "Concluídos"],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-md px-2 py-1 ${filter === f ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
        {!filtering && (
          <button type="button" onClick={() => setOpen(open.size ? new Set() : new Set(allGroups))} className="ml-auto text-xs text-primary hover:underline">
            {open.size ? "Recolher tudo" : "Expandir tudo"}
          </button>
        )}
        <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted">
          <Plus className="size-3" /> Adicionar
        </button>
      </div>

      {error && <p role="alert" className="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <ul className="space-y-0.5">{renderNodes(tree, 0)}</ul>
      {filtering && !tree.some(visible) && <p className="py-6 text-center text-sm text-muted-foreground">Nada com esse filtro.</p>}

      {schedule && <ScheduleDialog item={schedule} today={today} onClose={() => setSchedule(null)} />}
      {detail && (
        <ItemDialog
          key={detail.id}
          plan={{ ...plan, items }}
          item={detail}
          isLeaf={!detail.isGroup && !items.some((i) => i.parentId === detail.id)}
          today={today}
          onClose={() => setDetailId(null)}
        />
      )}
      {adding && <AddItemDialog plan={plan} items={items} onClose={() => setAdding(false)} />}
      {editing && <PlanDialog plan={plan} onClose={() => setEditing(false)} />}
    </section>
  );
}

function ScheduleDialog({ item, today, onClose }: { item: Item; today: string; onClose: () => void }) {
  const [date, setDate] = useState(item.plannedDate ?? today);
  const [withTime, setWithTime] = useState(!!item.plannedTime);
  const [time, setTime] = useState(item.plannedTime ?? "19:00");
  const [minutes, setMinutes] = useState(String(item.plannedMinutes ?? item.durationMinutes ?? 60));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(remove: boolean) {
    setError(null);
    const patch = remove
      ? { plannedDate: null, plannedTime: null, plannedMinutes: null }
      : { plannedDate: date, plannedTime: withTime ? time : null, plannedMinutes: withTime ? Number(minutes) || 60 : null };
    startTransition(async () => {
      const r = await updateStudyItem({ id: item.id, ...patch });
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <Modal title="Agendar estudo" onClose={onClose} size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
        className="space-y-4"
      >
        <p className="text-sm">
          {item.code && /^\d/.test(item.code) && <span className="text-muted-foreground">{item.code} </span>}
          {item.title}
        </p>
        <div>
          <label htmlFor="sdate" className={labelCls}>Dia</label>
          <input id="sdate" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withTime} onChange={(e) => setWithTime(e.target.checked)} /> Definir horário
        </label>
        {withTime && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="stime" className={labelCls}>Início</label>
              <input id="stime" type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="smin" className={labelCls}>Duração (min)</label>
              <input id="smin" type="number" min={5} max={1440} className={inputCls} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Aparece no calendário {withTime ? "nesse horário" : "como compromisso do dia"}.</p>
        {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex items-center gap-2">
          {item.plannedDate && (
            <button type="button" disabled={pending} onClick={() => save(true)} className="rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10">Remover data</button>
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

function PlanDialog({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const [name, setName] = useState(plan.name);
  const [objective, setObjective] = useState(plan.objective ?? "");
  const [color, setColor] = useState<EventColor>((plan.color as EventColor) ?? "violet");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await updateStudyPlan({ id: plan.id, name, objective, color });
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <Modal title="Editar plano" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="plname" className={labelCls}>Nome</label>
          <input id="plname" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus />
        </div>
        <div>
          <label htmlFor="plobj" className={labelCls}>Objetivo (opcional)</label>
          <textarea id="plobj" rows={2} className={inputCls} value={objective} onChange={(e) => setObjective(e.target.value)} maxLength={1000} placeholder="Ex.: passar na ANPEC 2027" />
        </div>
        <div className="flex gap-2">
          {(Object.keys(EVENT_COLORS) as EventColor[]).map((c) => (
            <button key={c} type="button" aria-label={EVENT_COLORS[c].label} aria-pressed={color === c} onClick={() => setColor(c)} className={`size-7 rounded-full ring-offset-2 ring-offset-[var(--card)] ${color === c ? "ring-2 ring-foreground" : ""}`} style={{ backgroundColor: EVENT_COLORS[c].hex }} />
          ))}
        </div>
        {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancelar</button>
          <button type="submit" disabled={pending} className={primaryBtn}>{pending ? "Salvando…" : "Salvar"}</button>
        </div>
      </form>
    </Modal>
  );
}
