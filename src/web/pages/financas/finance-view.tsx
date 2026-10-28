import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { FinanceData } from "@/lib/finance/repository";
import type { listImports } from "@/lib/finance/import/repository";
import type { BillList } from "@/lib/finance/bills-repository";
import type { InvestmentList } from "@/lib/finance/investments-repository";
import { CURRENCY_SYMBOL, type Currency } from "@/lib/finance/money";
import { addMonths, currenciesInUse } from "@/lib/finance/summary";
import { Overview } from "./overview";
import { TransactionsPanel } from "./transactions-panel";
import { BillsPanel } from "./bills-panel";
import { InvestmentsPanel } from "./investments-panel";
import { CategoriesPanel } from "./categories-panel";
import { GoalsPanel } from "./goals-panel";
import { ImportPanel } from "./import-panel";

export type ImportList = Awaited<ReturnType<typeof listImports>>;
export type FinanceTab = "visao" | "lancamentos" | "pagar" | "importar" | "investimentos" | "categorias" | "metas";

// A ordem aqui é a ordem das abas na tela.
const TAB_LABEL: Record<FinanceTab, string> = {
  visao: "Visão geral",
  importar: "Importar extrato",
  lancamentos: "Lançamentos",
  pagar: "Contas a pagar",
  investimentos: "Investimentos",
  metas: "Metas",
  categorias: "Categorias",
};

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
}

export function FinanceView({
  data,
  imports,
  bills,
  investments,
  month,
  today,
  initialTab,
  openNewTx = false,
}: {
  data: FinanceData;
  imports: ImportList;
  bills: BillList;
  investments: InvestmentList;
  month: string;
  today: string;
  initialTab: FinanceTab;
  /** "?novo=1" (ação rápida do Painel): abre o formulário de lançamento novo */
  openNewTx?: boolean;
}) {
  const [tab, setTabState] = useState<FinanceTab>(initialTab);
  const currencies = currenciesInUse(data.accounts.filter((a) => !a.archivedAt));
  const [currency, setCurrency] = useState<Currency>("BRL");
  const showMonth = tab === "visao" || tab === "lancamentos" || tab === "pagar";
  const currentMonth = today.slice(0, 7);

  function setTab(t: FinanceTab) {
    setTabState(t);
    // Mantém a aba no endereço (para F5/voltar) sem recarregar os dados
    const url = new URL(window.location.href);
    url.searchParams.set("aba", t);
    window.history.replaceState(null, "", url);
  }

  const monthHref = (m: string) => `/financas?mes=${m}&aba=${tab}`;
  const navigate = useNavigate();
  // Ir direto a um mês/ano (sem precisar clicar na seta várias vezes). As listas guardam a escolha
  // nelas mesmas e a navegação lê as duas: trocar o ano e logo depois o mês (antes de a página
  // carregar) usa o ano recém-escolhido. Quando o mês carrega, o `key` as recria com ele.
  const [year, mon] = month.split("-").map(Number);
  const thisYear = Number(currentMonth.slice(0, 4));
  const years = Array.from({ length: Math.max(thisYear + 1, year) - Math.min(thisYear - 5, year) + 1 }, (_, i) => Math.min(thisYear - 5, year) + i);
  const monthSel = useRef<HTMLSelectElement>(null);
  const yearSel = useRef<HTMLSelectElement>(null);
  const goToPicked = () => navigate(monthHref(`${yearSel.current!.value}-${monthSel.current!.value.padStart(2, "0")}`));

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
              <Link to={monthHref(addMonths(month, -1))} aria-label="Mês anterior" className="rounded-lg p-1.5 hover:bg-muted">
                <ChevronLeft className="size-4" />
              </Link>
              <select key={`m-${month}`} ref={monthSel} aria-label="Mês" defaultValue={mon} onChange={goToPicked} className="rounded-lg bg-transparent py-1 font-medium capitalize hover:bg-muted">
                {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
              </select>
              <select key={`y-${month}`} ref={yearSel} aria-label="Ano" defaultValue={year} onChange={goToPicked} className="rounded-lg bg-transparent py-1 font-medium hover:bg-muted">
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <Link to={monthHref(addMonths(month, 1))} aria-label="Próximo mês" className="rounded-lg p-1.5 hover:bg-muted">
                <ChevronRight className="size-4" />
              </Link>
              {month !== currentMonth && (
                <Link to={monthHref(currentMonth)} className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted">
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
      {tab === "lancamentos" && <TransactionsPanel data={data} month={month} today={today} openNew={openNewTx} />}
      {tab === "importar" && <ImportPanel data={data} imports={imports} onGoTo={setTab} />}
      {tab === "pagar" && <BillsPanel data={data} bills={bills} month={month} today={today} />}
      {tab === "investimentos" && <InvestmentsPanel investments={investments} today={today} />}
      {tab === "categorias" && <CategoriesPanel data={data} />}
      {tab === "metas" && <GoalsPanel data={data} today={today} />}
    </>
  );
}
