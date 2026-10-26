import { useState, useTransition } from "react";
import { CalendarClock, CheckCircle2, MoreHorizontal, Plus, Repeat } from "lucide-react";
import { EmptyState } from "@/web/components/empty-state";
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/web/components/modal";
import type { FinanceData } from "@/lib/finance/repository";
import type { BillList } from "@/lib/finance/bills-repository";
import { billStatus, dueDateIn, type BillStatus } from "@/lib/finance/bills";
import { centsToInput, formatMoney } from "@/lib/finance/money";
import { archiveBill, deleteBill, saveBill, setBillPaid } from "./actions";
import { monthLabel } from "./finance-view";

type Bill = BillList[number];

const STATUS: Record<BillStatus, { label: string; cls: string }> = {
  paid: { label: "Paga", cls: "bg-success/10 text-success" },
  auto_done: { label: "Débito automático", cls: "bg-muted text-muted-foreground" },
  auto_upcoming: { label: "Débito automático", cls: "bg-muted text-muted-foreground" },
  pending: { label: "Pendente", cls: "bg-warning/10 text-warning" },
  overdue: { label: "Atrasada", cls: "bg-danger/10 text-danger" },
};

function br(d: string) {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

export function BillsPanel({ data, bills, month, today }: { data: FinanceData; bills: BillList; month: string; today: string }) {
  const [dialog, setDialog] = useState<{ bill: Bill | null } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const active = bills.filter((b) => !b.archivedAt);
  const archived = bills.filter((b) => b.archivedAt);
  const accName = new Map(data.accounts.map((a) => [a.id, a.name]));

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Erro.");
    });
  }

  const rows = active.map((b) => {
    const paid = b.payments.find((p) => p.month === month);
    const status = billStatus(b, month, new Set(b.payments.map((p) => p.month)), today);
    return { b, paid, status, due: dueDateIn(month, b.dueDay) };
  });
  const total = rows.reduce((s, r) => s + (r.b.amountCents ?? 0), 0);
  const open = rows.filter((r) => r.status === "pending" || r.status === "overdue");
  const openTotal = open.reduce((s, r) => s + (r.b.amountCents ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Registro das contas do mês. <strong>Não entram nos lançamentos</strong>; as sem débito automático aparecem no calendário no dia do vencimento.
        </p>
        <button type="button" onClick={() => setDialog({ bill: null })} className={`flex shrink-0 items-center gap-1.5 ${primaryBtn}`}>
          <Plus className="size-4" /> Nova conta a pagar
        </button>
      </div>

      {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {active.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Nenhuma conta a pagar" description="Cadastre contas como aluguel, luz, internet e assinaturas, com o dia do vencimento." />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label={`Total em ${monthLabel(month)}`} value={formatMoney(total)} hint="soma dos valores de referência" />
            <Stat label="Em aberto" value={formatMoney(openTotal)} hint={`${open.length} conta(s) sem débito automático`} />
            <Stat label="Atrasadas" value={String(rows.filter((r) => r.status === "overdue").length)} hint="venceram e não foram marcadas" />
          </section>

          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {rows.map(({ b, paid, status, due }) => (
              <li key={b.id} className="relative flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {b.name}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-normal ${STATUS[status].cls}`}>
                      {STATUS[status].label}
                      {paid && ` em ${br(paid.paidOn)}`}
                    </span>
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {b.autoDebit ? (
                      <span className="flex items-center gap-1"><Repeat className="size-3" /> débito automático dia {b.dueDay}</span>
                    ) : (
                      <span className="flex items-center gap-1"><CalendarClock className="size-3" /> vence dia {b.dueDay} ({br(due)})</span>
                    )}
                    {b.accountId && accName.get(b.accountId) && <span>· {accName.get(b.accountId)}</span>}
                    {b.notes && <span>· {b.notes}</span>}
                  </p>
                </div>
                <span className="text-sm font-medium tabular-nums">{b.amountCents ? formatMoney(b.amountCents) : "valor varia"}</span>
                {paid ? (
                  <button type="button" disabled={pending} onClick={() => act(() => setBillPaid({ id: b.id, month, paidOn: null }))} className="rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted">
                    Desmarcar
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => setBillPaid({ id: b.id, month, paidOn: month === today.slice(0, 7) ? today : due }))}
                    className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
                  >
                    <CheckCircle2 className="size-3.5" /> Marcar paga
                  </button>
                )}
                <button type="button" aria-label={`Opções de ${b.name}`} onClick={() => setMenu(menu === b.id ? null : b.id)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
                  <MoreHorizontal className="size-4" />
                </button>
                {menu === b.id && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
                    <ul className="absolute right-3 top-12 z-20 w-40 rounded-xl border border-border bg-card p-1 text-sm shadow-lg">
                      <li><button type="button" className="w-full rounded-lg px-3 py-1.5 text-left hover:bg-muted" onClick={() => { setMenu(null); setDialog({ bill: b }); }}>Editar</button></li>
                      <li><button type="button" className="w-full rounded-lg px-3 py-1.5 text-left hover:bg-muted" onClick={() => { setMenu(null); act(() => archiveBill({ id: b.id, archived: true })); }}>Arquivar</button></li>
                      <li><button type="button" className="w-full rounded-lg px-3 py-1.5 text-left text-danger hover:bg-muted" onClick={() => { setMenu(null); if (window.confirm(`Excluir “${b.name}” e o histórico de pagamentos?`)) act(() => deleteBill({ id: b.id })); }}>Excluir</button></li>
                    </ul>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {archived.length > 0 && (
        <details className="rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">Arquivadas ({archived.length})</summary>
          <ul className="mt-2 divide-y divide-border text-sm">
            {archived.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2">
                {b.name}
                <button type="button" className={secondaryBtn} onClick={() => act(() => archiveBill({ id: b.id, archived: false }))}>Restaurar</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {dialog && <BillDialog key={dialog.bill?.id ?? "new"} bill={dialog.bill} data={data} onClose={() => setDialog(null)} />}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function BillDialog({ bill, data, onClose }: { bill: Bill | null; data: FinanceData; onClose: () => void }) {
  const [name, setName] = useState(bill?.name ?? "");
  const [amount, setAmount] = useState(bill?.amountCents ? centsToInput(bill.amountCents) : "");
  const [dueDay, setDueDay] = useState(bill ? String(bill.dueDay) : "10");
  const [autoDebit, setAutoDebit] = useState(bill?.autoDebit ?? false);
  const [accountId, setAccountId] = useState(bill?.accountId ?? "");
  const [notes, setNotes] = useState(bill?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const accounts = data.accounts.filter((a) => !a.archivedAt || a.id === bill?.accountId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await saveBill({ id: bill?.id ?? null, input: { name, amount, dueDay: Number(dueDay), autoDebit, accountId: accountId || null, notes } });
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <Modal title={bill ? "Editar conta a pagar" : "Nova conta a pagar"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="bname" className={labelCls}>Nome</label>
          <input id="bname" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Aluguel, Luz, Internet, Netflix" required maxLength={80} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="bamount" className={labelCls}>Valor (opcional)</label>
            <input id="bamount" inputMode="decimal" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="deixe vazio se varia" />
          </div>
          <div>
            <label htmlFor="bday" className={labelCls}>{autoDebit ? "Dia do débito" : "Dia do vencimento"}</label>
            <input id="bday" type="number" min={1} max={31} className={inputCls} value={dueDay} onChange={(e) => setDueDay(e.target.value)} required />
          </div>
        </div>
        <fieldset>
          <legend className={labelCls}>Débito automático?</legend>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
            {[false, true].map((v) => (
              <button key={String(v)} type="button" onClick={() => setAutoDebit(v)} className={`rounded-md px-3 py-1.5 ${autoDebit === v ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>
                {v ? "Sim" : "Não"}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {autoDebit
              ? "É debitada sozinha: não aparece no calendário e nunca fica “atrasada”."
              : "O vencimento aparece no calendário todo mês como lembrete, até você marcar como paga."}
          </p>
        </fieldset>
        <div>
          <label htmlFor="bacc" className={labelCls}>Paga por qual conta? (opcional)</label>
          <select id="bacc" className={inputCls} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">—</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="bnotes" className={labelCls}>Observação (opcional)</label>
          <input id="bnotes" className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
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
