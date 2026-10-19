"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Archive, ChevronLeft, ChevronRight, Check, Flame, MoreHorizontal, Pause, Plus, Target, Trophy, CalendarCheck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Modal, inputCls, primaryBtn, secondaryBtn } from "@/components/modal";
import { colorHex } from "@/lib/calendar/colors";
import { addDays, maxDate, weekStartOf } from "@/lib/habits/dates";
import { fullDate, goalLabel, percent, shortDate, WEEKDAY_SHORT } from "@/lib/habits/format";
import {
  dayStatus,
  formatNumber,
  goalSlots,
  habitStreak,
  isCurrentlyPaused,
  overallRate,
  overallStreak,
  rate,
  versionOn,
  weekSummary,
  type DayStatus,
  type HabitData,
} from "@/lib/habits/stats";
import { deleteHabit, setArchived, setLog, setPaused } from "./actions";
import { Heatmap, WeeklyBars } from "./charts";
import { HabitDialog, type HabitDialogMode } from "./habit-dialog";

type LogAction = { habitId: string; date: string; value: number | null };

const GRID = "md:grid md:grid-cols-[minmax(160px,1.6fr)_repeat(7,minmax(40px,1fr))_minmax(100px,auto)] md:items-center md:gap-2";

export function HabitsView({ habits, today }: { habits: HabitData[]; today: string }) {
  const [list, applyLog] = useOptimistic(habits, (state, a: LogAction) =>
    state.map((h) => {
      if (h.id !== a.habitId) return h;
      const logs = { ...h.logs };
      if (a.value === null) delete logs[a.date];
      else logs[a.date] = a.value;
      return { ...h, logs };
    }),
  );
  const [, startTransition] = useTransition();
  const currentWeek = weekStartOf(today);
  const [weekStart, setWeekStart] = useState(currentWeek);
  const [dialog, setDialog] = useState<HabitDialogMode | null>(null);
  const [logTarget, setLogTarget] = useState<{ habit: HabitData; date: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = list.filter((h) => !h.archived);
  const archived = list.filter((h) => h.archived);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const detail = list.find((h) => h.id === detailId) ?? null;

  function writeLog(habitId: string, date: string, value: number | null) {
    setError(null);
    startTransition(async () => {
      applyLog({ habitId, date, value });
      const res = await setLog({ habitId, date, value });
      if (!res.ok) setError(res.error);
    });
  }

  function onCell(h: HabitData, date: string, status: DayStatus) {
    if (status === "future" || status === "na") return;
    if (h.measure === "boolean") writeLog(h.id, date, h.logs[date] !== undefined ? null : 1);
    else setLogTarget({ habit: h, date });
  }

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Erro.");
    });
  }

  const streak = overallStreak(list, today);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button type="button" onClick={() => setDialog({ kind: "create" })} className={`flex items-center gap-1.5 ${primaryBtn}`}>
          <Plus className="size-4" /> Novo hábito
        </button>
      </div>

      {error && <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {active.length === 0 ? (
        <EmptyState icon={Target} title="Nenhum hábito ativo" description="Crie um hábito para acompanhar sua rotina semanal, sequências e consistência." />
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-medium">Grade semanal</h2>
                <p className="text-xs text-muted-foreground">
                  Toque num dia para registrar. Contorno tracejado colorido = registro em dia de folga (não conta na sequência).
                </p>
              </div>
              <div className="flex items-center gap-1 text-sm">
                <button type="button" aria-label="Semana anterior" onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded-lg p-1.5 hover:bg-muted">
                  <ChevronLeft className="size-4" />
                </button>
                <button type="button" onClick={() => setWeekStart(currentWeek)} className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted">
                  Esta semana
                </button>
                <button type="button" aria-label="Próxima semana" disabled={weekStart >= currentWeek} onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded-lg p-1.5 hover:bg-muted disabled:opacity-30">
                  <ChevronRight className="size-4" />
                </button>
                <span className="ml-1 text-xs text-muted-foreground">
                  {shortDate(days[0])} – {shortDate(days[6])}
                </span>
              </div>
            </div>

            {/* cabeçalho dos dias */}
            <div className={`grid grid-cols-7 gap-1.5 pb-2 text-center text-[11px] text-muted-foreground ${GRID}`}>
              <span className="hidden md:block" />
              {days.map((d, i) => (
                <span key={d} className={d === today ? "font-semibold text-primary" : ""}>
                  {WEEKDAY_SHORT[i]}
                  <br />
                  {Number(d.slice(8))}
                </span>
              ))}
              <span className="hidden text-right md:block">Semana</span>
            </div>

            {active.map((h) => (
              <HabitRow
                key={h.id}
                habit={h}
                days={days}
                today={today}
                weekStart={weekStart}
                onCell={onCell}
                onOpen={() => setDetailId(h.id)}
                onMenu={(action) => {
                  if (action === "edit") setDialog({ kind: "details", habit: h });
                  if (action === "goal") setDialog({ kind: "goal", habit: h });
                  if (action === "correct") setDialog({ kind: "correct", habit: h });
                  if (action === "pause") act(() => setPaused({ habitId: h.id, paused: !isCurrentlyPaused(h, today) }));
                  if (action === "archive") act(() => setArchived({ habitId: h.id, archived: true }));
                  if (action === "delete" && window.confirm(`Excluir “${h.name}” e TODOS os registros? Isso não pode ser desfeito. (Para guardar o histórico, use Arquivar.)`))
                    act(() => deleteHabit({ habitId: h.id }));
                }}
              />
            ))}
          </section>

          <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Flame} label="Sequência atual" value={`${streak.current}`} unit="dia(s)" hint="Dias seguidos cumprindo as metas diárias" />
            <StatCard icon={Trophy} label="Melhor sequência" value={`${streak.best}`} unit="dia(s)" hint="Seu recorde até hoje" />
            <StatCard icon={Target} label="Consistência semanal" value={percent(overallRate(list, 7, today))} hint="Metas cumpridas nos últimos 7 dias" />
            <StatCard icon={CalendarCheck} label="Consistência mensal" value={percent(overallRate(list, 30, today))} hint="Metas cumpridas nos últimos 30 dias" />
          </section>

          <section className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-4">
              <h2 className="font-medium">Mapa de calor</h2>
              <p className="mb-3 text-xs text-muted-foreground">Últimas 18 semanas — quanto mais escuro, mais metas cumpridas no dia.</p>
              <Heatmap habits={list} today={today} />
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <h2 className="font-medium">Comparação entre semanas</h2>
              <p className="mb-3 text-xs text-muted-foreground">% de metas cumpridas por semana (a mais clara está em andamento).</p>
              <WeeklyBars habits={list} today={today} />
            </div>
          </section>
        </>
      )}

      {archived.length > 0 && (
        <details className="mt-4 rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">Arquivados ({archived.length})</summary>
          <ul className="mt-3 space-y-2">
            {archived.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <button type="button" onClick={() => setDetailId(h.id)} className="flex items-center gap-2 hover:underline">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: colorHex(h.color) }} />
                  {h.name}
                </button>
                <span className="flex gap-2">
                  <button type="button" className={secondaryBtn} onClick={() => act(() => setArchived({ habitId: h.id, archived: false }))}>Restaurar</button>
                  <button
                    type="button"
                    className="rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10"
                    onClick={() => window.confirm(`Excluir “${h.name}” e todos os registros?`) && act(() => deleteHabit({ habitId: h.id }))}
                  >
                    Excluir
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {dialog && <HabitDialog key={dialog.kind === "create" ? "create" : `${dialog.kind}-${dialog.habit.id}`} mode={dialog} today={today} onClose={() => setDialog(null)} />}
      {logTarget && (
        <LogDialog
          habit={list.find((h) => h.id === logTarget.habit.id) ?? logTarget.habit}
          date={logTarget.date}
          onClose={() => setLogTarget(null)}
          onSave={(value) => {
            writeLog(logTarget.habit.id, logTarget.date, value);
            setLogTarget(null);
          }}
        />
      )}
      {detail && <HabitDetail habit={detail} today={today} onClose={() => setDetailId(null)} />}
    </>
  );
}

