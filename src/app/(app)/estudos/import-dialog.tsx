"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, FileUp } from "lucide-react";
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/components/modal";
import { EVENT_COLORS, type EventColor } from "@/lib/calendar/colors";
import { countLeaves, type OutlineNode, type OutlinePlan } from "@/lib/studies/outline";
import { importStudyPlans } from "./actions";

const COLORS = Object.keys(EVENT_COLORS) as EventColor[];

type Draft = { include: boolean; name: string; color: EventColor; plan: OutlinePlan };

/** Envia o PDF, mostra como ficou a divisão e cria os planos escolhidos. */
export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (planId: string) => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  async function read(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/estudos/importar", { method: "POST", body: fd });
      if (res.redirected || res.url.includes("/login")) {
        router.push("/login");
        return;
      }
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Não foi possível ler o arquivo.");
        return;
      }
      setFileName(body.fileName);
      setWarnings(body.warnings ?? []);
      setDrafts((body.plans as OutlinePlan[]).map((p, i) => ({ include: true, name: p.name, color: COLORS[i % COLORS.length], plan: p })));
    } catch {
      setError("Falha de conexão ao enviar o arquivo.");
    } finally {
      setLoading(false);
    }
  }

  function confirm() {
    if (!drafts) return;
    setError(null);
    startTransition(async () => {
      const r = await importStudyPlans({
        fileName,
        plans: drafts.filter((d) => d.include).map((d) => ({ name: d.name, color: d.color, nodes: d.plan.nodes })),
      });
      if (r.ok && r.planIds?.length) onImported(r.planIds[0]);
      else if (!r.ok) setError(r.error);
    });
  }

  const set = (i: number, patch: Partial<Draft>) => setDrafts((ds) => ds!.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  return (
    <Modal title="Importar conteúdo programático" onClose={onClose} size="lg">
      {!drafts ? (
        <form onSubmit={read} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Envie o PDF com o conteúdo. Cada “PARTE” vira um plano; os temas e conteúdos são separados para você marcar o que já estudou
            e agendar datas. Nada é gravado antes de você conferir. O arquivo não fica guardado.
          </p>
          <input type="file" accept="application/pdf,.pdf" className={`${inputCls} file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-sm`} onChange={(e) => setFile(e.target.files?.[0] ?? null)} required aria-label="Arquivo PDF" />
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={secondaryBtn}>Cancelar</button>
            <button type="submit" disabled={!file || loading} className={`flex items-center gap-1.5 ${primaryBtn}`}>
              <FileUp className="size-4" /> {loading ? "Lendo…" : "Ler PDF"}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Confira a divisão. Desmarque o que não quiser importar e ajuste os nomes.</p>
          {warnings.length > 0 && (
            <details className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
              <summary>{warnings.length} linha(s) não reconhecida(s)</summary>
              <ul className="mt-1 list-disc pl-5 text-xs">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </details>
          )}
          <ul className="space-y-3">
            {drafts.map((d, i) => {
              const c = countLeaves(d.plan.nodes);
              return (
                <li key={i} className={`rounded-xl border p-3 ${d.include ? "border-border" : "border-dashed border-border opacity-60"}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" className="mt-2 size-4" checked={d.include} onChange={(e) => set(i, { include: e.target.checked })} aria-label="Importar este plano" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div>
                        <label className={labelCls} htmlFor={`pname-${i}`}>Nome do plano</label>
                        <input id={`pname-${i}`} className={inputCls} value={d.name} onChange={(e) => set(i, { name: e.target.value })} maxLength={120} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {COLORS.map((col) => (
                          <button key={col} type="button" aria-label={EVENT_COLORS[col].label} aria-pressed={d.color === col} onClick={() => set(i, { color: col })} className={`size-5 rounded-full ring-offset-2 ring-offset-[var(--card)] ${d.color === col ? "ring-2 ring-foreground" : ""}`} style={{ backgroundColor: EVENT_COLORS[col].hex }} />
                        ))}
                        <span className="text-xs text-muted-foreground">
                          {d.plan.nodes.length} tema(s) · {c.leaves} conteúdo(s){c.minutes ? ` · ${Math.round(c.minutes / 60)}h de aulas` : ""}
                        </span>
                      </div>
                      <details className="text-sm">
                        <summary className="cursor-pointer text-xs text-primary">Ver temas e conteúdos</summary>
                        <div className="mt-2 max-h-72 overflow-y-auto rounded-lg bg-muted/50 p-2">
                          <PreviewTree nodes={d.plan.nodes} depth={0} />
                        </div>
                      </details>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDrafts(null)} className={secondaryBtn}>Voltar</button>
            <button type="button" disabled={pending || !drafts.some((d) => d.include)} onClick={confirm} className={primaryBtn}>
              {pending ? "Importando…" : `Importar ${drafts.filter((d) => d.include).length} plano(s)`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PreviewTree({ nodes, depth }: { nodes: OutlineNode[]; depth: number }) {
  return (
    <ul className={depth ? "ml-4 border-l border-border pl-2" : ""}>
      {nodes.map((n, i) => (
        <li key={i} className="py-0.5">
          <span className={`flex items-start gap-1 ${n.children.length ? "font-medium" : "text-muted-foreground"}`}>
            {n.children.length > 0 && <ChevronRight className="mt-0.5 size-3 shrink-0" />}
            <span>
              {n.code && `${n.code} `}
              {n.title}
              {n.done && " ✓"}
              {n.durationMinutes ? ` · ${n.durationMinutes} min` : ""}
            </span>
          </span>
          {n.children.length > 0 && <PreviewTree nodes={n.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}
