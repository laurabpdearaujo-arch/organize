"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Flag, NotebookText, Plus, Trash2 } from "lucide-react";
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/components/modal";
import { colorHex } from "@/lib/calendar/colors";
import type { TasksData } from "@/lib/tasks/repository";
import {
  AREA_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  STATUS_ORDER,
  columnOf,
  dueLabel,
  isOverdue,
  placeInColumn,
  type TaskArea,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/rules";
import { createTask, deleteTask, moveTask, updateTask } from "./actions";

export type Task = TasksData["tasks"][number];
type Project = TasksData["projects"][number];
type Move = { id: string; status: TaskStatus; index: number };

const COLUMN_STYLE: Record<TaskStatus, { dot: string; bg: string }> = {
  todo: { dot: "bg-primary", bg: "bg-primary/5" },
  doing: { dot: "bg-warning", bg: "bg-warning/5" },
  done: { dot: "bg-success", bg: "bg-success/5" },
};
const TONE: Record<string, string> = {
  overdue: "bg-danger/10 text-danger",
  today: "bg-warning/15 text-warning",
  soon: "bg-muted text-foreground",
  later: "bg-muted text-muted-foreground",
};
const DONE_PREVIEW = 8;

/** Ordem de "por prazo": atrasadas e com data primeiro (data mais próxima), depois sem prazo. */
const byDue = (a: Task, b: Task) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || Number(b.hardDeadline) - Number(a.hardDeadline);

/**
 * Quadro de uma área. `tasks` = todas as tarefas da área (para calcular a ordem real);
 * `visible` = filtro (ex.: projeto) — arrastar com filtro insere antes do cartão de destino.
 */
export function Board({
  area,
  tasks,
  projects,
  today,
  visible = () => true,
  defaultProjectId = null,
  view,
}: {
  area: TaskArea;
  tasks: Task[];
  projects: Project[];
  today: string;
  visible?: (t: Task) => boolean;
  defaultProjectId?: string | null;
  view: "board" | "due";
}) {
  const [items, applyMove] = useOptimistic(tasks, (state, m: Move) => {
    const placed = new Map(placeInColumn(state, m.id, m.status, m.index).map((p) => [p.id, p.position]));
    return state.map((t) => {
      if (t.id === m.id) return { ...t, status: m.status, position: placed.get(t.id)!, completedOn: m.status === "done" ? (t.status === "done" ? t.completedOn : today) : null };
      return placed.has(t.id) ? { ...t, position: placed.get(t.id)! } : t;
    });
  });
  const [dragId, setDragId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ status: TaskStatus; beforeId: string | null } | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [adding, setAdding] = useState<TaskStatus | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [showAllDone, setShowAllDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const projectOf = (id: string | null) => projects.find((p) => p.id === id) ?? null;

  /** Converte "antes do cartão X" (na lista filtrada) em índice da coluna inteira. */
  function move(id: string, status: TaskStatus, beforeId: string | null) {
    const full = columnOf(items, status).filter((t) => t.id !== id);
    let index = beforeId ? full.findIndex((t) => t.id === beforeId) : -1;
    if (index === -1) {
      const shown = full.filter(visible);
      index = shown.length ? full.indexOf(shown[shown.length - 1]) + 1 : full.length;
    }
    if (status === "done") index = 0;
    setError(null);
    startTransition(async () => {
      applyMove({ id, status, index });
      const r = await moveTask({ id, status, index });
      if (!r.ok) setError(r.error);
    });
  }

  function quickAdd(status: TaskStatus) {
    const title = newTitle.trim();
    if (!title) return;
    setError(null);
    startTransition(async () => {
      const r = await createTask({ area, title, status, projectId: defaultProjectId });
      if (r.ok) setNewTitle("");
      else setError(r.error);
    });
  }

  const card = (t: Task) => {
    const due = t.dueDate ? dueLabel(t.dueDate, today) : null;
    const project = projectOf(t.projectId);
    const done = t.status === "done";
    return (
      <li
        key={t.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", t.id);
          e.dataTransfer.effectAllowed = "move";
          setDragId(t.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setHover(null);
        }}
        onDragOver={(e) => {
          if (!dragId || view !== "board") return;
          e.preventDefault();
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          const col = columnOf(items, t.status).filter(visible).filter((x) => x.id !== dragId);
          const i = col.findIndex((x) => x.id === t.id);
          const beforeId = e.clientY < r.top + r.height / 2 ? t.id : (col[i + 1]?.id ?? null);
          setHover({ status: t.status, beforeId });
        }}
        className={`group rounded-xl border bg-card p-3 shadow-sm transition ${dragId === t.id ? "opacity-40" : ""} ${
          t.hardDeadline && !done ? "border-danger/50" : "border-border"
        } ${hover && hover.beforeId === t.id && dragId !== t.id ? "mt-3 ring-2 ring-primary/40" : ""}`}
      >
        <button type="button" onClick={() => setEditing(t)} className={`block w-full text-left text-sm ${done ? "text-muted-foreground line-through decoration-muted-foreground/40" : ""}`}>
          {t.title}
        </button>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          {t.hardDeadline && !done && (
            <span className="inline-flex items-center gap-1 rounded-full bg-danger px-2 py-0.5 font-medium text-white">
              <Flag className="size-3" /> Prazo fatal
            </span>
          )}
          {due && !done && <span className={`rounded-full px-2 py-0.5 ${TONE[due.tone]}`}>{due.text}</span>}
          {t.priority === "high" && !done && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">Prioridade alta</span>}
          {project && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ backgroundColor: colorHex(project.color) }} /> {project.name}
            </span>
          )}
          {t.notes && <NotebookText className="size-3.5 text-muted-foreground" aria-label="Tem anotação" />}
          <select
            aria-label={`Mover “${t.title}”`}
            value={t.status}
            onChange={(e) => move(t.id, e.target.value as TaskStatus, null)}
            className="ml-auto cursor-pointer rounded border border-transparent bg-transparent px-1 text-[11px] text-muted-foreground hover:border-border"
          >
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
      </li>
    );
  };

  const quickForm = (status: TaskStatus) =>
    adding === status ? (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          quickAdd(status);
        }}
        className="space-y-2"
      >
        <input
          className={inputCls}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="O que precisa fazer? (Enter para salvar)"
          autoFocus
          maxLength={300}
          aria-label="Título da nova tarefa"
          onKeyDown={(e) => e.key === "Escape" && setAdding(null)}
        />
        <div className="flex gap-2">
          <button type="submit" className={`${primaryBtn} py-1.5`}>Adicionar</button>
          <button type="button" onClick={() => setAdding(null)} className={`${secondaryBtn} py-1.5`}>Fechar</button>
        </div>
      </form>
    ) : (
      <button
        type="button"
        onClick={() => {
          setAdding(status);
          setNewTitle("");
        }}
        className="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-card"
      >
        <Plus className="size-4" /> Nova tarefa
      </button>
    );

  return (
    <>
      {error && <p role="alert" className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {view === "board" ? (
        <div className="grid gap-3 md:grid-cols-3">
          {STATUS_ORDER.map((status) => {
            let col = columnOf(items, status).filter(visible);
            const total = col.length;
            if (status === "done" && !showAllDone) col = col.slice(0, DONE_PREVIEW);
            return (
              <section
                key={status}
                aria-label={STATUS_LABEL[status]}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  if (hover?.status !== status) setHover({ status, beforeId: null });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain") || dragId;
                  if (id) move(id, status, hover?.status === status ? hover.beforeId : null);
                  setDragId(null);
                  setHover(null);
                }}
                className={`flex min-h-40 flex-col rounded-2xl p-2 ${COLUMN_STYLE[status].bg} ${hover?.status === status && dragId ? "ring-2 ring-primary/30" : ""}`}
              >
                <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-medium">
                  <span className={`size-2 rounded-full ${COLUMN_STYLE[status].dot}`} />
                  {STATUS_LABEL[status]}
                  <span className="text-muted-foreground">{total}</span>
                </h2>
                <ul className="space-y-2">{col.map(card)}</ul>
                {status === "done" && total > DONE_PREVIEW && (
                  <button type="button" onClick={() => setShowAllDone(!showAllDone)} className="mt-2 text-xs text-primary hover:underline">
                    {showAllDone ? "Mostrar menos" : `Mostrar todas (${total})`}
                  </button>
                )}
                {status !== "done" && <div className="mt-2">{quickForm(status)}</div>}
              </section>
            );
          })}
        </div>
      ) : (
        <DueList tasks={items.filter((t) => t.status !== "done").filter(visible)} today={today} card={card} />
      )}

      {editing && <TaskDialog key={editing.id} task={editing} area={area} projects={projects} onClose={() => setEditing(null)} />}
    </>
  );
}