type MenuAction = "edit" | "goal" | "correct" | "pause" | "archive" | "delete";

function HabitRow({
  habit: h,
  days,
  today,
  weekStart,
  onCell,
  onOpen,
  onMenu,
}: {
  habit: HabitData;
  days: string[];
  today: string;
  weekStart: string;
  onCell: (h: HabitData, date: string, status: DayStatus) => void;
  onOpen: () => void;
  onMenu: (a: MenuAction) => void;
}) {
  const [menu, setMenu] = useState(false);
  const paused = isCurrentlyPaused(h, today);
  const v = versionOn(h, today) ?? h.versions.at(-1);
  const summary = weekSummary(h, weekStart, today);

  return (
    <div className={`border-t border-border py-3 ${GRID}`}>
      <div className="relative mb-2 flex items-start justify-between gap-2 md:mb-0">
        <button type="button" onClick={onOpen} className="min-w-0 text-left">
          <span className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorHex(h.color) }} />
            <span className="truncate text-sm font-medium hover:underline">{h.name}</span>
            {paused && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Pausado</span>}
          </span>
          {v && <span className="block truncate pl-4.5 text-xs text-muted-foreground">{goalLabel(h, v)}</span>}
        </button>
        <span className="flex items-center gap-2">
          {summary && <span className="text-xs text-muted-foreground md:hidden">{summary.label}</span>}
          <button type="button" aria-label={`Opções de ${h.name}`} onClick={() => setMenu((m) => !m)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <MoreHorizontal className="size-4" />
          </button>
        </span>
        {menu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
            <ul className="absolute right-0 top-7 z-20 w-60 rounded-xl border border-border bg-card p-1 text-sm shadow-lg">
              {(
                [
                  ["edit", "Editar"],
                  ["goal", "Mudar meta (daqui pra frente)"],
                  ["correct", "Corrigir configuração"],
                  ["pause", paused ? "Retomar" : "Pausar"],
                  ["archive", "Arquivar"],
                  ["delete", "Excluir"],
                ] as [MenuAction, string][]
              ).map(([a, label]) => (
                <li key={a}>
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(false);
                      onMenu(a);
                    }}
                    className={`w-full rounded-lg px-3 py-1.5 text-left hover:bg-muted ${a === "delete" ? "text-danger" : ""}`}
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="grid grid-cols-7 gap-1.5 md:contents">
        {days.map((d) => {
          const st = dayStatus(h, d, today);
          return <DayCell key={d} habit={h} date={d} status={st} value={h.logs[d]} onClick={() => onCell(h, d, st)} />;
        })}
      </div>

      <div className="hidden text-right text-xs text-muted-foreground md:block">
        {summary?.label}
        {summary?.ratio != null && <span className="ml-1">({percent(summary.ratio)})</span>}
      </div>
    </div>
  );
}

const STATUS_TEXT: Record<DayStatus, string> = {
  done: "cumprido",
  extra: "extra — dia fora da frequência, não conta na sequência",
  partial: "parcial",
  missed: "não cumprido",
  exceeded: "acima do limite",
  unregistered: "sem registro",
  pending: "pendente",
  open: "livre",
  off: "folga",
  paused: "pausado",
  na: "antes do início",
  future: "futuro",
};

function DayCell({ habit, date, status, value, onClick }: { habit: HabitData; date: string; status: DayStatus; value: number | undefined; onClick: () => void }) {
  const hex = colorHex(habit.color);
  const disabled = status === "future" || status === "na";
  const label = `${habit.name}, ${shortDate(date)}: ${STATUS_TEXT[status]}${value !== undefined && habit.measure !== "boolean" ? `, ${formatNumber(value)} ${habit.unit ?? ""}` : ""}`;
  const showValue = value !== undefined && habit.measure !== "boolean";

  let style: React.CSSProperties = {};
  let cls = "border border-border text-muted-foreground";
  if (status === "done") {
    style = { backgroundColor: hex, borderColor: hex };
    cls = "border text-white";
  } else if (status === "partial" || (status === "pending" && value !== undefined)) {
    style = { backgroundColor: `color-mix(in srgb, ${hex} 22%, var(--card))`, borderColor: `color-mix(in srgb, ${hex} 40%, var(--card))` };
    cls = "border text-foreground";
  } else if (status === "extra") {
    style = { borderColor: hex, color: hex };
    cls = "border border-dashed bg-transparent";
  } else if (status === "exceeded") {
    cls = "border border-danger/40 bg-danger/10 text-danger";
  } else if (status === "missed") {
    cls = "border border-dashed border-danger/40 text-danger/70";
  } else if (status === "pending") {
    cls = "border-2 border-primary/50 text-muted-foreground";
  } else if (status === "unregistered" || status === "open") {
    cls = "border border-dashed border-border text-muted-foreground";
  } else if (status === "off" || status === "paused" || disabled) {
    cls = "border border-transparent bg-muted/60 text-muted-foreground/60";
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-9 items-center justify-center rounded-lg text-xs font-medium transition-opacity hover:opacity-85 disabled:cursor-default ${cls}`}
      style={style}
    >
      {showValue ? formatNumber(value) : status === "done" || status === "extra" ? <Check className="size-4" /> : status === "paused" ? <Pause className="size-3" /> : status === "off" ? "–" : status === "missed" ? "×" : ""}
    </button>
  );
}

function StatCard({ icon: Icon, label, value, unit, hint }: { icon: typeof Flame; label: string; value: string; unit?: string; hint: string }) {
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

function LogDialog({ habit: h, date, onClose, onSave }: { habit: HabitData; date: string; onClose: () => void; onSave: (v: number | null) => void }) {
  const current = h.logs[date];
  const [text, setText] = useState(current !== undefined ? String(current) : "");
  const v = versionOn(h, date);
  const unit = h.measure === "duration" ? "min" : (h.unit ?? "");
  const parsed = Number(text.replace(",", "."));
  const valid = text.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;

  return (
    <Modal title={`${h.name} · ${shortDate(date)}`} onClose={onClose} size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSave(parsed);
        }}
        className="space-y-4"
      >
        {v?.target != null && (
          <p className="text-sm text-muted-foreground">
            {h.direction === "reduce" ? "Limite" : "Meta"} do dia: {formatNumber(v.target)} {unit}
          </p>
        )}
        <div className="flex items-center gap-2">
          <input type="text" inputMode="decimal" autoFocus className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="0" aria-label={`Quantidade em ${unit}`} />
          <span className="text-sm text-muted-foreground">{unit}</span>
        </div>
        {h.direction === "build" && v?.target != null && (
          <button type="button" className="text-sm text-primary hover:underline" onClick={() => setText(String(v.target))}>
            Preencher com a meta ({formatNumber(v.target)})
          </button>
        )}
        <div className="flex items-center gap-2">
          {current !== undefined && (
            <button type="button" className="rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10" onClick={() => onSave(null)}>
              Apagar registro
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" className={secondaryBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" disabled={!valid} className={primaryBtn}>Salvar</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function HabitDetail({ habit: h, today, onClose }: { habit: HabitData; today: string; onClose: () => void }) {
  const s = habitStreak(h, today);
  const from30 = maxDate(addDays(today, -29), h.createdOn);
  const rate30 = from30 <= today ? rate(goalSlots(h, from30, today, today)) : null;
  const totalLogged = Object.keys(h.logs).length;

  return (
    <Modal title={h.name} onClose={onClose} size="lg">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-muted p-3">
          <p className="text-xl font-semibold">{s.current}</p>
          <p className="text-xs text-muted-foreground">sequência ({s.unit})</p>
        </div>
        <div className="rounded-xl bg-muted p-3">
          <p className="text-xl font-semibold">{s.best}</p>
          <p className="text-xs text-muted-foreground">melhor ({s.unit})</p>
        </div>
        <div className="rounded-xl bg-muted p-3">
          <p className="text-xl font-semibold">{percent(rate30)}</p>
          <p className="text-xs text-muted-foreground">últimos 30 dias</p>
        </div>
      </div>

      <h3 className="mb-2 mt-5 text-sm font-medium">Mapa de calor</h3>
      <Heatmap habits={[h]} today={today} />

      <h3 className="mb-2 mt-5 text-sm font-medium">Histórico de metas</h3>
      <ul className="space-y-1 text-sm">
        {[...h.versions].reverse().map((v) => (
          <li key={v.effectiveFrom} className="flex justify-between gap-2 rounded-lg bg-muted px-3 py-1.5">
            <span>{goalLabel(h, v)}</span>
            <span className="shrink-0 text-muted-foreground">desde {fullDate(v.effectiveFrom)}</span>
          </li>
        ))}
      </ul>

      {h.pauses.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 text-sm font-medium">Pausas</h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {h.pauses.map((p) => (
              <li key={p.start}>
                {fullDate(p.start)} → {p.end ? fullDate(p.end) : "agora"}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-5 text-xs text-muted-foreground">
        Criado em {fullDate(h.createdOn)} · {totalLogged} dia(s) registrado(s)
        {h.archived && (
          <>
            {" · "}
            <Archive className="inline size-3" /> arquivado
          </>
        )}
      </p>
    </Modal>
  );
}
