import { useMemo, useState, useTransition } from "react";
import { apiFetch } from "@/web/lib/api";
import { AlertTriangle, CheckCircle2, FileUp, Info } from "lucide-react";
import { inputCls, labelCls, primaryBtn, secondaryBtn } from "@/web/components/modal";
import type { FinanceData } from "@/lib/finance/repository";
import { accountLabel } from "@/lib/finance/constants";
import type { Preview } from "@/lib/finance/import/repository";
import { patternOf, type TxKind } from "@/lib/finance/import/prepare";
import { formatMoney } from "@/lib/finance/money";
import { commitImport, saveAccount } from "./actions";
import type { FinanceTab, ImportList } from "./finance-view";
import { undoImport } from "./actions";

type RowState = {
  include: boolean;
  description: string;
  type: TxKind;
  categoryId: string;
  toAccountId: string;
  remember: boolean;
  /** a pessoa mexeu na classificação desta linha (não sobrescrever ao propagar) */
  touched: boolean;
};

function fullDate(d: string) {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

export function ImportPanel({ data, imports, onGoTo }: { data: FinanceData; imports: ImportList; onGoTo: (t: FinanceTab) => void }) {
  const accounts = data.accounts.filter((a) => !a.archivedAt);
  // Escolhe o banco (dinheiro não tem extrato) e se o PDF é o extrato da conta ou a fatura do cartão
  // pago por ela (ou de um cartão sem conta ligada).
  const banks = accounts.filter((a) => a.type !== "cash" && a.type !== "credit_card");
  const [bankId, setBankId] = useState(banks.find((a) => a.type === "checking")?.id ?? banks[0]?.id ?? "");
  const [kind, setKind] = useState<"statement" | "bill">("statement");
  const [cardId, setCardId] = useState("");
  const [newCardName, setNewCardName] = useState(""); // vazio = "Cartão <banco>"
  const [newCardDue, setNewCardDue] = useState("");
  const bank = banks.find((b) => b.id === bankId);
  const cardOptions = accounts.filter((c) => c.type === "credit_card" && (c.paymentAccountId === bankId || !banks.some((b) => b.id === c.paymentAccountId)));
  const chosenCard = cardOptions.find((c) => c.id === cardId) ?? cardOptions[0];
  const [acceptKind, setAcceptKind] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [acceptMismatch, setAcceptMismatch] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const account = accounts.find((a) => a.id === preview?.accountId);
  const cur = account?.currency ?? "BRL";

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !bank) return;
    setLoading(true);
    setError(null);
    try {
      let target = kind === "statement" ? bank.id : chosenCard?.id;
      if (!target) {
        // fatura de um banco que ainda não tem cartão: cria o cartão ligado a ele e segue
        const r = await saveAccount({
          id: null,
          input: { name: newCardName.trim() || `Cartão ${bank.name}`, type: "credit_card", currency: bank.currency, initialBalance: "", color: bank.color, closingDay: null, dueDay: Number(newCardDue) || null, paymentAccountId: bank.id },
        });
        if (!r.ok || !r.id) {
          setError(r.ok ? "Não foi possível criar o cartão." : r.error);
          return;
        }
        target = r.id;
        setCardId(r.id);
      }
      const fd = new FormData();
      fd.set("file", file);
      fd.set("accountId", target);
      const res = await apiFetch("/api/financas/importar", { method: "POST", body: fd }); // 401 → login
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Não foi possível ler o arquivo.");
        return;
      }
      const p = body as Preview;
      setPreview(p);
      setAcceptMismatch(false);
      setAcceptKind(false);
      setRows(
        p.rows.map((r) => ({
          include: r.status === "new" && r.reversalOf === null,
          description: r.description,
          type: r.suggestion.type,
          categoryId: r.suggestion.categoryId ?? "",
          toAccountId: r.suggestion.toAccountId ?? "",
          remember: false,
          touched: r.suggestion.source === "rule",
        })),
      );
    } catch {
      setError("Falha de conexão ao enviar o arquivo.");
    } finally {
      setLoading(false);
    }
  }

  /** Muda a classificação de uma linha e repete nas linhas com a mesma descrição que ainda não foram mexidas. */
  function classify(i: number, patch: Partial<RowState>) {
    if (!preview) return;
    const pattern = patternOf(preview.rows[i].description);
    const sign = Math.sign(preview.rows[i].amountCents);
    setRows((rs) =>
      rs.map((r, j) => {
        if (j === i) return { ...r, ...patch, touched: true, remember: true };
        const same = !r.touched && patternOf(preview.rows[j].description) === pattern && Math.sign(preview.rows[j].amountCents) === sign;
        return same ? { ...r, ...patch } : r;
      }),
    );
  }

  const selected = rows.map((r, i) => ({ r, p: preview?.rows[i] })).filter((x) => x.r.include && x.p);
  const totals = useMemo(() => {
    let inc = 0;
    let out = 0;
    for (const { p } of selected) {
      if (p!.amountCents > 0) inc += p!.amountCents;
      else out -= p!.amountCents;
    }
    return { inc, out };
  }, [selected]);
  const missingTransfer = selected.some(({ r }) => r.type === "transfer" && !r.toAccountId);
  const mismatch = preview?.reconciliation.status === "mismatch";
  // escolheu "extrato" e o PDF tem cara de fatura (ou o contrário): só importa depois de confirmar
  const kindMismatch = !!preview && preview.looksLikeCardBill !== (account?.type === "credit_card");
  const canImport = selected.length > 0 && !missingTransfer && (!mismatch || acceptMismatch) && (!kindMismatch || acceptKind);

  function confirm() {
    if (!preview || !canImport) return;
    setError(null);
    startTransition(async () => {
      const r = await commitImport({
        accountId: preview.accountId,
        fileName: preview.fileName,
        fileHash: preview.fileHash,
        period: preview.period,
        rows: selected.map(({ r, p }) => ({
          date: p!.date,
          originalDescription: p!.description,
          description: r.description,
          amountCents: p!.amountCents,
          occurrence: p!.occurrence,
          type: r.type,
          categoryId: r.type === "transfer" ? null : r.categoryId || null,
          toAccountId: r.type === "transfer" ? r.toAccountId || null : null,
          remember: r.remember,
        })),
      });
      if (r.ok) {
        setResult({ imported: r.imported ?? 0, skipped: r.skipped ?? 0 });
        setPreview(null);
      } else setError(r.error);
    });
  }

  function reset() {
    setPreview(null);
    setResult(null);
    setFile(null);
    setError(null);
  }

  // ---------- resultado ----------
  if (result) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <CheckCircle2 className="mx-auto mb-2 size-8 text-success" />
        <p className="font-medium">{result.imported} lançamento(s) importado(s)</p>
        {result.skipped > 0 && <p className="text-sm text-muted-foreground">{result.skipped} ignorado(s) porque já existiam.</p>}
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" className={secondaryBtn} onClick={reset}>Importar outro extrato</button>
          <button type="button" className={primaryBtn} onClick={() => onGoTo("lancamentos")}>Ver lançamentos</button>
        </div>
      </div>
    );
  }

  function undo(batch: ImportList[number]) {
    const msg = `Desfazer a importação de “${batch.fileName ?? "extrato"}”? Os ${batch.remaining} lançamento(s) que vieram dela serão apagados. Isso não pode ser desfeito.`;
    if (!window.confirm(msg)) return;
    setError(null);
    startTransition(async () => {
      const r = await undoImport({ id: batch.id });
      if (!r.ok) setError(r.error);
    });
  }

  // ---------- envio ----------
  if (!preview) {
    return (
      <div className="space-y-4">
      <form onSubmit={analyze} className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div>
          <h2 className="font-medium">Importar extrato ou fatura em PDF</h2>
          <p className="text-sm text-muted-foreground">
            Escolha o banco e diga se o PDF é o extrato da conta ou a fatura do cartão. Na fatura, as compras viram despesas do cartão; no
            extrato, o pagamento da fatura vira transferência para o cartão (sem contar em dobro). Funciona com PDF com texto (não
            print/foto). O arquivo é lido e descartado; nada é gravado antes de você revisar e confirmar.
          </p>
        </div>
        {banks.length === 0 ? (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">Cadastre primeiro a conta do banco (Visão geral → Nova conta).</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="iacc" className={labelCls}>Banco</label>
                <select id="iacc" className={inputCls} value={bankId} onChange={(e) => { setBankId(e.target.value); setCardId(""); }} required>
                  {banks.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <p className={labelCls}>O PDF é</p>
                <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm" role="radiogroup" aria-label="Tipo de PDF">
                  {(
                    [
                      ["statement", "Extrato da conta"],
                      ["bill", "Fatura do cartão"],
                    ] as const
                  ).map(([k, label]) => (
                    <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`flex-1 rounded-md px-2 py-1.5 ${kind === k ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {kind === "bill" &&
              (cardOptions.length > 1 ? (
                <div>
                  <label htmlFor="icard" className={labelCls}>Qual cartão</label>
                  <select id="icard" className={inputCls} value={chosenCard?.id ?? ""} onChange={(e) => setCardId(e.target.value)}>
                    {cardOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              ) : chosenCard ? (
                <p className="text-sm text-muted-foreground">As compras vão para o cartão “{chosenCard.name}”.</p>
              ) : (
                <div className="space-y-2 rounded-lg bg-muted/60 p-3">
                  <p className="text-sm">O {bank?.name} ainda não tem cartão cadastrado. Ele será criado agora, dentro da conta:</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="icname" className={labelCls}>Nome do cartão</label>
                      <input id="icname" className={inputCls} value={newCardName} onChange={(e) => setNewCardName(e.target.value)} placeholder={`Cartão ${bank?.name ?? ""}`} maxLength={60} />
                    </div>
                    <div>
                      <label htmlFor="icdue" className={labelCls}>Dia do vencimento</label>
                      <input id="icdue" type="number" min={1} max={31} className={inputCls} value={newCardDue} onChange={(e) => setNewCardDue(e.target.value)} required />
                    </div>
                  </div>
                </div>
              ))}
            <div>
              <label htmlFor="ifile" className={labelCls}>Arquivo PDF (até 5 MB)</label>
              <input id="ifile" type="file" accept="application/pdf,.pdf" className={`${inputCls} file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-sm`} onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
            </div>
          </>
        )}
        {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <button type="submit" disabled={loading || !file || !bank} className={`flex items-center gap-1.5 ${primaryBtn}`}>
          <FileUp className="size-4" /> {loading ? "Lendo…" : kind === "statement" ? "Ler extrato" : chosenCard ? "Ler fatura" : "Criar cartão e ler fatura"}
        </button>
      </form>

      {imports.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-medium">Importações feitas</h2>
          <p className="mb-3 text-sm text-muted-foreground">Desfazer apaga todos os lançamentos que vieram daquela importação (útil para testes ou importação errada).</p>
          <ul className="divide-y divide-border text-sm">
            {imports.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{b.fileName ?? "extrato"}</span>
                  <span className="text-xs text-muted-foreground">
                    {accounts.find((a) => a.id === b.accountId)?.name ?? data.accounts.find((a) => a.id === b.accountId)?.name}
                    {b.periodStart && b.periodEnd && ` · ${fullDate(b.periodStart)} a ${fullDate(b.periodEnd)}`}
                    {` · importado em ${fullDate(new Date(b.createdAt).toISOString().slice(0, 10))}`}
                    {` · ${b.remaining} lançamento(s)`}
                  </span>
                </span>
                <button type="button" disabled={pending} onClick={() => undo(b)} className="rounded-lg px-3 py-1.5 text-sm text-danger hover:bg-danger/10 disabled:opacity-50">
                  Desfazer importação
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    );
  }

  // ---------- revisão ----------
  const rec = preview.reconciliation;
  const counts = {
    novos: preview.rows.filter((r) => r.status === "new").length,
    dup: preview.rows.filter((r) => r.status === "duplicate").length,
    poss: preview.rows.filter((r) => r.status === "possible_duplicate").length,
    est: preview.rows.filter((r) => r.reversalOf !== null).length,
  };
  const otherAccounts = accounts.filter((a) => a.id !== preview.accountId && a.currency === cur);

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-medium">{preview.fileName}</h2>
            <p className="text-sm text-muted-foreground">
              {account?.name} · {preview.rows.length} lançamento(s)
              {preview.period && ` · período ${fullDate(preview.period.start)} a ${fullDate(preview.period.end)}`}
            </p>
          </div>
          <button type="button" className={secondaryBtn} onClick={reset}>Cancelar</button>
        </div>

        {rec.status === "ok" && (
          <p className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
            <CheckCircle2 className="size-4 shrink-0" />
            {rec.checked > 0
              ? `Saldos do extrato conferem (${rec.checked} conferido(s)${rec.totals === "ok" ? ", e o total também" : ""}).`
              : "Os totais do documento conferem com a soma dos lançamentos."}
          </p>
        )}
        {rec.status === "unchecked" && (
          <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <Info className="size-4 shrink-0" /> O extrato não tem saldos para conferir. Revise os valores com atenção.
          </p>
        )}
        {mismatch && (
          <div className="space-y-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
            <p className="flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" /> {rec.mismatches.length} de {rec.checked} saldo(s) do extrato não conferem com a soma dos lançamentos.
              Pode ser uma particularidade do banco ou um erro de leitura: compare com o PDF antes de importar.
            </p>
            <label className="flex items-center gap-2 text-foreground">
              <input type="checkbox" checked={acceptMismatch} onChange={(e) => setAcceptMismatch(e.target.checked)} /> Revisei e quero importar mesmo assim
            </label>
          </div>
        )}
        {preview.alreadyImportedAt && (
          <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
            <Info className="size-4 shrink-0" /> Este mesmo arquivo já foi importado em {fullDate(preview.alreadyImportedAt.slice(0, 10))}. Os lançamentos repetidos serão ignorados.
          </p>
        )}
        {kindMismatch && (
          <div className="space-y-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
            <p className="flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" />
              {preview.looksLikeCardBill
                ? "Este PDF parece uma FATURA de cartão (tem “Resumo da fatura” ou “Pagamento mínimo”), mas foi lido como extrato da conta: as compras entrariam como receita. Clique em Cancelar e escolha “Fatura do cartão”."
                : "Este PDF não parece uma fatura de cartão (não achei “Resumo da fatura” nem “Pagamento mínimo”). Se for o extrato da conta, clique em Cancelar e escolha “Extrato da conta”."}
            </p>
            <label className="flex items-center gap-2 text-foreground">
              <input type="checkbox" checked={acceptKind} onChange={(e) => setAcceptKind(e.target.checked)} /> Conferi, está certo assim
            </label>
          </div>
        )}
        {preview.warnings.map((w) => (
          <p key={w} className="text-sm text-warning">⚠ {w}</p>
        ))}
        <p className="text-xs text-muted-foreground">
          {counts.novos} novo(s) · {counts.dup} já importado(s) · {counts.poss} parecido(s) com lançamentos existentes · {counts.est} estorno(s).
          Os desmarcados não serão importados. Ao escolher uma categoria, o site repete nas linhas iguais e lembra para as próximas importações.
        </p>
      </section>

      <ul className="space-y-2">
        {preview.rows.map((p, i) => {
          const r = rows[i];
          if (!r) return null;
          const isIn = p.amountCents > 0;
          const cats = data.categories.filter((c) => !c.archivedAt && c.kind === r.type);
          return (
            <li key={p.index} className={`rounded-xl border bg-card p-3 ${r.include ? "border-border" : "border-dashed border-border opacity-60"}`}>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={r.include}
                  disabled={p.status === "duplicate"}
                  onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                  aria-label="Importar este lançamento"
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{fullDate(p.date)}</span>
                    <span className={`text-sm font-semibold tabular-nums ${isIn ? "text-success" : ""}`}>
                      {isIn ? "+" : "−"}
                      {formatMoney(Math.abs(p.amountCents), cur)}
                    </span>
                  </div>
                  <input
                    className={`${inputCls} py-1.5`}
                    value={r.description}
                    onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                    aria-label="Descrição"
                    maxLength={200}
                  />
                  <div className="grid gap-2 sm:grid-cols-[150px_1fr_auto] sm:items-center">
                    <select
                      className={`${inputCls} py-1.5`}
                      value={r.type}
                      onChange={(e) => classify(i, { type: e.target.value as TxKind, categoryId: "", toAccountId: "" })}
                      aria-label="Tipo"
                    >
                      {isIn ? <option value="income">Receita</option> : <option value="expense">Despesa</option>}
                      <option value="transfer">Transferência</option>
                    </select>
                    {r.type === "transfer" ? (
                      <select className={`${inputCls} py-1.5 ${!r.toAccountId && r.include ? "border-warning" : ""}`} value={r.toAccountId} onChange={(e) => classify(i, { toAccountId: e.target.value })} aria-label={isIn ? "Veio da conta" : "Foi para a conta"}>
                        <option value="">{isIn ? "Veio de qual conta?" : "Foi para qual conta?"}</option>
                        {otherAccounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
                      </select>
                    ) : (
                      <select className={`${inputCls} py-1.5`} value={r.categoryId} onChange={(e) => classify(i, { categoryId: e.target.value })} aria-label="Categoria">
                        <option value="">Sem categoria</option>
                        {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    )}
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Usar esta classificação automaticamente nas próximas importações">
                      <input type="checkbox" checked={r.remember} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, remember: e.target.checked } : x)))} />
                      lembrar
                    </label>
                  </div>
                  {(p.hint || p.suggestion.source !== "sign") && (
                    <p className="text-xs text-muted-foreground">
                      {p.hint}
                      {p.hint && p.suggestion.source !== "sign" ? " · " : ""}
                      {p.suggestion.source === "rule" && "classificado por uma regra que você criou"}
                      {p.suggestion.source === "keyword" && "parece pagamento de fatura/aplicação: sugerido como transferência"}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <section className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur md:bottom-4">
        <p className="text-sm">
          <strong>{selected.length}</strong> selecionado(s) · entradas <span className="text-success">{formatMoney(totals.inc, cur)}</span> · saídas {formatMoney(totals.out, cur)}
          {missingTransfer && <span className="block text-xs text-warning">Escolha a conta das transferências marcadas.</span>}
        </p>
        <button type="button" disabled={!canImport || pending} onClick={confirm} className={primaryBtn}>
          {pending ? "Importando…" : `Importar ${selected.length} lançamento(s)`}
        </button>
        {error && <p role="alert" className="w-full rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      </section>
    </div>
  );
}
