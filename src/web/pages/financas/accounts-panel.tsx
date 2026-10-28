import { useState, useTransition } from "react";
import { CreditCard, Landmark, MoreHorizontal, Plus, Wallet } from "lucide-react";
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/web/components/modal";
import { EVENT_COLORS, colorHex, type EventColor } from "@/lib/calendar/colors";
import { ACCOUNT_TYPE_LABEL, type AccountType } from "@/lib/finance/constants";
import type { FinanceData } from "@/lib/finance/repository";
import { centsToInput, CURRENCIES, CURRENCY_SYMBOL, formatMoney, type Currency } from "@/lib/finance/money";
import { adjustAccountBalance, archiveAccount, deleteAccount, saveAccount } from "./actions";

type Account = FinanceData["accounts"][number];

/** Contas que podem pagar a fatura de um cartão (o cartão aparece dentro delas). */
export const canPayCard = (a: Pick<Account, "type">) => a.type === "checking" || a.type === "savings";

/** No cartão a pessoa digita a fatura em positivo; o saldo guardado é negativo (dívida). */
const negate = (s: string) => {
  const t = s.trim();
  return !t ? "" : t.startsWith("-") ? t.slice(1) : `-${t}`;
};

function cardStatus(c: Account) {
  const due = c.dueDay ? ` · vence dia ${c.dueDay}` : "";
  if (c.balanceCents < 0) return `Fatura aberta ${formatMoney(-c.balanceCents, c.currency)}${due}`;
  if (c.balanceCents > 0) return `Crédito ${formatMoney(c.balanceCents, c.currency)}${due}`;
  return `Sem fatura em aberto${due}`;
}

/**
 * Caixas com o saldo de cada conta (fica na Visão geral). O cartão aparece dentro da conta que paga a fatura:
 * por trás continuam dois saldos (conta e cartão), então a compra no cartão não mexe no saldo do banco
 * até a fatura ser paga (transferência). Menu ⋯ para editar/ajustar/arquivar.
 */
