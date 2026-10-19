"use client";

import { useState, useTransition } from "react";
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/components/modal";
import { EVENT_COLORS, type EventColor } from "@/lib/calendar/colors";
import { HABIT_CATEGORIES } from "@/lib/habits/schemas";
import { fullDate, goalLabel, WEEKDAY_SHORT } from "@/lib/habits/format";
import { versionOn, type HabitData } from "@/lib/habits/stats";
import { changeGoal, createHabit, updateHabit } from "./actions";

export type HabitDialogMode =
  | { kind: "create" }
  | { kind: "details"; habit: HabitData }
  /** Meta nova a partir de hoje (o passado continua com a meta antiga). */
  | { kind: "goal"; habit: HabitData }
  /** Configuração errada: substitui a meta desde o início do hábito. */
  | { kind: "correct"; habit: HabitData };

type Form = {
  name: string;
  direction: "build" | "reduce";
  measure: "boolean" | "quantity" | "duration";
  unit: string;
  category: (typeof HABIT_CATEGORIES)[number];
  color: EventColor;
  scheduleType: "days" | "weekly";
  weekdays: number[];
  timesPerWeek: number;
  target: string;
  startDate: string;
};

function initialForm(mode: HabitDialogMode, today: string): Form {
  if (mode.kind === "create") {
    return {
      name: "",
      direction: "build",
      measure: "boolean",
      unit: "",
      category: "Saúde",
      color: "green",
      scheduleType: "days",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      timesPerWeek: 3,
      target: "",
      startDate: today,
    };
  }
  const h = mode.habit;
  const v = versionOn(h, today) ?? h.versions.at(-1)!;
  return {
    name: h.name,
    direction: h.direction,
    measure: h.measure,
    unit: h.measure === "quantity" ? (h.unit ?? "") : "",
    category: (HABIT_CATEGORIES as readonly string[]).includes(h.category) ? (h.category as Form["category"]) : "Outros",
    color: (h.color in EVENT_COLORS ? h.color : "violet") as EventColor,
    scheduleType: v.scheduleType,
    weekdays: v.scheduleType === "days" ? v.weekdays : [0, 1, 2, 3, 4, 5, 6],
    timesPerWeek: v.timesPerWeek ?? 3,
    target: v.target === null ? "" : String(v.target),
    startDate: h.createdOn,
  };
}

