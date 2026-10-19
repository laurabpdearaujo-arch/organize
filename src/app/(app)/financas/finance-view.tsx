"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { FinanceData } from "@/lib/finance/repository";
import { CURRENCY_SYMBOL, type Currency } from "@/lib/finance/money";
import { addMonths, currenciesInUse } from "@/lib/finance/summary";
import { Overview } from "./overview";
import { TransactionsPanel } from "./transactions-panel";
import { AccountsPanel } from "./accounts-panel";
import { CategoriesPanel } from "./categories-panel";
import { GoalsPanel } from "./goals-panel";

export type FinanceTab = "visao" | "lancamentos" | "contas" | "categorias" | "metas";

const TAB_LABEL: Record<FinanceTab, string> = {
  visao: "Visão geral",
  lancamentos: "Lançamentos",
  contas: "Contas e cartões",
  categorias: "Categorias",
  metas: "Metas",
};

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
}

export function FinanceView({ data, month, today, initialTab }: { data: FinanceData; month: string; today: string; initialTab: FinanceTab }) {
  const [tab, setTabState] = useState<FinanceTab>(initialTab);
  const currencies = currenciesInUse(data.accounts.filter((a) => !a.archivedAt));
  const [currency, setCurrency] = useState<Currency>("BRL");
  const showMonth = tab === "visao" || tab === "lancamentos";
  const currentMonth = today.slice(0, 7);

  function setTab(t: FinanceTab) {
    setTabState(t);
    // Mantém a aba no endereço (para F5/voltar) sem recarregar os dados
    const url = new URL(window.location.href);
    url.searchParams.set("aba", t);
    window.history.replaceState(null, "", url);
  }

  const monthHref = (m: string) => `/financas?mes=${m}&aba=${tab}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1 text-sm" aria-label="Seções de finanças">
          {(Object.keys(TAB_LABEL) as FinanceTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-current={tab === t ? "page" : undefined}
              className={`shrink-0 rounded-lg px-3 py-1.5 ${tab === t ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {showMonth && (
            <div className="flex items-center gap-1 text-sm">
              <Link href={monthHref(addMonths(month, -1))} aria-label="Mês anterior" className="rounded-lg p-1.5 hover:bg-muted">
                <ChevronLeft className="size-4" />
              </Link>
              <span className="min-w-36 text-center font-medium capitalize">{monthLabel(month)}</span>
              <Link href={monthHref(addMonths(month, 1))} aria-label="Próximo mês" className="rounded-lg p-1.5 hover:bg-muted">
                <ChevronRight className="size-4" />
              </Link>
              {month !== currentMonth && (
                <Link href={monthHref(currentMonth)} className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted">
                  Hoje
                </Link>
              )}
            </div>
          )}
          {tab === "visao" && currencies.length > 1 && (
            <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs">
              {currencies.map((c) => (
                <button key={c} type="button" onClick={() => setCurrency(c)} className={`rounded-md px-2 py-1 ${currency === c ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                  {CURRENCY_SYMBOL[c]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {tab === "visao" && <Overview data={data} month={month} currency={currency} onGoTo={setTab} />}
      {tab === "lancamentos" && <TransactionsPanel data={data} month={month} today={today} />}
      {tab === "contas" && <AccountsPanel data={data} />}
      {tab === "categorias" && <CategoriesPanel data={data} />}
      {tab === "metas" && <GoalsPanel data={data} today={today} />}
    </>
  );
}
