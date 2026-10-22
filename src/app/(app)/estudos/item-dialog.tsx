"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/components/modal";
import type { PlanList } from "@/lib/studies/repository";
import { addStudyLog, deleteStudyItem, deleteStudyLog, moveStudyItem, updateStudyItemDetails } from "./actions";

type Plan = PlanList[number];
type Item = Plan["items"][number];
type Log = Plan["logs"][number];

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
export const minutesText = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}` : `${m} min`);

/** Totais dos registros (tempo, questões, % de acerto). */
export function logTotals(logs: Log[]) {
  const minutes = logs.reduce((s, l) => s + (l.minutes ?? 0), 0);
  const done = logs.reduce((s, l) => s + (l.questionsDone ?? 0), 0);
  const correctLogs = logs.filter((l) => l.questionsCorrect !== null);
  const correct = correctLogs.reduce((s, l) => s + (l.questionsCorrect ?? 0), 0);
  const doneWithCorrect = correctLogs.reduce((s, l) => s + (l.questionsDone ?? 0), 0);
  return { minutes, questions: done, accuracy: doneWithCorrect ? correct / doneWithCorrect : null };
}

export function ItemDialog({ plan, item, isLeaf, today, onClose }: { plan: Plan; item: Item; isLeaf: boolean; today: string; onClose: () => void }) {
  const logs = plan.logs.filter((l) => l.itemId === item.id);
  const totals = logTotals(logs);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // detalhes
  const [code, setCode] = useState(item.code ?? "");
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [duration, setDuration] = useState(item.durationMinutes ? String(item.durationMinutes) : "");
  // registro
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState("");
  const [qDone, setQDone] = useState("");
  const [qCorrect, setQCorrect] = useState("");
  const [difficulties, setDifficulties] = useState("");
  const [mistakes, setMistakes] = useState("");

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Erro.");
      else after?.();
    });
  }

  const num = (s: string) => (s.trim() === "" ? "" : Number(s));
  const childCount = plan.items.filter((i) => i.parentId === item.id).length;

  return (
    <Modal title={item.title} onClose={onClose} size="lg">
      {error && <p role="alert" className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {isLeaf && (
        <section className="mb-5 space-y-3">
          <h3 className="text-sm font-medium">Registrar estudo</h3>
          {logs.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Total: {minutesText(totals.minutes)} estudado(s){totals.questions ? ` · ${totals.questions} questões` : ""}
              {totals.accuracy !== null ? ` · ${Math.round(totals.accuracy * 100)}% de acerto` : ""}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(
                () => addStudyLog({ itemId: item.id, date, minutes: num(minutes), questionsDone: num(qDone), questionsCorrect: num(qCorrect), difficulties, mistakes }),
                () => {
                  setMinutes("");
                  setQDone("");
                  setQCorrect("");
                  setDifficulties("");
                  setMistakes("");
                },
              );
            }}
            className="space-y-3 rounded-xl border border-border p-3"
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label htmlFor="ldate" className={labelCls}>Data</label>
                <input id="ldate" type="date" className={inputCls} value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="lmin" className={labelCls}>Minutos</label>
                <input id="lmin" type="number" min={0} max={1440} className={inputCls} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              </div>
              <div>
                <label htmlFor="lq" className={labelCls}>Questões feitas</label>
                <input id="lq" type="number" min={0} className={inputCls} value={qDone} onChange={(e) => setQDone(e.target.value)} />
              </div>
              <div>
                <label htmlFor="lqc" className={labelCls}>Acertos</label>
                <input id="lqc" type="number" min={0} className={inputCls} value={qCorrect} onChange={(e) => setQCorrect(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="ldif" className={labelCls}>Dificuldades</label>
                <textarea id="ldif" rows={2} className={inputCls} value={difficulties} onChange={(e) => setDifficulties(e.target.value)} maxLength={2000} placeholder="O que ficou confuso?" />
              </div>
              <div>
                <label htmlFor="lerr" className={labelCls}>Erros</label>
                <textarea id="lerr" rows={2} className={inputCls} value={mistakes} onChange={(e) => setMistakes(e.target.value)} maxLength={2000} placeholder="Onde errou e por quê?" />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={pending} className={primaryBtn}>{pending ? "Salvando…" : "Registrar"}</button>
            </div>
          </form>
          {logs.length > 0 && (
            <ul className="divide-y divide-border text-sm">
              {logs.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p>
                      {br(l.date)}
                      {l.minutes ? ` · ${minutesText(l.minutes)}` : ""}
                      {l.questionsDone !== null ? ` · ${l.questionsDone} questões` : ""}
                      {l.questionsCorrect !== null ? ` (${l.questionsCorrect} certas)` : ""}
                    </p>
                    {l.difficulties && <p className="text-xs text-muted-foreground">Dificuldades: {l.difficulties}</p>}
                    {l.mistakes && <p className="text-xs text-muted-foreground">Erros: {l.mistakes}</p>}
                  </div>
                  <button type="button" aria-label="Excluir registro" onClick={() => window.confirm("Excluir este registro?") && act(() => deleteStudyLog({ id: l.id }))} className="rounded p-1 text-muted-foreground hover:bg-muted">
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mb-5 space-y-3">
        <h3 className="text-sm font-medium">Detalhes</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act(() => updateStudyItemDetails({ id: item.id, code, title, description, notes, durationMinutes: num(duration) }));
          }}
          className="space-y-3"
        >
          <div className={`grid gap-3 ${isLeaf ? "grid-cols-[90px_1fr_90px]" : "grid-cols-[90px_1fr]"}`}>
            <div>
              <label htmlFor="icode" className={labelCls}>Código</label>
              <input id="icode" className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} placeholder="1.1" />
            </div>
            <div>
              <label htmlFor="ititle" className={labelCls}>Título</label>
              <input id="ititle" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={300} />
            </div>
            {isLeaf && (
              <div>
                <label htmlFor="idur" className={labelCls}>Duração (min)</label>
                <input id="idur" type="number" min={0} max={10000} className={inputCls} value={duration} onChange={(e) => setDuration(e.target.value)} />
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Mudar o código não muda o lugar do item: para isso, use Subir/Descer.</p>
          <div>
            <label htmlFor="idesc" className={labelCls}>Descrição</label>
            <textarea id="idesc" rows={2} className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} />
          </div>
          <div>
            <label htmlFor="inotes" className={labelCls}>Anotações</label>
            <textarea id="inotes" rows={3} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} placeholder="Resumo, links, o que revisar…" />
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={pending} className={secondaryBtn}>Salvar detalhes</button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Estrutura</h3>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => act(() => moveStudyItem({ id: item.id, direction: "up" }))} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted"><ArrowUp className="size-3" /> Subir</button>
          <button type="button" disabled={pending} onClick={() => act(() => moveStudyItem({ id: item.id, direction: "down" }))} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted"><ArrowDown className="size-3" /> Descer</button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const msg = childCount ? `Excluir “${item.title}” e os ${childCount} item(ns) dentro dele, com todos os registros?` : `Excluir “${item.title}” e seus registros?`;
              if (window.confirm(msg)) act(() => deleteStudyItem({ id: item.id }), onClose);
            }}
            className="ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-danger hover:bg-danger/10"
          >
            <Trash2 className="size-3" /> Excluir
          </button>
        </div>
      </section>
    </Modal>
  );
}
