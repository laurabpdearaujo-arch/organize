import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/web/components/modal";
import type { FinanceData } from "@/lib/finance/repository";
import { PAYMENT_METHOD_LABEL, type PaymentMethod, type TxType } from "@/lib/finance/constants";
import { centsToInput, CURRENCY_SYMBOL } from "@/lib/finance/money";
import { deleteTransaction, saveTransaction } from "./actions";

type Tx = FinanceData["transactions"][number];

export function TxDialog({ data, tx, defaultDate, onClose }: { data: FinanceData; tx: Tx | null; defaultDate: string; onClose: () => void }) {
  const active = data.accounts.filter((a) => !a.archivedAt || a.id === tx?.accountId || a.id === tx?.toAccountId);
  const [type, setType] = useState<TxType>(tx?.type ?? "expense");
  const [accountId, setAccountId] = useState(tx?.accountId ?? active.find((a) => a.type !== "credit_card")?.id ?? active[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(tx?.toAccountId ?? "");
  const [amount, setAmount] = useState(tx ? centsToInput(tx.amountCents) : "");
  const [date, setDate] = useState(tx?.date ?? defaultDate);
  const [description, setDescription] = useState(tx?.description ?? "");
  const [categoryId, setCategoryId] = useState(tx?.categoryId ?? "");
  const [method, setMethod] = useState<PaymentMethod>(tx?.paymentMethod ?? "pix");
  const [notes, setNotes] = useState(tx?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const account = data.accounts.find((a) => a.id === accountId);
  const cats = data.categories.filter((c) => c.kind === type && (!c.archivedAt || c.id === tx?.categoryId));
  const descriptions = [...new Set(data.transactions.map((t) => t.description))].slice(0, 200);

  const cashAccount = active.find((a) => a.type === "cash");

  function changeAccount(id: string) {
    setAccountId(id);
    const acc = data.accounts.find((a) => a.id === id);
    if (acc?.type === "credit_card" && type === "expense") setMethod("credit");
    if (acc?.type === "cash" && type !== "transfer") setMethod("cash");
    else if (acc && acc.type !== "cash" && method === "cash") setMethod(acc.type === "credit_card" ? "credit" : "pix");
  }

  /** Pagou em dinheiro vivo → a conta passa a ser a Carteira (dinheiro não sai do banco). */
  function changeMethod(m: PaymentMethod) {
    setMethod(m);
    if (m === "cash" && cashAccount && account?.type !== "cash") setAccountId(cashAccount.id);
  }

  function changeType(t: TxType) {
    setType(t);
    setCategoryId("");
    if (t === "transfer") setMethod("transfer");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = {
      type,
      accountId,
      toAccountId: type === "transfer" ? toAccountId || null : null,
      amount,
      date,
      description,
      categoryId: type === "transfer" ? null : categoryId || null,
      paymentMethod: method,
      notes,
    };
    startTransition(async () => {
      const r = await saveTransaction({ id: tx?.id ?? null, input });
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  function remove() {
    if (!tx || !window.confirm("Excluir este lançamento?")) return;
    startTransition(async () => {
      const r = await deleteTransaction({ id: tx.id });
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <Modal title={tx ? "Editar lançamento" : "Novo lançamento"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-sm">
          {(["expense", "income", "transfer"] as TxType[]).map((t) => (
            <button key={t} type="button" onClick={() => changeType(t)} className={`rounded-md px-2 py-1.5 ${type === t ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>
              {t === "expense" ? "Despesa" : t === "income" ? "Receita" : "Transferência"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="amount" className={labelCls}>Valor {account ? `(${CURRENCY_SYMBOL[account.currency]})` : ""}</label>
            <input id="amount" inputMode="decimal" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" required autoFocus />
          </div>
          <div>
            <label htmlFor="date" className={labelCls}>{type === "expense" && account?.type === "credit_card" ? "Data da compra" : "Data"}</label>
            <input id="date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>

        <div>
          <label htmlFor="desc" className={labelCls}>Descrição</label>
          <input id="desc" list="tx-descriptions" className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={type === "transfer" ? "Ex.: Pagamento da fatura" : "Ex.: Mercado"} required maxLength={200} />
          <datalist id="tx-descriptions">
            {descriptions.map((d) => <option key={d} value={d} />)}
          </datalist>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="acc" className={labelCls}>{type === "transfer" ? "De (origem)" : "Conta"}</label>
            <select id="acc" className={inputCls} value={accountId} onChange={(e) => changeAccount(e.target.value)} required>
              {active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          {type === "transfer" ? (
            <div>
              <label htmlFor="toacc" className={labelCls}>Para (destino)</label>
              <select id="toacc" className={inputCls} value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} required>
                <option value="">Escolha…</option>
                {active.filter((a) => a.id !== accountId && a.currency === account?.currency).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label htmlFor="cat" className={labelCls}>Categoria</label>
              <select id="cat" className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Sem categoria</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {type === "transfer" && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            Transferências (inclusive pagar a fatura do cartão) só movem dinheiro entre contas: não entram como receita nem despesa.
          </p>
        )}

        {type !== "transfer" && (
          <div>
            <label htmlFor="method" className={labelCls}>Forma de pagamento</label>
            <select id="method" className={inputCls} value={method} onChange={(e) => changeMethod(e.target.value as PaymentMethod)}>
              {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
            </select>
            {method === "cash" && account?.type === "cash" && (
              <p className="mt-1 text-xs text-muted-foreground">Dinheiro vivo fica na conta “{account.name}”. Saque no banco = transferência do banco para ela.</p>
            )}
          </div>
        )}

        <div>
          <label htmlFor="notes" className={labelCls}>Observações (opcional)</label>
          <textarea id="notes" rows={2} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </div>

        {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex items-center gap-2">
          {tx && (
            <button type="button" onClick={remove} disabled={pending} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10">
              <Trash2 className="size-4" /> Excluir
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className={secondaryBtn}>Cancelar</button>
            <button type="submit" disabled={pending} className={primaryBtn}>{pending ? "Salvando…" : "Salvar"}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
