"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, PiggyBank, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/components/modal";
import { EVENT_COLORS, colorHex, type EventColor } from "@/lib/calendar/colors";
import type { FinanceData } from "@/lib/finance/repository";
import { centsToInput, CURRENCIES, CURRENCY_SYMBOL, formatMoney, type Currency } from "@/lib/finance/money";
import { addContribution, archiveGoal, deleteContribution, deleteGoal, saveGoal } from "./actions";

type Goal = FinanceData["goals"][number];

function fullDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

/** Meses inteiros entre hoje e o prazo (mínimo 1). */
function monthsUntil(today: string, deadline: string) {
  const [ty, tm] = today.split("-").map(Number);
  const [dy, dm] = deadline.split("-").map(Number);
  return Math.max(1, (dy - ty) * 12 + (dm - tm));
}

export function GoalsPanel({ data, today }: { data: FinanceData; today: string }) {
  const [edit, setEdit] = useState<{ goal: Goal | null } | null>(null);
  const [contrib, setContrib] = useState<{ goal: Goal; direction: "in" | "out" } | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const active = data.goals.filter((g) => !g.archivedAt);
  const archived = data.goals.filter((g) => g.archivedAt);
  const historyGoal = data.goals.find((g) => g.id === history) ?? null;

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Erro.");
    });
  }

  const card = (g: Goal) => {
    const pct = Math.max(0, Math.min(1, g.savedCents / g.targetCents));
    const missing = Math.max(0, g.targetCents - g.savedCents);
    const perMonth = g.deadline && missing > 0 && g.deadline >= today ? Math.ceil(missing / monthsUntil(today, g.deadline)) : null;
    return (
      <div key={g.id} className="relative rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium">{g.name}</p>
            <p className="text-xs text-muted-foreground">
              Meta de {formatMoney(g.targetCents, g.currency)}
              {g.deadline && ` até ${fullDate(g.deadline)}`}
            </p>
          </div>
          <button type="button" aria-label={`Opções de ${g.name}`} onClick={() => setMenu(menu === g.id ? null : g.id)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <MoreHorizontal className="size-4" />
          </button>
        </div>
        <div className="mt-3 flex items-baseline justify-between text-sm">
          <span className="text-lg font-semibold tabular-nums">{formatMoney(g.savedCents, g.currency)}</span>
          <span className="text-muted-foreground">{Math.round(pct * 100)}%</span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-muted">
          <div className="h-2 rounded-full" style={{ width: `${pct * 100}%`, backgroundColor: colorHex(g.color) }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {missing === 0 ? "Meta atingida 🎉" : `Faltam ${formatMoney(missing, g.currency)}`}
          {perMonth !== null && ` · cerca de ${formatMoney(perMonth, g.currency)}/mês até o prazo`}
          {g.deadline && g.deadline < today && missing > 0 && " · prazo vencido"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setContrib({ goal: g, direction: "in" })} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">+ Aportar</button>
          <button type="button" onClick={() => setContrib({ goal: g, direction: "out" })} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted">− Retirar</button>
          <button type="button" onClick={() => setHistory(g.id)} className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">Histórico ({g.contributions.length})</button>
        </div>
        {menu === g.id && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
            <ul className="absolute right-3 top-11 z-20 w-40 rounded-xl border border-border bg-card p-1 text-sm shadow-lg">
              <li><button type="button" className="w-full rounded-lg px-3 py-1.5 text-left hover:bg-muted" onClick={() => { setMenu(null); setEdit({ goal: g }); }}>Editar</button></li>
              <li><button type="button" className="w-full rounded-lg px-3 py-1.5 text-left hover:bg-muted" onClick={() => { setMenu(null); act(() => archiveGoal({ id: g.id, archived: !g.archivedAt })); }}>{g.archivedAt ? "Restaurar" : "Arquivar"}</button></li>
              <li><button type="button" className="w-full rounded-lg px-3 py-1.5 text-left text-danger hover:bg-muted" onClick={() => { setMenu(null); if (window.confirm(`Excluir a meta “${g.name}” e todos os aportes?`)) act(() => deleteGoal({ id: g.id })); }}>Excluir</button></li>
            </ul>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Acompanhe objetivos como reserva de emergência ou uma viagem. Registre aportes e retiradas.</p>
        <button type="button" onClick={() => setEdit({ goal: null })} className={`flex shrink-0 items-center gap-1.5 ${primaryBtn}`}>
          <Plus className="size-4" /> Nova meta
        </button>
      </div>
      {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {active.length === 0 ? (
        <EmptyState icon={PiggyBank} title="Nenhuma meta ainda" description="Crie uma meta com valor-alvo e, se quiser, um prazo." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">{active.map(card)}</div>
      )}
      {archived.length > 0 && (
        <details className="rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">Arquivadas ({archived.length})</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">{archived.map(card)}</div>
        </details>
      )}

      {edit && <GoalDialog key={edit.goal?.id ?? "new"} goal={edit.goal} onClose={() => setEdit(null)} />}
      {contrib && <ContributionDialog {...contrib} today={today} onClose={() => setContrib(null)} />}
      {historyGoal && (
        <Modal title={`Histórico de “${historyGoal.name}”`} onClose={() => setHistory(null)}>
          {historyGoal.contributions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum aporte ainda.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {historyGoal.contributions.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {fullDate(c.date)}
                    {c.note && <span className="ml-2 text-muted-foreground">{c.note}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`tabular-nums ${c.amountCents < 0 ? "text-danger" : "text-success"}`}>{formatMoney(c.amountCents, historyGoal.currency, { signed: true })}</span>
                    <button type="button" aria-label="Excluir aporte" onClick={() => window.confirm("Excluir este registro?") && act(() => deleteContribution({ id: c.id }))} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}

function GoalDialog({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(goal ? centsToInput(goal.targetCents) : "");
  const [currency, setCurrency] = useState<Currency>(goal?.currency ?? "BRL");
  const [deadline, setDeadline] = useState(goal?.deadline ?? "");
  const [color, setColor] = useState<EventColor>((goal?.color as EventColor) ?? "violet");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await saveGoal({ id: goal?.id ?? null, input: { name, target, currency, deadline: deadline || null, color } });
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <Modal title={goal ? "Editar meta" : "Nova meta"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="gname" className={labelCls}>Nome</label>
          <input id="gname" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Reserva de emergência" required maxLength={60} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="gtarget" className={labelCls}>Valor-alvo</label>
            <input id="gtarget" inputMode="decimal" className={inputCls} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0,00" required />
          </div>
          <div>
            <label htmlFor="gcur" className={labelCls}>Moeda</label>
            <select id="gcur" className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{CURRENCY_SYMBOL[c]}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="gdead" className={labelCls}>Prazo (opcional)</label>
          <input id="gdead" type="date" className={inputCls} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <div>
          <p className={labelCls}>Cor</p>
          <div className="flex gap-2">
            {(Object.keys(EVENT_COLORS) as EventColor[]).map((c) => (
              <button key={c} type="button" aria-label={EVENT_COLORS[c].label} aria-pressed={color === c} onClick={() => setColor(c)} className={`size-7 rounded-full ring-offset-2 ring-offset-[var(--card)] ${color === c ? "ring-2 ring-foreground" : ""}`} style={{ backgroundColor: EVENT_COLORS[c].hex }} />
            ))}
          </div>
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

function ContributionDialog({ goal, direction, today, onClose }: { goal: Goal; direction: "in" | "out"; today: string; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await addContribution({ goalId: goal.id, amount, direction, date, note });
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <Modal title={`${direction === "in" ? "Aportar em" : "Retirar de"} “${goal.name}”`} onClose={onClose} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="camount" className={labelCls}>Valor ({CURRENCY_SYMBOL[goal.currency]})</label>
            <input id="camount" inputMode="decimal" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" required autoFocus />
          </div>
          <div>
            <label htmlFor="cdate" className={labelCls}>Data</label>
            <input id="cdate" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>
        <div>
          <label htmlFor="cnote" className={labelCls}>Observação (opcional)</label>
          <input id="cnote" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </div>
        <p className="text-xs text-muted-foreground">O aporte registra o progresso da meta. Se o dinheiro saiu de uma conta, lance também uma transferência para a conta onde ele está guardado.</p>
        {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancelar</button>
          <button type="submit" disabled={pending} className={primaryBtn}>{pending ? "Salvando…" : "Salvar"}</button>
        </div>
      </form>
    </Modal>
  );
}
