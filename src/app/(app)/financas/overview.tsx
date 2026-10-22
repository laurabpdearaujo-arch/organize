"use client";

import { useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Scale } from "lucide-react";
import { colorHex } from "@/lib/calendar/colors";
import type { FinanceData } from "@/lib/finance/repository";
import { formatMoney, type Currency } from "@/lib/finance/money";
import { addMonths, monthlySeries, monthTotals, pctChange, totalsByCategory } from "@/lib/finance/summary";
import type { FinanceTab } from "./finance-view";
import { AccountTiles } from "./accounts-panel";

// Cores validadas (claro e escuro, inclusive daltonismo): receitas azul, despesas rosa.
const INCOME = "#3b7de0";
const EXPENSE = "#d64f86";
const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const shortMonth = (m: string) => `${MONTH_SHORT[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

export function Overview({ data, month, currency, onGoTo }: { data: FinanceData; month: string; currency: Currency; onGoTo: (t: FinanceTab) => void }) {
  const accMap = new Map(data.accounts.map((a) => [a.id, a]));
  const cur = monthTotals(data.transactions, accMap, month, currency);
  const prev = monthTotals(data.transactions, accMap, addMonths(month, -1), currency);
  const byCat = totalsByCategory(data.transactions, accMap, month, currency, "expense");
  const series = monthlySeries(data.transactions, accMap, month, 6, currency);
  const catName = new Map(data.categories.map((c) => [c.id, c.name]));
  const fmt = (c: number) => formatMoney(c, currency);

  return (
    <div className="space-y-4">
      <AccountTiles data={data} currency={currency} />
      <section className="grid gap-3 sm:grid-cols-3">
        <Stat icon={ArrowUpRight} label="Receitas" value={fmt(cur.income)} change={pctChange(cur.income, prev.income)} goodWhenUp />
        <Stat icon={ArrowDownRight} label="Despesas" value={fmt(cur.expense)} change={pctChange(cur.expense, prev.expense)} />
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Resultado do mês</p>
            <Scale className="size-4 text-primary" />
          </div>
          <p className={`mt-2 text-2xl font-semibold ${cur.result < 0 ? "text-danger" : ""}`}>{formatMoney(cur.result, currency, { signed: true })}</p>
          <p className="mt-1 text-xs text-muted-foreground">{cur.result < 0 ? "Gastou mais do que recebeu" : "Receitas menos despesas"}</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-medium">Gastos por categoria</h2>
          <p className="mb-3 text-xs text-muted-foreground">Do maior para o menor, no mês.</p>
          {byCat.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma despesa neste mês.</p>
          ) : (
            <CategoryBars rows={byCat.map((r) => ({ label: r.categoryId ? (catName.get(r.categoryId) ?? "—") : "Sem categoria", value: r.total }))} total={cur.expense} fmt={fmt} />
          )}
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-medium">Receitas × despesas</h2>
          <p className="mb-3 text-xs text-muted-foreground">Últimos 6 meses.</p>
          <IncomeExpenseChart series={series} fmt={fmt} />
        </div>
      </section>

      <section>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Metas de longo prazo</h2>
            <button type="button" onClick={() => onGoTo("metas")} className="text-xs text-primary hover:underline">Ver todas</button>
          </div>
          {data.goals.filter((g) => !g.archivedAt && g.currency === currency).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma meta nesta moeda.</p>
          ) : (
            <ul className="grid gap-x-6 gap-y-3 md:grid-cols-2">
              {data.goals
                .filter((g) => !g.archivedAt && g.currency === currency)
                .slice(0, 4)
                .map((g) => {
                  const pct = Math.max(0, Math.min(1, g.savedCents / g.targetCents));
                  return (
                    <li key={g.id}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{g.name}</span>
                        <span className="text-muted-foreground">{Math.round(pct * 100)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div className="h-2 rounded-full" style={{ width: `${pct * 100}%`, backgroundColor: colorHex(g.color) }} />
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value, change, goodWhenUp }: { icon: typeof Scale; label: string; value: string; change: number | null; goodWhenUp?: boolean }) {
  const up = change !== null && change > 0;
  const good = change === null || change === 0 ? null : goodWhenUp ? up : !up;
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="size-4 text-primary" />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {change === null ? (
          "sem dados do mês anterior"
        ) : (
          <>
            <span className={good === null ? "" : good ? "text-success" : "text-danger"}>
              {up ? "↑" : change < 0 ? "↓" : "="} {Math.abs(Math.round(change * 100))}%
            </span>{" "}
            vs mês anterior
          </>
        )}
      </p>
    </div>
  );
}

type Tip = { x: number; y: number; text: string } | null;
function TipBox({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-pre rounded-md border border-border bg-card px-2 py-1 text-xs shadow-md" style={{ left: tip.x, top: tip.y - 6 }}>
      {tip.text}
    </div>
  );
}
function tipAt(host: HTMLElement | null, el: HTMLElement, text: string): Tip {
  if (!host) return null;
  const h = host.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - h.left + r.width / 2, y: r.top - h.top, text };
}

/** Barras horizontais, uma cor só (série única), ordenadas do maior para o menor. */
function CategoryBars({ rows, total, fmt }: { rows: { label: string; value: number }[]; total: number; fmt: (c: number) => string }) {
  const [tip, setTip] = useState<Tip>(null);
  const host = useRef<HTMLDivElement>(null);
  const max = rows[0]?.value ?? 1;
  return (
    <div ref={host} className="relative space-y-2" onMouseLeave={() => setTip(null)}>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(90px,140px)_1fr_auto] items-center gap-2 text-sm">
          <span className="truncate text-muted-foreground">{r.label}</span>
          <div className="h-3 rounded-r-[4px] bg-muted/60">
            <div
              className="h-3 rounded-r-[4px] bg-primary"
              style={{ width: `${(r.value / max) * 100}%` }}
              onMouseEnter={(e) => setTip(tipAt(host.current, e.currentTarget, `${r.label}: ${fmt(r.value)} (${Math.round((r.value / total) * 100)}% das despesas)`))}
            />
          </div>
          <span className="tabular-nums">{fmt(r.value)}</span>
        </div>
      ))}
      <TipBox tip={tip} />
    </div>
  );
}

/** Barras agrupadas por mês: receitas (azul) e despesas (rosa), com legenda. */
function IncomeExpenseChart({ series, fmt }: { series: { month: string; income: number; expense: number; result: number }[]; fmt: (c: number) => string }) {
  const [tip, setTip] = useState<Tip>(null);
  const host = useRef<HTMLDivElement>(null);
  const H = 140;
  const max = Math.max(1, ...series.flatMap((s) => [s.income, s.expense]));
  const compact = (c: number) => fmt(c).replace(/,\d{2}$/, "");

  return (
    <div ref={host} className="relative" onMouseLeave={() => setTip(null)}>
      <div className="mb-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ backgroundColor: INCOME }} />Receitas</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ backgroundColor: EXPENSE }} />Despesas</span>
      </div>
      <div className="flex gap-2">
        <div className="flex w-16 flex-col justify-between text-right text-[10px] text-muted-foreground" style={{ height: H }}>
          <span>{compact(max)}</span>
          <span>{compact(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative flex-1">
          {[0, 0.5, 1].map((g) => (
            <div key={g} className="absolute inset-x-0 border-t border-border/70" style={{ top: H * (1 - g) }} />
          ))}
          <div className="relative flex items-end gap-3" style={{ height: H }}>
            {series.map((s) => {
              const text = `${shortMonth(s.month)}\nReceitas: ${fmt(s.income)}\nDespesas: ${fmt(s.expense)}\nResultado: ${fmt(s.result)}`;
              return (
                <div
                  key={s.month}
                  className="flex h-full flex-1 items-end justify-center gap-[2px]"
                  onMouseEnter={(e) => setTip(tipAt(host.current, e.currentTarget, text))}
                  aria-label={text.replace(/\n/g, ", ")}
                >
                  <div className="w-full max-w-4 rounded-t-[4px]" style={{ height: (s.income / max) * H, backgroundColor: INCOME }} />
                  <div className="w-full max-w-4 rounded-t-[4px]" style={{ height: (s.expense / max) * H, backgroundColor: EXPENSE }} />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
            {series.map((s) => (
              <span key={s.month} className="flex-1 text-center">{shortMonth(s.month)}</span>
            ))}
          </div>
        </div>
      </div>
      <TipBox tip={tip} />
    </div>
  );
}