export function HabitDialog({ mode, today, onClose }: { mode: HabitDialogMode; today: string; onClose: () => void }) {
  const [f, setF] = useState<Form>(() => initialForm(mode, today));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set =<K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));

  const showBasics = mode.kind === "create" || mode.kind === "details";
  const showType = mode.kind === "create";
  const showGoal = mode.kind !== "details";
  const unitText = f.measure === "duration" ? "min" : f.unit || "unid.";

  function toggleDay(d: number) {
    setF((s) => {
      const next = s.weekdays.includes(d) ? s.weekdays.filter((x) => x !== d) : [...s.weekdays, d];
      return { ...s, weekdays: next };
    });
  }

  function goalPayload() {
    const target = f.target.trim() === "" ? null : Number(f.target.replace(",", "."));
    return {
      scheduleType: f.scheduleType,
      weekdays: f.weekdays,
      timesPerWeek: f.scheduleType === "weekly" ? f.timesPerWeek : null,
      target: f.measure === "boolean" ? null : target,
    };
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const details = { name: f.name, unit: f.unit, category: f.category, color: f.color, startDate: f.startDate };
      const res =
        mode.kind === "create"
          ? await createHabit({ ...details, direction: f.direction, measure: f.measure, goal: goalPayload() })
          : mode.kind === "details"
            ? await updateHabit({ habitId: mode.habit.id, details })
            : await changeGoal({ habitId: mode.habit.id, goal: goalPayload(), mode: mode.kind === "correct" ? "correct" : "from_today" });
      if (res.ok) onClose();
      else setError(res.error);
    });
  }

  const title =
    mode.kind === "create"
      ? "Novo hábito"
      : mode.kind === "details"
        ? "Editar hábito"
        : mode.kind === "goal"
          ? `Mudar meta de “${mode.habit.name}”`
          : `Corrigir configuração de “${mode.habit.name}”`;

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {showBasics && (
          <div>
            <label htmlFor="hname" className={labelCls}>Nome</label>
            <input id="hname" className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Ler, Academia, Menos redes sociais" required maxLength={80} autoFocus />
          </div>
        )}

        {showType && (
          <>
            <div>
              <p className={labelCls}>Direção</p>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
                {(["build", "reduce"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setF((s) => ({ ...s, direction: d, measure: d === "reduce" && s.measure === "boolean" ? "quantity" : s.measure }))}
                    className={`rounded-md px-3 py-1.5 ${f.direction === d ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}
                  >
                    {d === "build" ? "Desenvolver" : "Reduzir"}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="hmeasure" className={labelCls}>Como medir</label>
                <select id="hmeasure" className={inputCls} value={f.measure} onChange={(e) => set("measure", e.target.value as Form["measure"])}>
                  {f.direction === "build" && <option value="boolean">Sim / não</option>}
                  <option value="quantity">Quantidade</option>
                  <option value="duration">Duração (minutos)</option>
                </select>
              </div>
              {f.measure === "quantity" && (
                <div>
                  <label htmlFor="hunit" className={labelCls}>Unidade</label>
                  <input id="hunit" className={inputCls} value={f.unit} onChange={(e) => set("unit", e.target.value)} placeholder="páginas, copos…" maxLength={20} required />
                </div>
              )}
            </div>
          </>
        )}

        {mode.kind === "details" && f.measure === "quantity" && (
          <div>
            <label htmlFor="hunit2" className={labelCls}>Unidade</label>
            <input id="hunit2" className={inputCls} value={f.unit} onChange={(e) => set("unit", e.target.value)} maxLength={20} required />
          </div>
        )}

        {showGoal && (
          <fieldset className="space-y-3 rounded-xl border border-border p-3">
            {mode.kind === "goal" && (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                A nova meta vale <strong>a partir de hoje</strong>. Os dias anteriores continuam avaliados pela meta que valia na
                época. Se a configuração estava errada desde o começo, use <strong>Corrigir configuração</strong> no menu.
              </p>
            )}
            {mode.kind === "correct" && (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                Esta configuração passa a valer <strong>desde o início do hábito ({fullDate(mode.habit.createdOn)})</strong> e
                substitui o histórico de metas. Todos os dias registrados são reavaliados.
              </p>
            )}
            <div>
              <p className={labelCls}>Frequência</p>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
                {(["days", "weekly"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => set("scheduleType", t)} className={`rounded-md px-3 py-1.5 ${f.scheduleType === t ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>
                    {t === "days" ? "Dias fixos" : "X vezes por semana"}
                  </button>
                ))}
              </div>
            </div>
            {f.scheduleType === "days" ? (
              <div className="flex flex-wrap gap-1">
                {WEEKDAY_SHORT.map((l, d) => {
                  const on = f.weekdays.includes(d);
                  return (
                    <button key={d} type="button" aria-pressed={on} onClick={() => toggleDay(d)} className={`rounded-full px-2.5 py-1.5 text-xs font-medium capitalize ${on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {l}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <input type="number" min={1} max={7} className={`${inputCls} w-20`} value={f.timesPerWeek} onChange={(e) => set("timesPerWeek", Number(e.target.value))} />
                vezes por semana, em qualquer dia
              </div>
            )}
            {f.measure !== "boolean" && (
              <div className="flex items-center gap-2 text-sm">
                {f.direction === "reduce" ? "No máximo" : "Meta de"}
                <input type="text" inputMode="decimal" className={`${inputCls} w-24`} value={f.target} onChange={(e) => set("target", e.target.value)} placeholder={f.direction === "reduce" ? "2" : "30"} required />
                {unitText} por dia
              </div>
            )}
          </fieldset>
        )}

        {showBasics && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="hcat" className={labelCls}>Categoria</label>
              <select id="hcat" className={inputCls} value={f.category} onChange={(e) => set("category", e.target.value as Form["category"])}>
                {HABIT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <p className={labelCls}>Cor</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(Object.keys(EVENT_COLORS) as EventColor[]).map((c) => (
                  <button key={c} type="button" aria-label={EVENT_COLORS[c].label} aria-pressed={f.color === c} onClick={() => set("color", c)} className={`size-6 rounded-full ring-offset-2 ring-offset-[var(--card)] ${f.color === c ? "ring-2 ring-foreground" : ""}`} style={{ backgroundColor: EVENT_COLORS[c].hex }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {showBasics && (
          <div>
            <label htmlFor="hstart" className={labelCls}>Começou em</label>
            <input id="hstart" type="date" className={inputCls} value={f.startDate} max={today} onChange={(e) => set("startDate", e.target.value)} required />
            <p className="mt-1 text-xs text-muted-foreground">
              Use uma data passada para lançar os dias anteriores na grade. Dias sem registro desde essa data contam como não cumpridos.
            </p>
          </div>
        )}

        {mode.kind === "goal" && mode.habit.versions.length > 0 && (
          <div>
            <p className={labelCls}>Histórico de metas</p>
            <ul className="space-y-1 text-sm">
              {[...mode.habit.versions].reverse().map((v) => (
                <li key={v.effectiveFrom} className="flex justify-between gap-2 rounded-lg bg-muted px-3 py-1.5">
                  <span>{goalLabel(mode.habit, v)}</span>
                  <span className="shrink-0 text-muted-foreground">desde {fullDate(v.effectiveFrom)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancelar</button>
          <button type="submit" disabled={pending} className={primaryBtn}>{pending ? "Salvando…" : "Salvar"}</button>
        </div>
      </form>
    </Modal>
  );
}
