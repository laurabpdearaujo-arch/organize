import { useEffect, useState } from "react";
import { ArrowLeftRight, Minus, Plus, Receipt } from "lucide-react";
import { EmptyState } from "@/web/components/empty-state";
import { inputCls, primaryBtn } from "@/web/components/modal";
import { colorHex } from "@/lib/calendar/colors";
import { dropParam } from "@/web/lib/drop-param";
import { accountLabel, PAYMENT_METHOD_LABEL } from "@/lib/finance/constants";
import type { FinanceData } from "@/lib/finance/repository";
import { formatMoney } from "@/lib/finance/money";
import { monthOf } from "@/lib/finance/summary";
import { TxDialog } from "./tx-dialog";

type Tx = FinanceData["transactions"][number];
const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function dayLabel(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return `${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")} · ${WEEKDAYS[wd]}`;
}

export function TransactionsPanel({ data, month, today, openNew = false }: { data: FinanceData; month: string; today: string; openNew?: boolean }) {
  const [dialog, setDialog] = useState<{ tx: Tx | null } | null>(openNew ? { tx: null } : null);
  useEffect(() => dropParam("novo"), []);
  const [accountFilter, setAccountFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");

  const accById = new Map(data.accounts.map((a) => [a.id, a]));
  const catById = new Map(data.categories.map((c) => [c.id, c]));
  const q = search.trim().toLowerCase();

  const list = data.transactions.filter(
    (t) =>
      monthOf(t.date) === month &&
      (!accountFilter || t.accountId === accountFilter || t.toAccountId === accountFilter) &&
      (!categoryFilter || t.categoryId === categoryFilter) &&
      (!typeFilter || t.type === typeFilter) &&
      (!q || t.description.toLowerCase().includes(q) || (t.notes ?? "").toLowerCase().includes(q)),
  );
  const byDay = new Map<string, Tx[]>();
  for (const t of list) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t]);

  const defaultDate = monthOf(today) === month ? today : `${month}-01`;
  const noAccounts = data.accounts.filter((a) => !a.archivedAt).length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${inputCls} w-full sm:w-56`} placeholder="Buscar descrição…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar" />
        <select className={`${inputCls} w-auto`} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          <option value="expense">Despesas</option>
          <option value="income">Receitas</option>
          <option value="transfer">Transferências</option>
        </select>
        <select className={`${inputCls} w-auto`} value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} aria-label="Conta">
          <option value="">Todas as contas</option>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
        </select>
        <select className={`${inputCls} w-auto`} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {data.categories.filter((c) => !c.archivedAt).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.kind === "expense" ? "despesa" : "receita"})</option>)}
        </select>
        <button type="button" disabled={noAccounts} onClick={() => setDialog({ tx: null })} className={`ml-auto flex items-center gap-1.5 ${primaryBtn}`} title={noAccounts ? "Cadastre uma conta primeiro" : undefined}>
          <Plus className="size-4" /> Novo lançamento
        </button>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={Receipt} title="Nenhum lançamento" description={noAccounts ? "Cadastre uma conta em “Contas e cartões” para começar." : "Nada neste mês com esses filtros."} />
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          {[...byDay.entries()].map(([day, txs]) => (
            <div key={day}>
              <p className="border-b border-border bg-muted/50 px-4 py-1.5 text-xs font-medium capitalize text-muted-foreground">{dayLabel(day)}</p>
              <ul className="divide-y divide-border">
                {txs.map((t) => {
                  const acc = accById.get(t.accountId);
                  const cat = t.categoryId ? catById.get(t.categoryId) : null;
                  const cur = acc?.currency ?? "BRL";
                  return (
                    <li key={t.id}>
                      <button type="button" onClick={() => setDialog({ tx: t })} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40">
                        <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${t.type === "income" ? "bg-success/10 text-success" : t.type === "expense" ? "bg-danger/10 text-danger" : "bg-muted text-muted-foreground"}`}>
                          {t.type === "income" ? <Plus className="size-4" /> : t.type === "expense" ? <Minus className="size-4" /> : <ArrowLeftRight className="size-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{t.description}</span>
                          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            {cat && (
                              <span className="flex items-center gap-1">
                                <span className="size-2 rounded-full" style={{ backgroundColor: colorHex(cat.color) }} />
                                {cat.name}
                              </span>
                            )}
                            <span>{t.type === "transfer" ? `${acc?.name} → ${accById.get(t.toAccountId ?? "")?.name}` : acc?.name}</span>
                            {t.type !== "transfer" && <span>{PAYMENT_METHOD_LABEL[t.paymentMethod]}</span>}
                          </span>
                        </span>
                        <span className={`shrink-0 text-sm font-medium tabular-nums ${t.type === "income" ? "text-success" : t.type === "expense" ? "" : "text-muted-foreground"}`}>
                          {t.type === "income" ? "+" : t.type === "expense" ? "−" : ""}
                          {formatMoney(t.amountCents, cur)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {dialog && <TxDialog key={dialog.tx?.id ?? "new"} data={data} tx={dialog.tx} defaultDate={defaultDate} onClose={() => setDialog(null)} />}
    </div>
  );
}
