"use client";

import { useState, useTransition } from "react";
import { CreditCard, Landmark, MoreHorizontal, Plus } from "lucide-react";
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/components/modal";
import { EVENT_COLORS, colorHex, type EventColor } from "@/lib/calendar/colors";
import { ACCOUNT_TYPE_LABEL, type AccountType } from "@/lib/finance/constants";
import type { FinanceData } from "@/lib/finance/repository";
import { centsToInput, CURRENCIES, CURRENCY_SYMBOL, formatMoney, type Currency } from "@/lib/finance/money";
import { adjustAccountBalance, archiveAccount, deleteAccount, saveAccount } from "./actions";

type Account = FinanceData["accounts"][number];

export function AccountsPanel({ data }: { data: FinanceData }) {
  const [dialog, setDialog] = useState<{ account: Account | null } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [adjust, setAdjust] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const active = data.accounts.filter((a) => !a.archivedAt);
  const archived = data.accounts.filter((a) => a.archivedAt);

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Erro.");
    });
  }

  const card = (a: Account) => (
    <div key={a.id} className="relative rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${colorHex(a.color)} 18%, var(--card))`, color: colorHex(a.color) }}>
            {a.type === "credit_card" ? <CreditCard className="size-4" /> : <Landmark className="size-4" />}
          </span>
          <div>
            <p className="text-sm font-medium">{a.name}</p>
            <p className="text-xs text-muted-foreground">
              {ACCOUNT_TYPE_LABEL[a.type]} · {CURRENCY_SYMBOL[a.currency]}
              {a.type === "credit_card" && a.closingDay && ` · fecha dia ${a.closingDay}, vence dia ${a.dueDay}`}
            </p>
          </div>
        </div>
        <button type="button" aria-label={`Opções de ${a.name}`} onClick={() => setMenu(menu === a.id ? null : a.id)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
          <MoreHorizontal className="size-4" />
        </button>
      </div>
      <p className={`mt-3 text-xl font-semibold tabular-nums ${a.balanceCents < 0 ? "text-danger" : ""}`}>{formatMoney(a.balanceCents, a.currency)}</p>
      <p className="text-xs text-muted-foreground">{a.type === "credit_card" ? (a.balanceCents < 0 ? "Valor em aberto no cartão" : "Sem dívida") : "Saldo atual"}</p>

      {menu === a.id && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
          <ul className="absolute right-3 top-11 z-20 w-40 rounded-xl border border-border bg-card p-1 text-sm shadow-lg">
            <li><button type="button" className="w-full rounded-lg px-3 py-1.5 text-left hover:bg-muted" onClick={() => { setMenu(null); setDialog({ account: a }); }}>Editar</button></li>
            <li><button type="button" className="w-full rounded-lg px-3 py-1.5 text-left hover:bg-muted" onClick={() => { setMenu(null); setAdjust(a); }}>Ajustar saldo</button></li>
            <li><button type="button" className="w-full rounded-lg px-3 py-1.5 text-left hover:bg-muted" onClick={() => { setMenu(null); act(() => archiveAccount({ id: a.id, archived: !a.archivedAt })); }}>{a.archivedAt ? "Restaurar" : "Arquivar"}</button></li>
            <li><button type="button" className="w-full rounded-lg px-3 py-1.5 text-left text-danger hover:bg-muted" onClick={() => { setMenu(null); if (window.confirm(`Excluir a conta “${a.name}”?`)) act(() => deleteAccount({ id: a.id })); }}>Excluir</button></li>
          </ul>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Cartão de crédito é uma conta: as compras são despesas dele, e pagar a fatura é uma transferência da conta corrente para o cartão.</p>
        <button type="button" onClick={() => setDialog({ account: null })} className={`flex shrink-0 items-center gap-1.5 ${primaryBtn}`}>
          <Plus className="size-4" /> Nova conta
        </button>
      </div>
      {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {active.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card py-10 text-center text-sm text-muted-foreground">Nenhuma conta cadastrada.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{active.map(card)}</div>
      )}
      {archived.length > 0 && (
        <details className="rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">Arquivadas ({archived.length})</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{archived.map(card)}</div>
        </details>
      )}
      {dialog && <AccountDialog key={dialog.account?.id ?? "new"} account={dialog.account} onClose={() => setDialog(null)} />}
      {adjust && <AdjustDialog account={adjust} onClose={() => setAdjust(null)} />}
    </div>
  );
}

function AdjustDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const [value, setValue] = useState(centsToInput(account.balanceCents));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await adjustAccountBalance({ id: account.id, balance: value });
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <Modal title={`Ajustar saldo de “${account.name}”`} onClose={onClose} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Saldo calculado hoje: <strong>{formatMoney(account.balanceCents, account.currency)}</strong>. Informe quanto há de verdade agora.
          O site corrige o saldo inicial, <strong>sem criar receita ou despesa</strong>.
        </p>
        <div>
          <label htmlFor="adj" className={labelCls}>Saldo real hoje ({CURRENCY_SYMBOL[account.currency]})</label>
          <input id="adj" inputMode="decimal" className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} autoFocus required />
        </div>
        {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>Cancelar</button>
          <button type="submit" disabled={pending} className={primaryBtn}>{pending ? "Salvando…" : "Ajustar"}</button>
        </div>
      </form>
    </Modal>
  );
}

function AccountDialog({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "checking");
  const [currency, setCurrency] = useState<Currency>(account?.currency ?? "BRL");
  const [initial, setInitial] = useState(account ? centsToInput(account.initialBalanceCents) : "");
  const [color, setColor] = useState<EventColor>((account?.color as EventColor) ?? "violet");
  const [closingDay, setClosingDay] = useState(account?.closingDay ? String(account.closingDay) : "");
  const [dueDay, setDueDay] = useState(account?.dueDay ? String(account.dueDay) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = {
      name,
      type,
      currency,
      initialBalance: initial,
      color,
      closingDay: type === "credit_card" && closingDay ? Number(closingDay) : null,
      dueDay: type === "credit_card" && dueDay ? Number(dueDay) : null,
    };
    startTransition(async () => {
      const r = await saveAccount({ id: account?.id ?? null, input });
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <Modal title={account ? "Editar conta" : "Nova conta"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="aname" className={labelCls}>Nome</label>
          <input id="aname" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Sicoob, Bradesco, Cartão Nubank" required maxLength={60} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="atype" className={labelCls}>Tipo</label>
            <select id="atype" className={inputCls} value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="acur" className={labelCls}>Moeda</label>
            <select id="acur" className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{CURRENCY_SYMBOL[c]} ({c})</option>)}
            </select>
          </div>
        </div>
        {type === "credit_card" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="aclose" className={labelCls}>Dia do fechamento</label>
              <input id="aclose" type="number" min={1} max={31} className={inputCls} value={closingDay} onChange={(e) => setClosingDay(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="adue" className={labelCls}>Dia do vencimento</label>
              <input id="adue" type="number" min={1} max={31} className={inputCls} value={dueDay} onChange={(e) => setDueDay(e.target.value)} required />
            </div>
          </div>
        )}
        <div>
          <label htmlFor="ainit" className={labelCls}>Saldo inicial</label>
          <input id="ainit" inputMode="decimal" className={inputCls} value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="0,00" />
          <p className="mt-1 text-xs text-muted-foreground">
            {type === "credit_card"
              ? "Se o cartão já tinha valor em aberto, informe com sinal de menos (ex.: -350,00)."
              : "Quanto havia na conta antes do primeiro lançamento no site."}
          </p>
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
