import { describe, expect, it } from "vitest";
import {
  dayStatus,
  goalSlots,
  habitStreak,
  overallRate,
  overallStreak,
  weekSummary,
  type GoalVersion,
  type HabitData,
} from "@/lib/habits/stats";

// Outubro/2026: dia 4 é domingo, 18 é domingo.
const TODAY = "2026-10-21"; // quarta

const everyDay: GoalVersion = { effectiveFrom: "2026-10-01", scheduleType: "days", weekdays: [0, 1, 2, 3, 4, 5, 6], timesPerWeek: null, target: null };

function habit(over: Partial<HabitData> = {}): HabitData {
  return {
    id: "h",
    name: "Ler",
    direction: "build",
    measure: "boolean",
    unit: null,
    category: "Estudos",
    color: "violet",
    createdOn: "2026-10-01",
    archived: false,
    versions: [everyDay],
    pauses: [],
    logs: {},
    ...over,
  };
}

const logsFor = (dates: string[], value = 1) => Object.fromEntries(dates.map((d) => [d, value]));

describe("status do dia", () => {
  it("sim/não: registrado = cumprido; dia passado sem registro = falhou; hoje = pendente", () => {
    const h = habit({ logs: logsFor(["2026-10-19"]) });
    expect(dayStatus(h, "2026-10-19", TODAY)).toBe("done");
    expect(dayStatus(h, "2026-10-20", TODAY)).toBe("missed");
    expect(dayStatus(h, TODAY, TODAY)).toBe("pending");
    expect(dayStatus(h, "2026-10-22", TODAY)).toBe("future");
    expect(dayStatus(h, "2026-09-30", TODAY)).toBe("na");
  });

  it("quantidade: abaixo da meta é parcial; atingir é cumprido", () => {
    const h = habit({
      measure: "quantity",
      unit: "páginas",
      versions: [{ ...everyDay, target: 30 }],
      logs: { "2026-10-19": 28, "2026-10-20": 30 },
    });
    expect(dayStatus(h, "2026-10-19", TODAY)).toBe("partial");
    expect(dayStatus(h, "2026-10-20", TODAY)).toBe("done");
  });

  it("dias fixos: dia não previsto é folga", () => {
    const h = habit({ versions: [{ ...everyDay, weekdays: [1, 3, 5] }] });
    expect(dayStatus(h, "2026-10-20", TODAY)).toBe("off"); // terça
    expect(dayStatus(h, "2026-10-19", TODAY)).toBe("missed"); // segunda
  });

  it("reduzir: dentro do limite cumpre, acima excede, sem registro é neutro", () => {
    const h = habit({
      direction: "reduce",
      measure: "quantity",
      unit: "cafés",
      versions: [{ ...everyDay, target: 2 }],
      logs: { "2026-10-18": 1, "2026-10-19": 3, "2026-10-20": 0 },
    });
    expect(dayStatus(h, "2026-10-18", TODAY)).toBe("done");
    expect(dayStatus(h, "2026-10-19", TODAY)).toBe("exceeded");
    expect(dayStatus(h, "2026-10-20", TODAY)).toBe("done"); // zero também está no limite
    expect(dayStatus(h, "2026-10-17", TODAY)).toBe("unregistered");
  });

  it("dias pausados ficam como pausados", () => {
    const h = habit({ pauses: [{ start: "2026-10-10", end: "2026-10-15" }] });
    expect(dayStatus(h, "2026-10-12", TODAY)).toBe("paused");
    expect(dayStatus(h, "2026-10-16", TODAY)).toBe("missed");
  });
});

describe("mudar a meta não reescreve o passado", () => {
  it("meta de 30 páginas até dia 15, depois 20", () => {
    const h = habit({
      measure: "quantity",
      versions: [
        { ...everyDay, target: 30 },
        { ...everyDay, effectiveFrom: "2026-10-15", target: 20 },
      ],
      logs: { "2026-10-14": 25, "2026-10-15": 25 },
    });
    expect(dayStatus(h, "2026-10-14", TODAY)).toBe("partial"); // valia 30
    expect(dayStatus(h, "2026-10-15", TODAY)).toBe("done"); // vale 20
  });

  it("trocar de dias fixos para 3x/semana preserva as semanas antigas", () => {
    const h = habit({
      versions: [
        { ...everyDay, weekdays: [1, 3, 5] },
        { effectiveFrom: "2026-10-18", scheduleType: "weekly", weekdays: [], timesPerWeek: 3, target: null },
      ],
      logs: logsFor(["2026-10-12", "2026-10-14", "2026-10-16"]), // seg/qua/sex da semana anterior
    });
    expect(goalSlots(h, "2026-10-11", "2026-10-17", TODAY)).toEqual({ due: 3, met: 3 });
    expect(dayStatus(h, "2026-10-19", TODAY)).toBe("open"); // agora é semanal: dia livre
  });
});

