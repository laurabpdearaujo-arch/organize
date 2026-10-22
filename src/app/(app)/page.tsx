import { Suspense } from "react";
import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  CalendarPlus,
  Flag,
  GraduationCap,
  ListTodo,
  Receipt,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth";
import { colorHex } from "@/lib/calendar/colors";
import { localDate, localTime } from "@/lib/calendar/dto";
import { parseLocalDate, zonedInstant } from "@/lib/calendar/recurrence";
import { listOccurrences } from "@/lib/calendar/repository";
import { billsDue, studyToday, taskHighlights } from "@/lib/dashboard/today";
import { listBills } from "@/lib/finance/bills-repository";
import { formatMoney } from "@/lib/finance/money";
import { addDays } from "@/lib/habits/dates";
import { listReading } from "@/lib/reading/repository";
import { daysLeft, pace, percent } from "@/lib/reading/stats";
import { plannedItems } from "@/lib/studies/repository";
import { STATUS_LABEL as STUDY_STATUS } from "@/lib/studies/progress";
import { listTasks } from "@/lib/tasks/repository";
import { dueLabel } from "@/lib/tasks/rules";
import { TaskDone } from "./painel-actions";

export default function PainelPage() {
  return (
    <>
      <PageHeader title="Painel" subtitle="Visão geral do dia" />
      <QuickActions />
      <Suspense fallback={<div className="h-[600px] animate-pulse rounded-2xl border border-border bg-card" />}>
        <Dashboard />
      </Suspense>
    </>
  );
}

const ACTIONS: { href: string; label: string; hint: string; icon: LucideIcon }[] = [
  { href: "/calendario?novo=1", label: "Novo evento", hint: "Compromisso na agenda", icon: CalendarPlus },
  { href: "/tarefas?nova=1", label: "Nova tarefa", hint: "To-do geral ou de carreira", icon: ListTodo },
  { href: "/estudos", label: "Registrar estudo", hint: "Tempo e questões", icon: GraduationCap },
  { href: "/financas?aba=lancamentos&novo=1", label: "Nova transação", hint: "Receita, despesa ou transferência", icon: Wallet },
  { href: "/habitos", label: "Registrar hábito", hint: "Marcar o dia de hoje", icon: Target },
];

function QuickActions() {
  return (
    <section aria-label="Ações rápidas" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {ACTIONS.map(({ href, label, hint, icon: Icon }) => (
        <Link key={href} href={href} className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition hover:border-primary/40 hover:bg-primary-soft/40">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Icon className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">{label}</span>
            <span className="block truncate text-xs text-muted-foreground">{hint}</span>
          </span>
        </Link>
      ))}
    </section>
  );
}