function DueList({ tasks, today, card }: { tasks: Task[]; today: string; card: (t: Task) => React.ReactNode }) {
  const sorted = [...tasks].sort(byDue);
  const groups: [string, Task[]][] = [
    ["Atrasadas", sorted.filter((t) => isOverdue(t, today))],
    ["Hoje", sorted.filter((t) => t.dueDate === today)],
    ["Próximos 7 dias", sorted.filter((t) => t.dueDate && t.dueDate > today && dueLabel(t.dueDate, today).tone === "soon")],
    ["Depois", sorted.filter((t) => t.dueDate && dueLabel(t.dueDate, today).tone === "later")],
    ["Sem prazo", sorted.filter((t) => !t.dueDate)],
  ];
  if (!tasks.length) return <p className="rounded-2xl border border-dashed border-border bg-card py-10 text-center text-sm text-muted-foreground">Nenhuma tarefa em aberto.</p>;
  return (
    <div className="space-y-4">
      {groups
        .filter(([, list]) => list.length)
        .map(([label, list]) => (
          <section key={label}>
            <h2 className={`mb-2 text-sm font-medium ${label === "Atrasadas" ? "text-danger" : ""}`}>
              {label} <span className="font-normal text-muted-foreground">({list.length})</span>
            </h2>
            <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">{list.map(card)}</ul>
          </section>
        ))}
    </div>
  );
}

