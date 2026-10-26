import { useRef, useState, useTransition } from "react";
import { History, MoreHorizontal, Plus, RefreshCw, TrendingUp } from "lucide-react";
import { EmptyState } from "@/web/components/empty-state";
import { Modal, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/web/components/modal";
import { EVENT_COLORS, colorHex, type EventColor } from "@/lib/calendar/colors";
import type { InvestmentList } from "@/lib/finance/investments-repository";
import { monthlyEvolution, summarize, type InvestmentKind, type MovementType } from "@/lib/finance/investments";
import { centsToInput, CURRENCIES, CURRENCY_SYMBOL, formatMoney, type Currency } from "@/lib/finance/money";
import {
  addInvestmentMovement,
  archiveInvestment,
  deleteInvestment,
  deleteInvestmentMovement,
  deleteInvestmentValue,
  saveInvestment,
  setInvestmentValue,
} from "./actions";

type Inv = InvestmentList[number];

const KIND_LABEL: Record<InvestmentKind, string> = { fixed_income: "Renda fixa", stock: "Ações / FIIs / ETFs", pension: "Previdência" };
const MOVE_LABEL: Record<MovementType, string> = {
  contribution: "Aporte (dinheiro novo)",
  withdrawal: "Resgate / venda",
  reinvestment: "Rendimento reinvestido",
  income: "Rendimento recebido (caiu na conta)",
};
// Cores validadas (claro/escuro, daltonismo): valor turquesa, seu dinheiro roxo.
const VALUE = "#1a9aa6";
const MONEY = "#6d5fe0";
const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const pct = (r: number | null) => (r === null ? "—" : `${r >= 0 ? "+" : ""}${(r * 100).toFixed(1).replace(".", ",")}%`);
const qtyText = (q: number) => q.toLocaleString("pt-BR", { maximumFractionDigits: 6 });

function toInput(inv: Inv) {
  return { kind: inv.kind, movements: inv.movements, valuations: inv.valuations };
}

export function InvestmentsPanel({ investments, today }: { investments: InvestmentList; today: string }) {
  const active = investments.filter((i) => !i.archivedAt);
  const archived = investments.filter((i) => i.archivedAt);
  const currencies = CURRENCIES.filter((c) => active.some((i) => i.currency === c));
  const [currency, setCurrency] = useState<Currency>(currencies[0] ?? "BRL");
  const [edit, setEdit] = useState<{ inv: Inv | null } | null>(null);
  const [move, setMove] = useState<Inv | null>(null);
  const [value, setValue] = useState<Inv | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const list = active.filter((i) => i.currency === currency);
  const sums = list.map((i) => ({ inv: i, s: summarize(toInput(i), today) }));
  const fmt = (c: number) => formatMoney(c, currency);
  const total = {
    value: sums.reduce((a, x) => a + (x.s.currentValueCents ?? 0), 0),
    net: sums.reduce((a, x) => a + x.s.netContributedCents, 0),
    reinvested: sums.reduce((a, x) => a + x.s.reinvestedCents, 0),
    income: sums.reduce((a, x) => a + x.s.incomeReceivedCents, 0),
  };
  const withoutValue = sums.filter((x) => x.s.currentValueCents === null && x.s.netContributedCents > 0).length;
  const gain = total.value - total.net + total.income;
  const history = investments.find((i) => i.id === historyId) ?? null;

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Erro.");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Registro dos seus investimentos. O valor de hoje é você quem atualiza (sem cotação automática). Não altera o saldo das contas.</p>
        <div className="flex items-center gap-2">
          {currencies.length > 1 && (
            <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs">
              {currencies.map((c) => (
                <button key={c} type="button" onClick={() => setCurrency(c)} className={`rounded-md px-2 py-1 ${currency === c ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                  {CURRENCY_SYMBOL[c]}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setEdit({ inv: null })} className={`flex shrink-0 items-center gap-1.5 ${primaryBtn}`}>
            <Plus className="size-4" /> Novo investimento
          </button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {list.length === 0 ? (
        <EmptyState icon={TrendingUp} title="Nenhum investimento ainda" description="Cadastre CDBs, Tesouro, ações, FIIs ou previdência e registre aportes, rendimentos e o valor atual." />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Valor atual" value={fmt(total.value)} hint={withoutValue ? `${withoutValue} investimento(s) sem valor atualizado` : "pela última atualização de cada um"} />
            <Stat label="Seu dinheiro" value={fmt(total.net)} hint="aportes − resgates" />
            <Stat label="Rendimento reinvestido" value={fmt(total.reinvested)} hint={total.income ? `+ ${fmt(total.income)} recebido em dinheiro` : "voltou para os investimentos"} />
            <Stat label="Ganho total" value={formatMoney(gain, currency, { signed: true })} hint={total.net > 0 ? `${pct(gain / total.net)} sobre seu dinheiro` : "—"} tone={gain < 0 ? "danger" : gain > 0 ? "success" : undefined} />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-4 lg:col-span-2">
              <h2 className="font-medium">Evolução</h2>
              <p className="mb-3 text-xs text-muted-foreground">Valor no fim de cada mês × seu dinheiro acumulado (últimos 12 meses).</p>
              <EvolutionChart data={monthlyEvolution(list.map(toInput), today.slice(0, 7), 12)} fmt={fmt} />
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <h2 className="mb-3 font-medium">Distribuição</h2>
              <ul className="space-y-2 text-sm">
                {(Object.keys(KIND_LABEL) as InvestmentKind[]).map((k) => {
                  const v = sums.filter((x) => x.inv.kind === k).reduce((a, x) => a + (x.s.currentValueCents ?? 0), 0);
                  if (!v) return null;
                  const share = total.value ? v / total.value : 0;
                  return (
                    <li key={k}>
                      <div className="flex justify-between"><span>{KIND_LABEL[k]}</span><span className="tabular-nums text-muted-foreground">{Math.round(share * 100)}%</span></div>
                      <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${share * 100}%` }} /></div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          <ul className="grid gap-3 md:grid-cols-2">
            {sums.map(({ inv, s }) => (
              <li key={inv.id} className="relative rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorHex(inv.color) }} />
                      <span className="truncate">{inv.name}</span>
                      {inv.ticker && <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">{inv.ticker}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{[KIND_LABEL[inv.kind], inv.subtype, inv.institution].filter(Boolean).join(" · ")}</p>
                  </div>
                  <button type="button" aria-label={`Opções de ${inv.name}`} onClick={() => setMenu(menu === inv.id ? null : inv.id)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
                    <MoreHorizontal className="size-4" />
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Valor atual</p>
                    <p className="font-semibold tabular-nums">{s.currentValueCents === null ? "—" : fmt(s.currentValueCents)}</p>
                    <p className="text-[11px] text-muted-foreground">{s.lastValuationDate ? `atualizado em ${br(s.lastValuationDate)}` : "atualize o valor"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Ganho total</p>
                    <p className={`font-semibold tabular-nums ${s.totalGainCents !== null && s.totalGainCents < 0 ? "text-danger" : s.totalGainCents ? "text-success" : ""}`}>
                      {s.totalGainCents === null ? "—" : formatMoney(s.totalGainCents, currency, { signed: true })}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{pct(s.totalReturn)}</p>
                  </div>
                  <div className="col-span-2 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span>seu dinheiro {fmt(s.netContributedCents)}</span>
                    {s.reinvestedCents > 0 && <span>reinvestido {fmt(s.reinvestedCents)}</span>}
                    {s.incomeReceivedCents > 0 && <span>recebido {fmt(s.incomeReceivedCents)}</span>}
                    {s.quantity !== null && <span>{qtyText(s.quantity)} cotas{s.averagePriceCents ? ` · preço médio ${fmt(s.averagePriceCents)}` : ""}</span>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setMove(inv)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">+ Movimentação</button>
                  <button type="button" onClick={() => setValue(inv)} className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted"><RefreshCw className="size-3" /> Atualizar valor</button>
                  <button type="button" onClick={() => setHistoryId(inv.id)} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"><History className="size-3" /> Histórico</button>
                </div>
                {menu === inv.id && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
                    <ul className="absolute right-3 top-11 z-20 w-40 rounded-xl border border-border bg-card p-1 text-sm shadow-lg">
                      <li><button type="button" className="w-full rounded-lg px-3 py-1.5 text-left hover:bg-muted" onClick={() => { setMenu(null); setEdit({ inv }); }}>Editar</button></li>
                      <li><button type="button" className="w-full rounded-lg px-3 py-1.5 text-left hover:bg-muted" onClick={() => { setMenu(null); act(() => archiveInvestment({ id: inv.id, archived: true })); }}>Arquivar</button></li>
                      <li><button type="button" className="w-full rounded-lg px-3 py-1.5 text-left text-danger hover:bg-muted" onClick={() => { setMenu(null); if (window.confirm(`Excluir “${inv.name}” e todo o histórico?`)) act(() => deleteInvestment({ id: inv.id })); }}>Excluir</button></li>
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
          <summary className="cursor-pointer text-sm font-medium">Arquivados ({archived.length})</summary>
          <ul className="mt-2 divide-y divide-border text-sm">
            {archived.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2">
                {i.name}
                <button type="button" className={secondaryBtn} onClick={() => act(() => archiveInvestment({ id: i.id, archived: false }))}>Restaurar</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {edit && <InvestmentDialog key={edit.inv?.id ?? "new"} inv={edit.inv} onClose={() => setEdit(null)} />}
      {move && <MovementDialog inv={move} today={today} onClose={() => setMove(null)} />}
      {value && <ValueDialog inv={value} today={today} onClose={() => setValue(null)} />}
      {history && (
        <Modal title={`Histórico de “${history.name}”`} onClose={() => setHistoryId(null)} size="lg">
          <h3 className="mb-2 text-sm font-medium">Movimentações</h3>
          {history.movements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {[...history.movements].reverse().map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {br(m.date)} · {MOVE_LABEL[m.type]}
                    {m.quantity !== null && <span className="text-muted-foreground"> · {qtyText(m.quantity)} cotas</span>}
                    {m.notes && <span className="text-muted-foreground"> · {m.notes}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">{formatMoney(m.amountCents, history.currency)}</span>
                    <button type="button" className="rounded p-1 text-xs text-danger hover:bg-danger/10" onClick={() => window.confirm("Excluir esta movimentação?") && act(() => deleteInvestmentMovement({ id: m.id }))}>excluir</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <h3 className="mb-2 mt-5 text-sm font-medium">Atualizações de valor</h3>
          {history.valuations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {[...history.valuations].reverse().map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 py-2">
                  <span>{br(v.date)}</span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">
                      {v.priceCents !== null ? `cota a ${formatMoney(v.priceCents, history.currency)}` : formatMoney(v.valueCents ?? 0, history.currency)}
                    </span>
                    <button type="button" className="rounded p-1 text-xs text-danger hover:bg-danger/10" onClick={() => window.confirm("Excluir esta atualização?") && act(() => deleteInvestmentValue({ id: v.id }))}>excluir</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "success" | "danger" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : ""}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Duas linhas: valor (turquesa) e seu dinheiro acumulado (roxo). Passe o mouse para ver o mês. */
function EvolutionChart({ data, fmt }: { data: { month: string; valueCents: number | null; netContributedCents: number }[]; fmt: (c: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const W = 600;
  const H = 160;
  const P = { l: 8, r: 8, t: 8, b: 20 };
  const max = Math.max(1, ...data.flatMap((d) => [d.valueCents ?? 0, d.netContributedCents]));
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / Math.max(1, data.length - 1);
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b);
  const path = (vals: (number | null)[]) =>
    vals
      .map((v, i) => (v === null ? null : `${i === 0 || vals[i - 1] === null ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .join(" ");
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="relative">
      <div className="mb-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ backgroundColor: VALUE }} />Valor</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ backgroundColor: MONEY }} />Seu dinheiro</span>
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-40 w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = ref.current!.getBoundingClientRect();
          const rel = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(data.length - 1, Math.round(((rel - P.l) / (W - P.l - P.r)) * (data.length - 1)))));
        }}
        role="img"
        aria-label="Evolução do valor dos investimentos e do dinheiro aportado nos últimos 12 meses"
      >
        {[0, 0.5, 1].map((g) => (
          <line key={g} x1={P.l} x2={W - P.r} y1={y(max * g)} y2={y(max * g)} stroke="var(--border)" strokeWidth={1} />
        ))}
        <path d={path(data.map((d) => d.netContributedCents))} fill="none" stroke={MONEY} strokeWidth={2} />
        <path d={path(data.map((d) => d.valueCents))} fill="none" stroke={VALUE} strokeWidth={2} />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="var(--muted-foreground)" strokeDasharray="3 3" strokeWidth={1} />}
        {data.map((d, i) => (
          <g key={d.month}>
            {d.valueCents !== null && <circle cx={x(i)} cy={y(d.valueCents)} r={hover === i ? 4 : 2.5} fill={VALUE} stroke="var(--card)" strokeWidth={2} />}
            <circle cx={x(i)} cy={y(d.netContributedCents)} r={hover === i ? 4 : 2.5} fill={MONEY} stroke="var(--card)" strokeWidth={2} />
            {i % 2 === data.length % 2 && (
              <text x={x(i)} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
                {MONTH_SHORT[Number(d.month.slice(5, 7)) - 1]}
              </text>
            )}
          </g>
        ))}
      </svg>
      {h && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-md border border-border bg-card px-2 py-1 text-xs shadow-md">
          <p className="font-medium">{MONTH_SHORT[Number(h.month.slice(5, 7)) - 1]}/{h.month.slice(0, 4)}</p>
          <p>Valor: {h.valueCents === null ? "—" : fmt(h.valueCents)}</p>
          <p>Seu dinheiro: {fmt(h.netContributedCents)}</p>
        </div>
      )}
    </div>
  );
}

function InvestmentDialog({ inv, onClose }: { inv: Inv | null; onClose: () => void }) {
  const [name, setName] = useState(inv?.name ?? "");
  const [kind, setKind] = useState<InvestmentKind>(inv?.kind ?? "fixed_income");
  const [subtype, setSubtype] = useState(inv?.subtype ?? "");
  const [ticker, setTicker] = useState(inv?.ticker ?? "");
  const [institution, setInstitution] = useState(inv?.institution ?? "");
  const [currency, setCurrency] = useState<Currency>(inv?.currency ?? "BRL");
  const [color, setColor] = useState<EventColor>((inv?.color as EventColor) ?? "blue");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await saveInvestment({ id: inv?.id ?? null, input: { name, kind, subtype, ticker, institution, currency, color } });
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <Modal title={inv ? "Editar investimento" : "Novo investimento"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="iname" className={labelCls}>Nome</label>
          <input id="iname" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: CDB Banco X 110% CDI, Tesouro IPCA 2035, MXRF11" required maxLength={80} autoFocus />
        </div>
        <div>
          <p className={labelCls}>Tipo</p>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-xs">
            {(Object.keys(KIND_LABEL) as InvestmentKind[]).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-md px-2 py-1.5 ${kind === k ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {kind === "stock" ? "Acompanhado por cotas: você informa quantidade e preço da cota." : "Acompanhado por valor: você informa quanto tem."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="isub" className={labelCls}>Subtipo (opcional)</label>
            <input id="isub" className={inputCls} value={subtype} onChange={(e) => setSubtype(e.target.value)} placeholder={kind === "stock" ? "FII, ETF, Ação" : kind === "pension" ? "PGBL, VGBL" : "CDB, Tesouro, LCI"} maxLength={40} />
          </div>
          {kind === "stock" ? (
            <div>
              <label htmlFor="iticker" className={labelCls}>Código (opcional)</label>
              <input id="iticker" className={inputCls} value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="MXRF11" maxLength={20} />
            </div>
          ) : (
            <div>
              <label htmlFor="iinst" className={labelCls}>Instituição (opcional)</label>
              <input id="iinst" className={inputCls} value={institution} onChange={(e) => setInstitution(e.target.value)} maxLength={60} />
            </div>
          )}
        </div>
        {kind === "stock" && (
          <div>
            <label htmlFor="iinst2" className={labelCls}>Corretora (opcional)</label>
            <input id="iinst2" className={inputCls} value={institution} onChange={(e) => setInstitution(e.target.value)} maxLength={60} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="icur" className={labelCls}>Moeda</label>
            <select id="icur" className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{CURRENCY_SYMBOL[c]} ({c})</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>Cor</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(Object.keys(EVENT_COLORS) as EventColor[]).map((c) => (
                <button key={c} type="button" aria-label={EVENT_COLORS[c].label} aria-pressed={color === c} onClick={() => setColor(c)} className={`size-6 rounded-full ring-offset-2 ring-offset-[var(--card)] ${color === c ? "ring-2 ring-foreground" : ""}`} style={{ backgroundColor: EVENT_COLORS[c].hex }} />
              ))}
            </div>
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

function MovementDialog({ inv, today, onClose }: { inv: Inv; today: string; onClose: () => void }) {
  const [type, setType] = useState<MovementType>("contribution");
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const needsQty = inv.kind === "stock" && type !== "income";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await addInvestmentMovement({ investmentId: inv.id, type, date, amount, quantity: needsQty ? quantity : "", notes });
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  const help: Record<MovementType, string> = {
    contribution: "Dinheiro novo que você colocou.",
    withdrawal: inv.kind === "stock" ? "Venda de cotas: informe o valor recebido e quantas cotas vendeu." : "Dinheiro que você tirou.",
    reinvestment: inv.kind === "stock" ? "Dividendo/rendimento usado para comprar mais cotas." : "Juros/rendimento que ficou no investimento (não é dinheiro novo).",
    income: "Rendimento que caiu na sua conta e não foi reinvestido.",
  };

  return (
    <Modal title={`Movimentação em “${inv.name}”`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="mtype" className={labelCls}>Tipo</label>
          <select id="mtype" className={inputCls} value={type} onChange={(e) => setType(e.target.value as MovementType)}>
            {(Object.keys(MOVE_LABEL) as MovementType[]).map((t) => <option key={t} value={t}>{MOVE_LABEL[t]}</option>)}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">{help[type]}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mamount" className={labelCls}>Valor ({CURRENCY_SYMBOL[inv.currency]})</label>
            <input id="mamount" inputMode="decimal" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" required autoFocus />
          </div>
          <div>
            <label htmlFor="mdate" className={labelCls}>Data</label>
            <input id="mdate" type="date" className={inputCls} value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>
        {needsQty && (
          <div>
            <label htmlFor="mqty" className={labelCls}>Quantidade de cotas</label>
            <input id="mqty" inputMode="decimal" className={inputCls} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Ex.: 10" required />
          </div>
        )}
        <div>
          <label htmlFor="mnotes" className={labelCls}>Observação (opcional)</label>
          <input id="mnotes" className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
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

function ValueDialog({ inv, today, onClose }: { inv: Inv; today: string; onClose: () => void }) {
  const last = inv.valuations.at(-1);
  const isStock = inv.kind === "stock";
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState(last ? centsToInput((isStock ? last.priceCents : last.valueCents) ?? 0) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await setInvestmentValue({ investmentId: inv.id, date, amount });
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <Modal title={`Atualizar valor de “${inv.name}”`} onClose={onClose} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {isStock ? "Informe o preço de UMA cota hoje (o site multiplica pela quantidade que você tem)." : "Informe quanto o investimento vale hoje (olhe no app do banco/corretora)."}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="vamount" className={labelCls}>{isStock ? "Preço da cota" : "Valor atual"} ({CURRENCY_SYMBOL[inv.currency]})</label>
            <input id="vamount" inputMode="decimal" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" required autoFocus />
          </div>
          <div>
            <label htmlFor="vdate" className={labelCls}>Data</label>
            <input id="vdate" type="date" className={inputCls} value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
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
