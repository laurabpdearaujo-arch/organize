import { localDate } from "@/lib/calendar/dto";
import { parseLocalDate, zonedInstant } from "@/lib/calendar/recurrence";
import { listOccurrences } from "@/lib/calendar/repository";
import { billsDue, studyToday, taskHighlights } from "@/lib/dashboard/today";
import { listBills } from "@/lib/finance/bills-repository";
import { listImports } from "@/lib/finance/import/repository";
import { listInvestments } from "@/lib/finance/investments-repository";
import { loadFinance } from "@/lib/finance/repository";
import { addDays } from "@/lib/habits/dates";
import { loadHabits } from "@/lib/habits/repository";
import { listReading } from "@/lib/reading/repository";
import { listPlans, plannedItems } from "@/lib/studies/repository";
import { listTasks } from "@/lib/tasks/repository";
import { getCurrentUser } from "./auth";

/*
 * Dados de cada página (o que antes o Next montava no servidor e passava para a tela).
 * GET /api/pages/:pagina?parametros → superjson. Tudo filtrado pela usuária logada.
 */

async function userAndToday() {
  const user = await getCurrentUser();
  return { user, today: localDate(new Date(), user.timezone) };
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const pageLoaders = {
  async painel() {
    const { user, today } = await userAndToday();
    const tz = user.timezone;
    const dayStart = zonedInstant(parseLocalDate(today), 0, 0, tz);
    const dayEnd = zonedInstant(parseLocalDate(addDays(today, 1)), 0, 0, tz);
    const [events, study, tasks, bills, reading] = await Promise.all([
      listOccurrences(user.id, dayStart, dayEnd),
      plannedItems(user.id, today, today),
      listTasks(user.id),
      listBills(user.id),
      listReading(user.id),
    ]);
    return {
      today,
      timezone: tz,
      events: events
        .filter((e) => e.start < dayEnd && e.end > dayStart)
        .map((e) => ({ key: e.key, title: e.title, color: e.color, location: e.location, allDay: e.allDay, start: e.start, end: e.end })),
      study: studyToday(study),
      highlights: taskHighlights(tasks.tasks, today),
      openToday: tasks.tasks.filter((t) => t.status !== "done" && t.dueDate === today).length,
      bills: billsDue(bills, today),
      books: reading.books.filter((b) => b.status === "reading"),
      progress: reading.progress,
    };
  },

  async calendario() {
    const user = await getCurrentUser();
    return { timezone: user.timezone };
  },

  async tarefas() {
    const { user, today } = await userAndToday();
    return { data: await listTasks(user.id), today };
  },

  async estudos() {
    const { user, today } = await userAndToday();
    return { plans: await listPlans(user.id), today };
  },

  async financas(query: URLSearchParams) {
    const { user, today } = await userAndToday();
    const requested = query.get("mes");
    const month = requested && MONTH_RE.test(requested) ? requested : today.slice(0, 7);
    const [data, imports, bills, investments] = await Promise.all([
      loadFinance(user.id, month),
      listImports(user.id),
      listBills(user.id),
      listInvestments(user.id),
    ]);
    return { data, imports, bills, investments, month, today };
  },

  async habitos() {
    const { user, today } = await userAndToday();
    return { habits: await loadHabits(user.id), today };
  },

  async leituras() {
    const { user, today } = await userAndToday();
    return { data: await listReading(user.id), today };
  },
};

export type PageName = keyof typeof pageLoaders;
export type PageData<P extends PageName> = Awaited<ReturnType<(typeof pageLoaders)[P]>>;
