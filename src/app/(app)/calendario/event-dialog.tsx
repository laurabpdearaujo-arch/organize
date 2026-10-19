"use client";

import { useState, useTransition } from "react";
import { Trash2, X } from "lucide-react";
import { EVENT_COLORS, type EventColor } from "@/lib/calendar/colors";
import { deleteEvent, saveEvent } from "./actions";
import { toInput, type FormValues } from "./event-form-values";

export type DialogState =
  | { kind: "create"; values: FormValues }
  | {
      kind: "edit";
      eventId: string;
      originalStart: string;
      recurring: boolean;
      /** Valores desta ocorrência. */
      occurrence: FormValues;
      /** Valores da série inteira (para recorrentes) ou do próprio evento. */
      series: FormValues;
    };

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const FREQ_UNIT: Record<string, [string, string]> = {
  daily: ["dia", "dias"],
  weekly: ["semana", "semanas"],
  monthly: ["mês", "meses"],
  yearly: ["ano", "anos"],
};

const inputCls =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50";
const labelCls = "mb-1 block text-xs font-medium text-muted-foreground";

export function EventDialog({
  state,
  onClose,
  onSaved,
}: {
  state: DialogState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = state.kind === "edit";
  const recurring = state.kind === "edit" && state.recurring;
  const [scope, setScope] = useState<"single" | "series">("single");
  const [values, setValues] = useState<FormValues>(state.kind === "edit" ? state.occurrence : state.values);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const editingSingle = recurring && scope === "single";
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  function changeScope(next: "single" | "series") {
    if (state.kind !== "edit" || next === scope) return;
    setScope(next);
    setValues(next === "series" ? state.series : state.occurrence);
    setError(null);
  }

  function changeStartDate(date: string) {
    setValues((v) => ({ ...v, startDate: date, endDate: v.endDate < date ? date : v.endDate }));
  }

  function toggleWeekday(d: number) {
    setValues((v) => {
      const has = v.byWeekday.includes(d);
      const next = has ? v.byWeekday.filter((x) => x !== d) : [...v.byWeekday, d];
      return { ...v, byWeekday: next.length ? next : v.byWeekday };
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = toInput(values, !editingSingle);
    const payload =
      state.kind === "create"
        ? { mode: "create", input }
        : editingSingle
          ? { mode: "single", eventId: state.eventId, originalStart: state.originalStart, input }
          : { mode: "series", eventId: state.eventId, input };
    startTransition(async () => {
      const res = await saveEvent(payload);
      if (res.ok) onSaved();
      else setError(res.error);
    });
  }

  function remove() {
    if (state.kind !== "edit") return;
    const msg = recurring
      ? scope === "single"
        ? "Excluir só esta ocorrência? As outras continuam."
        : "Excluir TODA a série? Todas as ocorrências serão apagadas."
      : "Excluir este evento?";
    if (!window.confirm(msg)) return;
    startTransition(async () => {
      const res = await deleteEvent({ eventId: state.eventId, scope, originalStart: state.originalStart });
      if (res.ok) onSaved();
      else setError(res.error);
    });
  }

  const unit = FREQ_UNIT[values.repeat] ?? ["", ""];

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-card p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">{isEdit ? "Editar evento" : "Novo evento"}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        {recurring && (
          <div className="mb-4">
            <p className={labelCls}>Aplicar alterações a</p>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
              {(["single", "series"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => changeScope(s)}
                  className={`rounded-md px-3 py-1.5 ${scope === s ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}
                >
                  {s === "single" ? "Só esta ocorrência" : "Toda a série"}
                </button>
              ))}
            </div>
            {scope === "series" && (
              <p className="mt-2 text-xs text-muted-foreground">
                Mostrando os dados da série. Se mudar data, horário ou repetição, as alterações feitas em ocorrências
                individuais serão descartadas.
              </p>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="title" className={labelCls}>Título</label>
            <input id="title" className={inputCls} value={values.title} onChange={(e) => set("title", e.target.value)} autoFocus required maxLength={200} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={values.allDay} onChange={(e) => set("allDay", e.target.checked)} className="size-4 accent-[var(--primary)]" />
            Dia inteiro
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="startDate" className={labelCls}>Início</label>
              <input id="startDate" type="date" className={inputCls} value={values.startDate} onChange={(e) => changeStartDate(e.target.value)} required />
            </div>
            {!values.allDay && (
              <div>
                <label htmlFor="startTime" className={labelCls}>Horário</label>
                <input id="startTime" type="time" className={inputCls} value={values.startTime} onChange={(e) => set("startTime", e.target.value)} required />
              </div>
            )}
            <div>
              <label htmlFor="endDate" className={labelCls}>{values.allDay ? "Último dia" : "Fim"}</label>
              <input id="endDate" type="date" className={inputCls} value={values.endDate} min={values.startDate} onChange={(e) => set("endDate", e.target.value)} required />
            </div>
            {!values.allDay && (
              <div>
                <label htmlFor="endTime" className={labelCls}>Horário</label>
                <input id="endTime" type="time" className={inputCls} value={values.endTime} onChange={(e) => set("endTime", e.target.value)} required />
              </div>
            )}
          </div>

          {!editingSingle && (
            <fieldset className="space-y-3 rounded-xl border border-border p-3">
              <div>
                <label htmlFor="repeat" className={labelCls}>Repetir</label>
                <select
                  id="repeat"
                  className={inputCls}
                  value={values.repeat}
                  onChange={(e) => set("repeat", e.target.value as FormValues["repeat"])}
                >
                  <option value="none">Não se repete</option>
                  <option value="daily">Diariamente</option>
                  <option value="weekly">Semanalmente</option>
                  <option value="monthly">Mensalmente (mesmo dia do mês)</option>
                  <option value="yearly">Anualmente</option>
                </select>
              </div>

              {values.repeat !== "none" && (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    A cada
                    <input
                      type="number"
                      min={1}
                      max={99}
                      className={`${inputCls} w-20`}
                      value={values.interval}
                      onChange={(e) => set("interval", Number(e.target.value))}
                    />
                    {values.interval === 1 ? unit[0] : unit[1]}
                  </div>

                  {values.repeat === "weekly" && (
                    <div>
                      <p className={labelCls}>Nos dias</p>
                      <div className="flex flex-wrap gap-1">
                        {WEEKDAY_LABELS.map((l, d) => {
                          const on = values.byWeekday.includes(d);
                          return (
                            <button
                              key={d}
                              type="button"
                              aria-label={WEEKDAY_NAMES[d]}
                              aria-pressed={on}
                              onClick={() => toggleWeekday(d)}
                              className={`rounded-full px-2.5 py-1.5 text-xs font-medium ${on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                            >
                              {l}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className={labelCls}>Termina</p>
                    <div className="space-y-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="radio" name="endsMode" checked={values.endsMode === "never"} onChange={() => set("endsMode", "never")} />
                        Nunca
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="radio" name="endsMode" checked={values.endsMode === "until"} onChange={() => set("endsMode", "until")} />
                        Em
                        <input
                          type="date"
                          className={`${inputCls} w-auto`}
                          value={values.until}
                          min={values.startDate}
                          disabled={values.endsMode !== "until"}
                          required={values.endsMode === "until"}
                          onChange={(e) => set("until", e.target.value)}
                        />
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="radio" name="endsMode" checked={values.endsMode === "count"} onChange={() => set("endsMode", "count")} />
                        Após
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          className={`${inputCls} w-20`}
                          value={values.count}
                          disabled={values.endsMode !== "count"}
                          onChange={(e) => set("count", Number(e.target.value))}
                        />
                        vezes
                      </label>
                    </div>
                  </div>
                </>
              )}
            </fieldset>
          )}

          <div>
            <label htmlFor="location" className={labelCls}>Local (opcional)</label>
            <input id="location" className={inputCls} value={values.location} onChange={(e) => set("location", e.target.value)} maxLength={300} />
          </div>

          <div>
            <label htmlFor="description" className={labelCls}>Descrição (opcional)</label>
            <textarea id="description" rows={3} className={inputCls} value={values.description} onChange={(e) => set("description", e.target.value)} maxLength={5000} />
          </div>

          <div>
            <p className={labelCls}>Cor</p>
            <div className="flex gap-2">
              {(Object.keys(EVENT_COLORS) as EventColor[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={EVENT_COLORS[c].label}
                  aria-pressed={values.color === c}
                  onClick={() => set("color", c)}
                  className={`size-7 rounded-full ring-offset-2 ring-offset-[var(--card)] ${values.color === c ? "ring-2 ring-foreground" : ""}`}
                  style={{ backgroundColor: EVENT_COLORS[c].hex }}
                />
              ))}
            </div>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center gap-2">
          {isEdit && (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              <Trash2 className="size-4" />
              Excluir
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">
              Cancelar
            </button>
            <button type="submit" disabled={pending} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {pending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