describe("X vezes por semana", () => {
  const weekly = (logs: string[]) =>
    habit({
      versions: [{ effectiveFrom: "2026-10-01", scheduleType: "weekly", weekdays: [], timesPerWeek: 3, target: null }],
      logs: logsFor(logs),
    });

  it("semana completa: conta meta cheia; semana atual não penaliza", () => {
    const h = weekly(["2026-10-05", "2026-10-07", "2026-10-19"]);
    // semana 4–10: 2 de 3
    expect(goalSlots(h, "2026-10-04", "2026-10-10", TODAY)).toEqual({ due: 3, met: 2 });
    // semana atual (18–24): 1 feita, ainda em andamento
    expect(goalSlots(h, "2026-10-18", TODAY, TODAY)).toEqual({ due: 1, met: 1 });
  });

  it("sequência em semanas", () => {
    const h = weekly([
      "2026-10-05", "2026-10-06", "2026-10-07", // semana 4–10 ok
      "2026-10-12", "2026-10-13", "2026-10-15", // semana 11–17 ok
      "2026-10-19", // semana atual em andamento
    ]);
    expect(habitStreak(h, TODAY)).toEqual({ current: 2, best: 2, unit: "semanas" });
    expect(weekSummary(h, "2026-10-18", TODAY)?.label).toBe("1/3 vezes");
  });
});

describe("sequências", () => {
  it("hoje pendente não quebra a sequência; um dia perdido quebra", () => {
    const h = habit({ logs: logsFor(["2026-10-05", "2026-10-06", "2026-10-18", "2026-10-19", "2026-10-20"]) });
    expect(habitStreak(h, TODAY)).toEqual({ current: 3, best: 3, unit: "dias" });
  });

  it("folgas e pausas não quebram a sequência", () => {
    const h = habit({
      versions: [{ ...everyDay, weekdays: [1, 2, 3, 4, 5] }], // dias úteis
      pauses: [{ start: "2026-10-12", end: "2026-10-14" }],
      logs: logsFor(["2026-10-08", "2026-10-09", "2026-10-15", "2026-10-16", "2026-10-19", "2026-10-20"]),
    });
    // 8, 9, (fim de semana), (pausa 12–14), 15, 16, (fim de semana), 19, 20, hoje pendente
    expect(habitStreak(h, TODAY).current).toBe(6);
  });

  it("reduzir: dia sem registro interrompe a sequência", () => {
    const h = habit({
      direction: "reduce",
      measure: "quantity",
      versions: [{ ...everyDay, target: 2 }],
      logs: { "2026-10-17": 1, "2026-10-19": 0, "2026-10-20": 2 },
    });
    expect(habitStreak(h, TODAY).current).toBe(2); // 18 sem registro interrompe
  });

  it("registro em dia de folga aparece como extra e não conta", () => {
    const h = habit({ versions: [{ ...everyDay, weekdays: [0, 6] }] }); // só fim de semana
    const withLogs = { ...h, logs: logsFor(["2026-10-12", "2026-10-13"]) }; // segunda e terça
    expect(dayStatus(withLogs, "2026-10-12", TODAY)).toBe("extra");
    expect(goalSlots(withLogs, "2026-10-12", "2026-10-13", TODAY)).toEqual({ due: 0, met: 0 });
  });

  it("melhor sequência geral considera só os hábitos que existiam em cada dia", () => {
    // "Antigo" existe desde 1/out e foi cumprido 5–14 (10 dias). Os outros dois só foram criados em 20/out.
    const antigo = habit({ id: "antigo", logs: logsFor(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-20"]) });
    const novo1 = habit({ id: "n1", createdOn: "2026-10-20", versions: [{ ...everyDay, effectiveFrom: "2026-10-20" }], logs: logsFor(["2026-10-20"]) });
    const novo2 = habit({ id: "n2", createdOn: "2026-10-20", versions: [{ ...everyDay, effectiveFrom: "2026-10-20" }], logs: logsFor(["2026-10-20"]) });
    const s = overallStreak([antigo, novo1, novo2], TODAY);
    expect(s.best).toBe(10);
    expect(s.current).toBe(1); // 15–19 o "antigo" falhou; 20 os três cumpriram; hoje pendente
  });

  it("sequência geral exige todas as metas do dia", () => {
    const a = habit({ id: "a", logs: logsFor(["2026-10-19", "2026-10-20"]) });
    const b = habit({ id: "b", logs: logsFor(["2026-10-20"]) });
    expect(overallStreak([a, b], TODAY).current).toBe(1);
  });
});

describe("consistência", () => {
  it("últimos 7 dias, ignorando hoje pendente", () => {
    const h = habit({ logs: logsFor(["2026-10-15", "2026-10-16", "2026-10-18"]) });
    // 15..20 = 6 dias devidos (hoje pendente não conta), 3 cumpridos
    expect(overallRate([h], 7, TODAY)).toBeCloseTo(0.5);
  });

  it("hábito arquivado não entra na consistência atual", () => {
    const a = habit({ logs: logsFor(["2026-10-20"]) });
    const b = habit({ id: "b", archived: true });
    expect(overallRate([a, b], 1 + 1, TODAY)).toBe(1); // 20 e hoje(pendente) → 1/1
  });
});
