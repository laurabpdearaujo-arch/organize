import { useState, useTransition } from "react";
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/web/components/modal";
import type { PlanList } from "@/lib/studies/repository";
import { childrenOf, descendants, insertIndex, label, parentByCode } from "@/lib/studies/placement";
import { addStudyItem } from "./actions";

type Plan = PlanList[number];

const NEW_THEME = "__novo";

/** Adicionar conteúdo: escolhe o tema, o código (opcional) acha o lugar, e a frase mostra onde vai entrar. */
export function AddItemDialog({ plan, items, onClose }: { plan: Plan; items: Plan["items"]; onClose: () => void }) {
  const themes = childrenOf(items, null);
  const [themeId, setThemeId] = useState(themes[0]?.id ?? NEW_THEME);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("");
  const [kind, setKind] = useState<"content" | "group">("content");
  // null = segue o código (ou o próprio tema, sem código); string = escolhido à mão
  const [manualParent, setManualParent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isNewTheme = themeId === NEW_THEME;
  const byCode = !isNewTheme && code.trim() ? parentByCode(items, themeId, code) : undefined;
  const codeNotFound = !isNewTheme && code.trim() !== "" && byCode === undefined;
  const parentId = isNewTheme ? null : (manualParent ?? byCode ?? themeId);
  const parent = items.find((i) => i.id === parentId) ?? null;
  const siblings = childrenOf(items, parentId);
  const idx = insertIndex(siblings, code.trim() || null);
  const parentIsLeaf = !!parent && !parent.isGroup && siblings.length === 0;
  const asGroup = isNewTheme || kind === "group";

  const where = isNewTheme ? "como tema novo do plano" : `dentro de “${parent ? label(parent) : ""}”`;
  const order = siblings.length === 0 ? "como primeiro item" : idx === 0 ? `antes de “${label(siblings[0])}”` : `depois de “${label(siblings[idx - 1])}”`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await addStudyItem({ planId: plan.id, parentId, code, title, isGroup: asGroup, durationMinutes: asGroup || duration.trim() === "" ? "" : Number(duration) });
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <Modal title="Adicionar conteúdo" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div>
          <label htmlFor="atheme" className={labelCls}>Tema</label>
          <select
            id="atheme"
            className={inputCls}
            value={themeId}
            onChange={(e) => {
              setThemeId(e.target.value);
              setManualParent(null);
            }}
          >
            {themes.map((t) => (
              <option key={t.id} value={t.id}>{label(t)}</option>
            ))}
            <option value={NEW_THEME}>+ Criar um tema novo</option>
          </select>
        </div>

        {!isNewTheme && (
          <fieldset>
            <legend className={labelCls}>O que é?</legend>
            <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
              {(
                [
                  ["content", "Conteúdo para estudar"],
                  ["group", "Subtema (vai ter itens dentro)"],
                ] as const
              ).map(([k, text]) => (
                <label key={k} className={`flex-1 cursor-pointer rounded-md px-2 py-1.5 text-center ${kind === k ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>
                  <input type="radio" name="akind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
                  {text}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="grid grid-cols-[110px_1fr] gap-3">
          <div>
            <label htmlFor="acode" className={labelCls}>Código (opcional)</label>
            <input
              id="acode"
              className={inputCls}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setManualParent(null);
              }}
              maxLength={40}
              placeholder="3.4"
            />
          </div>
          <div>
            <label htmlFor="atitle" className={labelCls}>Nome</label>
            <input id="atitle" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={300} autoFocus placeholder={isNewTheme ? "Nome do tema" : asGroup ? "Nome do subtema" : "Nome do conteúdo ou da aula"} />
          </div>
        </div>

        {!isNewTheme && (
          <div>
            <label htmlFor="aparent" className={labelCls}>Fica dentro de</label>
            <select id="aparent" className={inputCls} value={parentId ?? ""} onChange={(e) => setManualParent(e.target.value)}>
              {descendants(items, themeId).map(({ item, depth }) => (
                <option key={item.id} value={item.id}>
                  {`${"   ".repeat(depth)}${label(item)}`}
                </option>
              ))}
            </select>
            {codeNotFound && manualParent === null && (
              <p className="mt-1 text-xs text-warning">Não achei o grupo desse código dentro do tema. Escolha acima onde ele fica.</p>
            )}
          </div>
        )}

        {!asGroup && (
          <div className="w-40">
            <label htmlFor="adur" className={labelCls}>Duração da aula (min)</label>
            <input id="adur" type="number" min={0} max={10000} className={inputCls} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="opcional" />
          </div>
        )}

        <p className="rounded-lg bg-muted px-3 py-2 text-sm">
          → Vai entrar {where}, {order}.
          {parentIsLeaf && <span className="mt-1 block text-xs text-muted-foreground">“{parent && label(parent)}” passa a ser um grupo: o progresso dele vem dos itens de dentro.</span>}
        </p>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancelar</button>
          <button type="submit" disabled={pending} className={primaryBtn}>{pending ? "Adicionando…" : "Adicionar"}</button>
        </div>
      </form>
    </Modal>
  );
}
