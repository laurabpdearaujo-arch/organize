"use client";

import { useEffect, useState, useTransition } from "react";
import { AlarmClock, Briefcase, CheckCircle2, Flag, FolderKanban, ListTodo, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/components/modal";
import { EVENT_COLORS, colorHex, type EventColor } from "@/lib/calendar/colors";
import type { TasksData } from "@/lib/tasks/repository";
import { dropParam } from "@/lib/drop-param";
import { summary, type TaskArea } from "@/lib/tasks/rules";
import { createFeedback, createProject, deleteFeedback, deleteProject, updateFeedback, updateProject } from "./actions";
import { Board, TaskDialog, type Task } from "./board";

export type TasksTab = "geral" | "carreira";
type Project = TasksData["projects"][number];
type Feedback = TasksData["feedbacks"][number];
type View = "board" | "due";
const NO_PROJECT = "__sem";

const brDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export function TasksView({ data, today, initialTab, openNew = false }: { data: TasksData; today: string; initialTab: TasksTab; openNew?: boolean }) {
  const [tab, setTabState] = useState<TasksTab>(initialTab);
  const [view, setView] = useState<View>("board");
  const [project, setProject] = useState<string | null>(null);
  // "?nova=1" (ação rápida do Painel) já abre o formulário
  const [newTask, setNewTask] = useState(openNew);
  useEffect(() => dropParam("nova"), []);
  const [managing, setManaging] = useState(false);
  const area: TaskArea = tab === "carreira" ? "career" : "general";
  const areaTasks = data.tasks.filter((t) => t.area === area);
  const s = summary(areaTasks, today);
  const activeProjects = data.projects.filter((p) => !p.archivedAt);

  function setTab(t: TasksTab) {
    setTabState(t);
    setProject(null);
    const url = new URL(window.location.href);
    url.searchParams.set("aba", t);
    window.history.replaceState(null, "", url);
  }

  const visible = (t: Task) => (project === null ? true : project === NO_PROJECT ? !t.projectId : t.projectId === project);
  const realProject = project && project !== NO_PROJECT ? project : null;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 rounded-xl bg-muted p-1 text-sm" aria-label="Seções">
          {(
            [
              ["geral", "Geral", ListTodo],
              ["carreira", "Carreira", Briefcase],
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
        <div className="flex items-center gap-2">
          {tab === "carreira" && (
            <button type="button" onClick={() => setManaging(true)} className={`flex items-center gap-1.5 ${secondaryBtn}`}>
              <FolderKanban className="size-4" /> Projetos
            </button>
          )}
          <button type="button" onClick={() => setNewTask(true)} className={`flex items-center gap-1.5 ${primaryBtn}`}>
            <Plus className="size-4" /> Nova tarefa
          </button>
        </div>
      </div>

      {tab === "carreira" ? (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={Flag} tone="text-danger" label="Prazos fatais" value={String(s.hardOpen)} hint="Em aberto, com destaque máximo" />
          <StatCard icon={AlarmClock} tone="text-warning" label="Atrasadas" value={String(s.overdue)} hint="Prazo já passou" />
          <StatCard icon={CheckCircle2} tone="text-success" label="Concluídas" value={String(s.done)} unit={`de ${s.total}`} hint={`${s.total ? Math.round((s.done / s.total) * 100) : 0}% das tarefas`} />
          <StatCard icon={FolderKanban} tone="text-primary" label="Projetos" value={String(activeProjects.length)} hint="Frentes de trabalho ativas" />
        </div>
      ) : (
        (s.overdue > 0 || s.dueToday > 0) && (
          <p className="mb-3 text-sm text-muted-foreground">
            {[s.overdue ? `${s.overdue} atrasada(s)` : null, s.dueToday ? `${s.dueToday} para hoje` : null].filter(Boolean).join(" · ")}
          </p>
        )
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs">
          {(
            [
              ["board", "Quadro"],
              ["due", "Por prazo"],
            ] as [View, string][]
          ).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setView(v)} className={`rounded-md px-2 py-1 ${view === v ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
        {tab === "carreira" && activeProjects.length > 0 && (
          <div className="flex flex-wrap gap-1 text-xs" role="group" aria-label="Filtrar por projeto">
            {[{ id: null as string | null, name: "Todos", color: null as string | null }, ...activeProjects.map((p) => ({ id: p.id, name: p.name, color: p.color })), { id: NO_PROJECT, name: "Sem projeto", color: null }].map((p) => (
              <button
                key={p.id ?? "all"}
                type="button"
                onClick={() => setProject(p.id)}
                aria-pressed={project === p.id}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 ${project === p.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
              >
                {p.color && <span className="size-2 rounded-full" style={{ backgroundColor: colorHex(p.color) }} />}
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <Board key={tab} area={area} tasks={areaTasks} projects={data.projects} today={today} visible={visible} defaultProjectId={realProject} view={view} />

      {tab === "carreira" && <Feedbacks list={data.feedbacks} today={today} />}

      {newTask && <TaskDialog task={null} area={area} projects={data.projects} defaultProjectId={realProject} onClose={() => setNewTask(false)} />}
      {managing && <ProjectsDialog projects={data.projects} tasks={data.tasks} onClose={() => setManaging(false)} />}
    </>
  );
}

function StatCard({ icon: Icon, tone, label, value, unit, hint }: { icon: typeof Flag; tone: string; label: string; value: string; unit?: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className={`size-4 ${tone}`} />
      </div>
      <p className="mt-2 text-2xl font-semibold">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

// ---------- projetos ----------

function ProjectsDialog({ projects, tasks, onClose }: { projects: Project[]; tasks: Task[]; onClose: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<EventColor>("violet");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<EventColor>("violet");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const count = (id: string) => tasks.filter((t) => t.projectId === id && t.status !== "done").length;

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) after?.();
      else setError(r.error ?? "Erro.");
    });
  }

  const colors = (value: EventColor, set: (c: EventColor) => void) => (
    <div className="flex gap-1.5">
      {(Object.keys(EVENT_COLORS) as EventColor[]).map((c) => (
        <button key={c} type="button" aria-label={EVENT_COLORS[c].label} aria-pressed={value === c} onClick={() => set(c)} className={`size-6 rounded-full ring-offset-2 ring-offset-[var(--card)] ${value === c ? "ring-2 ring-foreground" : ""}`} style={{ backgroundColor: EVENT_COLORS[c].hex }} />
      ))}
    </div>
  );

  return (
    <Modal title="Projetos" onClose={onClose}>
      {error && <p role="alert" className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          act(() => createProject({ name, color }), () => setName(""));
        }}
        className="mb-4 space-y-2 rounded-xl border border-border p-3"
      >
        <label htmlFor="pname" className={labelCls}>Novo projeto</label>
        <input id="pname" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Relatório trimestral, Mestrado, Freela" required maxLength={120} />
        <div className="flex items-center justify-between gap-2">
          {colors(color, setColor)}
          <button type="submit" disabled={pending} className={primaryBtn}>Criar</button>
        </div>
      </form>
      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum projeto ainda. Projetos agrupam as tarefas de carreira por frente de trabalho.</p>
      ) : (
        <ul className="divide-y divide-border">
          {projects.map((p) =>
            editId === p.id ? (
              <li key={p.id} className="space-y-2 py-2">
                <input className={inputCls} value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={120} aria-label="Nome do projeto" />
                <div className="flex items-center justify-between gap-2">
                  {colors(editColor, setEditColor)}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditId(null)} className={secondaryBtn}>Cancelar</button>
                    <button type="button" disabled={pending} onClick={() => act(() => updateProject({ id: p.id, data: { name: editName, color: editColor } }), () => setEditId(null))} className={primaryBtn}>Salvar</button>
                  </div>
                </div>
              </li>
            ) : (
              <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: colorHex(p.color) }} />
                <span className={`flex-1 ${p.archivedAt ? "text-muted-foreground line-through" : ""}`}>{p.name}</span>
                <span className="text-xs text-muted-foreground">{count(p.id)} em aberto</span>
                <button type="button" onClick={() => act(() => updateProject({ id: p.id, data: { name: p.name, color: p.color, archived: !p.archivedAt } }))} className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
                  {p.archivedAt ? "Reativar" : "Arquivar"}
                </button>
                <button
                  type="button"
                  aria-label={`Editar ${p.name}`}
                  onClick={() => {
                    setEditId(p.id);
                    setEditName(p.name);
                    setEditColor(p.color as EventColor);
                  }}
                  className="rounded p-1 text-muted-foreground hover:bg-muted"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Excluir ${p.name}`}
                  onClick={() => window.confirm(`Excluir o projeto “${p.name}”? As tarefas dele continuam, só que sem projeto.`) && act(() => deleteProject(p.id))}
                  className="rounded p-1 text-muted-foreground hover:bg-muted"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </Modal>
  );
}

// ---------- feedbacks ----------

function Feedbacks({ list, today }: { list: Feedback[]; today: string }) {
  const [editing, setEditing] = useState<Feedback | "new" | null>(null);
  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-medium">
          <MessageSquare className="size-4 text-primary" /> Feedbacks recebidos <span className="text-sm font-normal text-muted-foreground">({list.length})</span>
        </h2>
        <button type="button" onClick={() => setEditing("new")} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted">
          <Plus className="size-3" /> Registrar
        </button>
      </div>
      {list.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Anote retornos recebidos com data, quem deu, o tema e o que fazer com eles.</p>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => setEditing(f)} className="block w-full py-3 text-left hover:bg-muted/40">
                <p className="text-xs text-muted-foreground">{[brDate(f.date), f.fromWhom, f.topic].filter(Boolean).join(" · ")}</p>
                <p className="mt-0.5 whitespace-pre-line text-sm">{f.content}</p>
                {f.action && <p className="mt-1 text-sm text-primary">O que fazer: {f.action}</p>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <FeedbackDialog key={editing === "new" ? "new" : editing.id} item={editing === "new" ? null : editing} today={today} onClose={() => setEditing(null)} />}
    </section>
  );
}

function FeedbackDialog({ item, today, onClose }: { item: Feedback | null; today: string; onClose: () => void }) {
  const [date, setDate] = useState(item?.date ?? today);
  const [fromWhom, setFromWhom] = useState(item?.fromWhom ?? "");
  const [topic, setTopic] = useState(item?.topic ?? "");
  const [content, setContent] = useState(item?.content ?? "");
  const [action, setAction] = useState(item?.action ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const data = { date, fromWhom, topic, content, action };
    startTransition(async () => {
      const r = item ? await updateFeedback({ id: item.id, data }) : await createFeedback(data);
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <Modal title={item ? "Editar feedback" : "Registrar feedback"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="grid grid-cols-[140px_1fr] gap-3">
          <div>
            <label htmlFor="fdate" className={labelCls}>Data</label>
            <input id="fdate" type="date" className={inputCls} value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="ffrom" className={labelCls}>De quem</label>
            <input id="ffrom" className={inputCls} value={fromWhom} onChange={(e) => setFromWhom(e.target.value)} maxLength={200} placeholder="Ex.: gestora, cliente, colega" />
          </div>
        </div>
        <div>
          <label htmlFor="ftopic" className={labelCls}>Tema</label>
          <input id="ftopic" className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} placeholder="Ex.: apresentação, comunicação, prazos" />
        </div>
        <div>
          <label htmlFor="fcontent" className={labelCls}>O que foi dito</label>
          <textarea id="fcontent" rows={3} className={inputCls} value={content} onChange={(e) => setContent(e.target.value)} required maxLength={4000} />
        </div>
        <div>
          <label htmlFor="faction" className={labelCls}>O que fazer com isso</label>
          <textarea id="faction" rows={2} className={inputCls} value={action} onChange={(e) => setAction(e.target.value)} maxLength={4000} />
        </div>
        <div className="flex items-center gap-2">
          {item && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm("Excluir este feedback?")) return;
                startTransition(async () => {
                  const r = await deleteFeedback(item.id);
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
