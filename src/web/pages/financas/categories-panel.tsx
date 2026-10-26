import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/web/components/modal";
import { EVENT_COLORS, colorHex, type EventColor } from "@/lib/calendar/colors";
import type { FinanceData } from "@/lib/finance/repository";
import { archiveCategory, saveCategory } from "./actions";

type Category = FinanceData["categories"][number];

export function CategoriesPanel({ data }: { data: FinanceData }) {
  const [dialog, setDialog] = useState<{ category: Category | null; kind: "expense" | "income" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggleArchive(c: Category) {
    setError(null);
    startTransition(async () => {
      const r = await archiveCategory({ id: c.id, archived: !c.archivedAt });
      if (!r.ok) setError(r.error);
    });
  }

  const column = (kind: "expense" | "income") => {
    const list = data.categories.filter((c) => c.kind === kind);
    return (
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">{kind === "expense" ? "Despesas" : "Receitas"}</h2>
          <button type="button" onClick={() => setDialog({ category: null, kind })} className="text-sm text-primary hover:underline">+ Nova</button>
        </div>
        <ul className="divide-y divide-border text-sm">
          {list.map((c) => (
            <li key={c.id} className={`flex items-center justify-between gap-2 py-2 ${c.archivedAt ? "opacity-50" : ""}`}>
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: colorHex(c.color) }} />
                {c.name}
                {c.archivedAt && <span className="text-xs text-muted-foreground">(arquivada)</span>}
              </span>
              <span className="flex items-center gap-1">
                <button type="button" aria-label={`Editar ${c.name}`} onClick={() => setDialog({ category: c, kind })} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
                  <Pencil className="size-3.5" />
                </button>
                <button type="button" onClick={() => toggleArchive(c)} className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
                  {c.archivedAt ? "Restaurar" : "Arquivar"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Arquivar esconde a categoria dos formulários, mas os lançamentos antigos continuam com ela.</p>
      {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {column("expense")}
        {column("income")}
      </div>
      {dialog && <CategoryDialog key={dialog.category?.id ?? `new-${dialog.kind}`} {...dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}

function CategoryDialog({ category, kind, onClose }: { category: Category | null; kind: "expense" | "income"; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState<EventColor>((category?.color as EventColor) ?? "gray");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await saveCategory({ id: category?.id ?? null, input: { name, kind, color } });
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <Modal title={category ? "Editar categoria" : `Nova categoria de ${kind === "expense" ? "despesa" : "receita"}`} onClose={onClose} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="cname" className={labelCls}>Nome</label>
          <input id="cname" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} autoFocus />
        </div>
        <div>
          <p className={labelCls}>Cor</p>
          <div className="flex flex-wrap gap-2">
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