export function AccountTiles({ data, currency }: { data: FinanceData; currency: Currency }) {
  const [dialog, setDialog] = useState<{ account: Account | null; cardOf?: Account } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [adjust, setAdjust] = useState<Account | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const active = data.accounts.filter((a) => !a.archivedAt && a.currency === currency);
  const archived = data.accounts.filter((a) => a.archivedAt);
  const total = active.reduce((s, a) => s + a.balanceCents, 0);
  const holders = active.filter((a) => a.type !== "credit_card");
  const cardsOf = (id: string) => active.filter((c) => c.type === "credit_card" && c.paymentAccountId === id);
  // cartão sem conta ligada (ou ligada a uma conta arquivada) continua numa caixa própria
  const looseCards = active.filter((c) => c.type === "credit_card" && !holders.some((h) => h.id === c.paymentAccountId));
  const payers = data.accounts.filter((a) => !a.archivedAt && canPayCard(a));

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Erro.");
    });
  }

  const item = (label: string, onClick: () => void, danger = false) => (
    <li>
      <button type="button" className={`w-full rounded-lg px-3 py-1.5 text-left hover:bg-muted ${danger ? "text-danger" : ""}`} onClick={() => { setMenu(null); onClick(); }}>
        {label}
      </button>
    </li>
  );

  const menuFor = (a: Account) =>
    menu === a.id && (
      <>
        <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
        <ul className="absolute right-2 top-8 z-20 w-44 rounded-xl border border-border bg-card p-1 text-sm shadow-lg">
          {item("Editar", () => setDialog({ account: a }))}
          {canPayCard(a) && !a.archivedAt && item("Adicionar cartão", () => setDialog({ account: null, cardOf: a }))}
          {item(a.type === "credit_card" ? "Ajustar fatura" : "Ajustar saldo", () => setAdjust(a))}
          {item(a.archivedAt ? "Restaurar" : "Arquivar", () => act(() => archiveAccount({ id: a.id, archived: !a.archivedAt })))}
          {item("Excluir", () => { if (window.confirm(`Excluir “${a.name}”?`)) act(() => deleteAccount({ id: a.id })); }, true)}
        </ul>
      </>
    );

  const menuButton = (a: Account) => (
    <button type="button" aria-label={`Opções de ${a.name}`} onClick={() => setMenu(menu === a.id ? null : a.id)} className="rounded p-0.5 text-muted-foreground hover:bg-muted">
      <MoreHorizontal className="size-3.5" />
    </button>
  );

  const icon = (a: Account) => (a.type === "credit_card" ? <CreditCard className="size-3.5" /> : a.type === "cash" ? <Wallet className="size-3.5" /> : <Landmark className="size-3.5" />);

  const tile = (a: Account, cards: Account[] = []) => (
    <div key={a.id} className={`relative rounded-xl border border-border bg-card px-3 py-2.5 ${cards.length ? "col-span-2" : ""} ${a.archivedAt ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span style={{ color: colorHex(a.color) }}>{icon(a)}</span>
          <span className="truncate" title={`${a.name} · ${ACCOUNT_TYPE_LABEL[a.type]}`}>{a.name}</span>
        </span>
        {menuButton(a)}
      </div>
      {a.type === "credit_card" ? (
        <>
          <p className={`mt-1 text-base font-semibold tabular-nums ${a.balanceCents < 0 ? "text-danger" : ""}`}>{formatMoney(-a.balanceCents, a.currency)}</p>
          <p className="text-[11px] text-muted-foreground">{cardStatus(a)}</p>
        </>
      ) : (
        <p className={`mt-1 text-base font-semibold tabular-nums ${a.balanceCents < 0 ? "text-danger" : ""}`}>{formatMoney(a.balanceCents, a.currency)}</p>
      )}
      {cards.map((c) => (
        <div key={c.id} className="relative mt-2 border-t border-border pt-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className="flex min-w-0 items-center gap-1 text-xs">
              <CreditCard className="size-3 shrink-0" style={{ color: colorHex(c.color) }} />
              <span className="truncate">{c.name}</span>
            </span>
            {menuButton(c)}
          </div>
          <p className={`text-[11px] ${c.balanceCents < 0 ? "text-danger" : "text-muted-foreground"}`}>{cardStatus(c)}</p>
          {menuFor(c)}
        </div>
      ))}
      {menuFor(a)}
    </div>
  );

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">
          Contas <span className="font-normal text-muted-foreground">· total {formatMoney(total, currency)} (já descontando as faturas abertas)</span>
        </h2>
        {archived.length > 0 && (
          <button type="button" onClick={() => setShowArchived((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground">
            {showArchived ? "Esconder arquivadas" : `Arquivadas (${archived.length})`}
          </button>
        )}
      </div>
      {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {holders.map((a) => tile(a, cardsOf(a.id)))}
        {looseCards.map((c) => tile(c))}
        {showArchived && archived.map((a) => tile(a))}
        <button type="button" onClick={() => setDialog({ account: null })} className="flex min-h-16 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
          <Plus className="size-4" /> Nova conta
        </button>
      </div>
      {payers.length > 0 && !data.accounts.some((a) => a.type === "credit_card" && !a.archivedAt) && (
        <p className="text-xs text-muted-foreground">Cartão de crédito: no menu ⋯ da conta que paga a fatura, use “Adicionar cartão”.</p>
      )}
      {dialog && (
        <AccountDialog key={dialog.account?.id ?? `new-${dialog.cardOf?.id ?? ""}`} account={dialog.account} cardOf={dialog.cardOf ?? null} payers={payers} onClose={() => setDialog(null)} />
      )}
      {adjust && <AdjustDialog account={adjust} onClose={() => setAdjust(null)} />}
    </section>
  );
}

function AdjustDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const card = account.type === "credit_card";
  const [value, setValue] = useState(centsToInput(card ? -account.balanceCents : account.balanceCents));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await adjustAccountBalance({ id: account.id, balance: card ? negate(value) : value });
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <Modal title={`${card ? "Ajustar fatura" : "Ajustar saldo"} de “${account.name}”`} onClose={onClose} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {card ? "Fatura em aberto calculada hoje: " : "Saldo calculado hoje: "}
          <strong>{formatMoney(card ? -account.balanceCents : account.balanceCents, account.currency)}</strong>. Informe {card ? "quanto está em aberto" : "quanto há"} de
          verdade agora. O site corrige o saldo inicial, <strong>sem criar receita ou despesa</strong>.
        </p>
        <div>
          <label htmlFor="adj" className={labelCls}>{card ? "Fatura em aberto hoje" : "Saldo real hoje"} ({CURRENCY_SYMBOL[account.currency]})</label>
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

/**
 * Conta nova/edição. Cartão (cardOf preenchido ou editando um cartão): escolhe a conta que paga a fatura,
 * o vencimento e a fatura já em aberto (em positivo). "Nova conta" não oferece cartão: ele nasce dentro da conta.
 */
export function AccountDialog({
  account,
  cardOf,
  payers,
  onClose,
  onSaved,
}: {
  account: Account | null;
  cardOf: Account | null;
  payers: Account[];
  onClose: () => void;
  onSaved?: (id: string | null) => void;
}) {
  const isCard = account ? account.type === "credit_card" : !!cardOf;
  const [name, setName] = useState(account?.name ?? (cardOf ? `Cartão ${cardOf.name}` : ""));
  const [type, setType] = useState<AccountType>(account?.type ?? (cardOf ? "credit_card" : "checking"));
  const [currency, setCurrency] = useState<Currency>(account?.currency ?? cardOf?.currency ?? "BRL");
  const [paymentAccountId, setPaymentAccountId] = useState(account?.paymentAccountId ?? cardOf?.id ?? "");
  const [initial, setInitial] = useState(account ? centsToInput(isCard ? -account.initialBalanceCents : account.initialBalanceCents) : "");
  const [color, setColor] = useState<EventColor>((account?.color as EventColor) ?? (cardOf?.color as EventColor) ?? "violet");
  const [closingDay, setClosingDay] = useState(account?.closingDay ? String(account.closingDay) : "");
  const [dueDay, setDueDay] = useState(account?.dueDay ? String(account.dueDay) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const types = (Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).filter((t) => t !== "credit_card");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = {
      name,
      type: isCard ? "credit_card" : type,
      currency,
      initialBalance: isCard ? negate(initial) : initial,
      color,
      closingDay: isCard && closingDay ? Number(closingDay) : null,
      dueDay: isCard && dueDay ? Number(dueDay) : null,
      paymentAccountId: isCard && paymentAccountId ? paymentAccountId : null,
    };
    startTransition(async () => {
      const r = await saveAccount({ id: account?.id ?? null, input });
      if (!r.ok) return setError(r.error);
      onSaved?.(r.id ?? null);
      onClose();
    });
  }

  const title = isCard ? (account ? "Editar cartão" : "Novo cartão") : account ? "Editar conta" : "Nova conta";

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="aname" className={labelCls}>Nome</label>
          <input id="aname" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={isCard ? "Ex.: Cartão Bradesco" : "Ex.: Sicoob, Bradesco"} required maxLength={60} autoFocus />
        </div>
        {isCard ? (
          <>
            <div>
              <label htmlFor="apay" className={labelCls}>Conta que paga a fatura</label>
              <select id="apay" className={inputCls} value={paymentAccountId} onChange={(e) => setPaymentAccountId(e.target.value)} required={!account}>
                {account && <option value="">Nenhuma (cartão fica numa caixa própria)</option>}
                {payers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">O cartão aparece dentro dessa conta. As compras não mexem no saldo dela até a fatura ser paga.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="adue" className={labelCls}>Dia do vencimento</label>
                <input id="adue" type="number" min={1} max={31} className={inputCls} value={dueDay} onChange={(e) => setDueDay(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="aclose" className={labelCls}>Dia do fechamento (opcional)</label>
                <input id="aclose" type="number" min={1} max={31} className={inputCls} value={closingDay} onChange={(e) => setClosingDay(e.target.value)} />
              </div>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="atype" className={labelCls}>Tipo</label>
              <select id="atype" className={inputCls} value={type} onChange={(e) => setType(e.target.value as AccountType)}>
                {types.map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="acur" className={labelCls}>Moeda</label>
              <select id="acur" className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{CURRENCY_SYMBOL[c]} ({c})</option>)}
              </select>
            </div>
          </div>
        )}
        <div>
          <label htmlFor="ainit" className={labelCls}>{isCard ? "Fatura já em aberto (opcional)" : "Saldo inicial"}</label>
          <input id="ainit" inputMode="decimal" className={inputCls} value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="0,00" />
          <p className="mt-1 text-xs text-muted-foreground">
            {isCard ? "Quanto já estava na fatura antes do primeiro lançamento no site." : "Quanto havia na conta antes do primeiro lançamento no site."}
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