function Card({ icon: Icon, title, subtitle, href, linkLabel = "Ver tudo", children }: { icon: LucideIcon; title: string; subtitle?: string; href: string; linkLabel?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="mb-3 flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-medium leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <Link href={href} className="shrink-0 text-xs text-primary hover:underline">{linkLabel}</Link>
      </header>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="rounded-xl bg-muted/50 px-3 py-4 text-center text-sm text-muted-foreground">{children}</p>;

const brDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

async function Dashboard() {
  const user = await getCurrentUser();
  const tz = user.timezone;
  const today = localDate(new Date(), tz);
  const dayStart = zonedInstant(parseLocalDate(today), 0, 0, tz);
  const dayEnd = zonedInstant(parseLocalDate(addDays(today, 1)), 0, 0, tz);

  const [events, study, tasks, bills, reading] = await Promise.all([
    listOccurrences(user.id, dayStart, dayEnd),
    plannedItems(user.id, today, today),
    listTasks(user.id),
    listBills(user.id),
    listReading(user.id),
  ]);

  const todayEvents = events.filter((e) => e.start < dayEnd && e.end > dayStart);
  const st = studyToday(study);
  const highlights = taskHighlights(tasks.tasks, today);
  const openToday = tasks.tasks.filter((t) => t.status !== "done" && t.dueDate === today).length;
  const due = billsDue(bills, today);
  const books = reading.books.filter((b) => b.status === "reading");


  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid content-start gap-4 lg:col-span-2">
        <Card icon={CalendarDays} title="Compromissos de hoje" subtitle={`${todayEvents.length} na agenda`} href="/calendario" linkLabel="Abrir calendário">
          {todayEvents.length === 0 ? (
            <Empty>Agenda livre hoje.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {todayEvents.map((e) => (
                <li key={e.key} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{e.allDay ? "Dia inteiro" : `${localTime(e.start, tz)}–${localTime(e.end, tz)}`}</span>
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colorHex(e.color) }} />
                  <span className="min-w-0 flex-1 truncate">{e.title}</span>
                  {e.location && <span className="hidden truncate text-xs text-muted-foreground sm:block">{e.location}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card icon={ListTodo} title="Tarefas que pedem atenção" subtitle={`${openToday} para hoje`} href="/tarefas">
          {highlights.list.length === 0 ? (
            <Empty>Nada atrasado, nada para hoje e nenhum prazo fatal nas próximas 2 semanas.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {highlights.list.map((t) => {
                const d = dueLabel(t.dueDate!, today);
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <TaskDone id={t.id} title={t.title} />
                    <Link href={`/tarefas?aba=${t.area === "career" ? "carreira" : "geral"}`} className="min-w-0 flex-1 truncate hover:underline">
                      {t.title}
                    </Link>
                    {t.hardDeadline && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-medium text-danger ring-1 ring-danger/30">
                        <Flag className="size-3" /> Prazo fatal
                      </span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${d.tone === "overdue" ? "bg-danger/10 text-danger" : d.tone === "today" ? "bg-warning/15 text-warning" : "bg-muted"}`}>{d.text}</span>
                  </li>
                );
              })}
              {highlights.more > 0 && <li className="pt-2 text-xs text-muted-foreground">e mais {highlights.more}…</li>}
            </ul>
          )}
        </Card>

        <Card icon={GraduationCap} title="Estudos de hoje" subtitle={`${st.done} de ${st.list.length} concluído(s)${st.minutes ? ` · ${st.minutes} min planejados` : ""}`} href="/estudos">
          {st.list.length > 0 && (
            <div className="mb-3 h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${(st.done / st.list.length) * 100}%` }} />
            </div>
          )}
          {st.list.length === 0 ? (
            <Empty>Nenhum conteúdo agendado para hoje. Em Estudos, use “Agendar” num conteúdo.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {st.list.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-12 shrink-0 tabular-nums text-muted-foreground">{s.plannedTime ?? "—"}</span>
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colorHex(s.planColor) }} />
                  <Link href={`/estudos?plano=${s.planId}`} className={`min-w-0 flex-1 truncate hover:underline ${s.status === "done" ? "text-muted-foreground line-through" : ""}`}>
                    {s.code && /^\d/.test(s.code) ? `${s.code} ` : ""}
                    {s.title}
                    <span className="ml-1 text-xs text-muted-foreground no-underline">({s.planName})</span>
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">{STUDY_STATUS[s.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid content-start gap-4">
        <Card icon={Receipt} title="Contas a vencer" subtitle="Próximos 7 dias" href="/financas?aba=pagar">
          {due.length === 0 ? (
            <Empty>Nenhuma conta para os próximos dias.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {due.map(({ bill, date, overdue }) => (
                <li key={`${bill.id}-${date}`} className="flex items-center gap-2 py-2 text-sm">
                  <span className={`w-12 shrink-0 tabular-nums ${overdue ? "text-danger" : "text-muted-foreground"}`}>{brDay(date)}</span>
                  <span className="min-w-0 flex-1 truncate">{bill.name}</span>
                  {overdue && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] text-danger">Atrasada</span>}
                  {bill.amountCents ? <span className="shrink-0 tabular-nums text-muted-foreground">{formatMoney(bill.amountCents)}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card icon={BookOpen} title="Lendo agora" subtitle={`${books.length} livro(s)`} href="/leituras">
          {books.length === 0 ? (
            <Empty>Nenhum livro em andamento.</Empty>
          ) : (
            <ul className="grid gap-3">
              {books.map((b) => {
                const left = daysLeft(b, pace(reading.progress.filter((p) => p.bookId === b.id), today));
                return (
                  <li key={b.id} className="text-sm">
                    <p className="truncate">{b.title}</p>
                    <div className="my-1 h-1.5 rounded-full bg-muted">
                      <div className="h-1.5 rounded-full bg-primary" style={{ width: `${percent(b) * 100}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {b.totalPages ? `Pág. ${b.currentPage} de ${b.totalPages}` : `Pág. ${b.currentPage}`}
                      {left ? ` · faltam ~${left} dia${left === 1 ? "" : "s"}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