export function TaskDialog({ task, area: defaultArea, projects, defaultProjectId = null, onClose }: { task: Task | null; area: TaskArea; projects: Project[]; defaultProjectId?: string | null; onClose: () => void }) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [area, setArea] = useState<TaskArea>(task?.area ?? defaultArea);
  const [projectId, setProjectId] = useState(task?.projectId ?? defaultProjectId ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "todo");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [hard, setHard] = useState(task?.hardDeadline ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const activeProjects = projects.filter((p) => !p.archivedAt || p.id === task?.projectId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const data = { area, projectId: area === "career" ? projectId : "", title, notes, status, priority, dueDate, hardDeadline: hard && !!dueDate };
    startTransition(async () => {
      const r = task ? await updateTask({ id: task.id, data }) : await createTask(data);
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <Modal title={task ? "Editar tarefa" : "Nova tarefa"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div>
          <label htmlFor="ttitle" className={labelCls}>Tarefa</label>
          <input id="ttitle" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={300} autoFocus={!task} />
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm" role="radiogroup" aria-label="Área">
          {(["general", "career"] as TaskArea[]).map((a) => (
            <button key={a} type="button" role="radio" aria-checked={area === a} onClick={() => setArea(a)} className={`flex-1 rounded-md px-2 py-1.5 ${area === a ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>
              {AREA_LABEL[a]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="tstatus" className={labelCls}>Coluna</label>
            <select id="tstatus" className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="tprio" className={labelCls}>Prioridade</label>
            <select id="tprio" className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </div>
        </div>
        {area === "career" && (
          <div>
            <label htmlFor="tproj" className={labelCls}>Projeto</label>
            <select id="tproj" className={inputCls} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Sem projeto</option>
              {activeProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 items-end gap-3">
          <div>
            <label htmlFor="tdue" className={labelCls}>Prazo (opcional)</label>
            <input id="tdue" type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <label className={`flex items-center gap-2 pb-2 text-sm ${dueDate ? "" : "opacity-50"}`}>
            <input type="checkbox" checked={hard && !!dueDate} disabled={!dueDate} onChange={(e) => setHard(e.target.checked)} className="size-4 accent-[var(--danger)]" />
            Prazo fatal (não pode passar)
          </label>
        </div>
        <div>
          <label htmlFor="tnotes" className={labelCls}>Anotações</label>
          <textarea id="tnotes" rows={3} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} placeholder="Detalhes, links, próximos passos…" />
        </div>
        <div className="flex items-center gap-2">
          {task && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Excluir “${task.title}”?`)) return;
                startTransition(async () => {
                  const r = await deleteTask(task.id);
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
