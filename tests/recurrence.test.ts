import { describe, expect, it } from "vitest";
import { expandSeries, type Recurrence, type Series, type SeriesException } from "@/lib/calendar/recurrence";
import { eventInputSchema, inputToSeriesValues, timingChanged } from "@/lib/calendar/schemas";

const SP = "America/Sao_Paulo"; // UTC-3, sem horário de verão

function series(overrides: Partial<Series> & { recurrence: Recurrence | null }): Series {
  return {
    id: "ev1",
    title: "Aula",
    description: null,
    location: null,
    color: "violet",
    allDay: false,
    // terça, 6/out/2026, 19:00–20:30 em São Paulo
    startsAt: new Date("2026-10-06T22:00:00Z"),
    endsAt: new Date("2026-10-06T23:30:00Z"),
    timezone: SP,
    ...overrides,
  };
}

const range = (a: string, b: string) => [new Date(a), new Date(b)] as const;
const starts = (occ: { start: Date }[]) => occ.map((o) => o.start.toISOString());

describe("evento sem repetição", () => {
  it("aparece só se estiver dentro do intervalo", () => {
    const s = series({ recurrence: null });
    expect(expandSeries(s, [], ...range("2026-10-01T00:00Z", "2026-10-31T00:00Z"))).toHaveLength(1);
    expect(expandSeries(s, [], ...range("2026-11-01T00:00Z", "2026-11-30T00:00Z"))).toHaveLength(0);
  });

  it("um evento que começou antes e termina dentro do intervalo aparece", () => {
    const s = series({ recurrence: null });
    expect(expandSeries(s, [], ...range("2026-10-06T23:00Z", "2026-10-07T00:00Z"))).toHaveLength(1);
  });
});

describe("repetição diária", () => {
  it("todo dia, mantendo 19:00 em São Paulo", () => {
    const occ = expandSeries(series({ recurrence: { freq: "daily", interval: 1 } }), [], ...range("2026-10-06T00:00Z", "2026-10-09T00:00Z"));
    expect(starts(occ)).toEqual(["2026-10-06T22:00:00.000Z", "2026-10-07T22:00:00.000Z", "2026-10-08T22:00:00.000Z"]);
    expect(occ.every((o) => o.end.getTime() - o.start.getTime() === 90 * 60_000)).toBe(true);
  });

  it("a cada 3 dias, com limite de 3 vezes", () => {
    const occ = expandSeries(series({ recurrence: { freq: "daily", interval: 3, count: 3 } }), [], ...range("2026-10-01T00:00Z", "2026-12-01T00:00Z"));
    expect(starts(occ)).toEqual(["2026-10-06T22:00:00.000Z", "2026-10-09T22:00:00.000Z", "2026-10-12T22:00:00.000Z"]);
  });

  it("termina na data 'até' (inclusive)", () => {
    const occ = expandSeries(series({ recurrence: { freq: "daily", interval: 1, until: "2026-10-08" } }), [], ...range("2026-10-01T00:00Z", "2026-12-01T00:00Z"));
    expect(occ).toHaveLength(3);
  });
});

describe("repetição semanal", () => {
  it("seg/qua/sex a partir de uma terça começa na quarta", () => {
    const occ = expandSeries(
      series({ recurrence: { freq: "weekly", interval: 1, byWeekday: [1, 3, 5] } }),
      [],
      ...range("2026-10-01T00:00Z", "2026-10-13T00:00Z"),
    );
    // qua 7, sex 9, seg 12 (19:00 SP = 22:00Z)
    expect(starts(occ)).toEqual(["2026-10-07T22:00:00.000Z", "2026-10-09T22:00:00.000Z", "2026-10-12T22:00:00.000Z"]);
  });

  it("a cada 2 semanas, mesmo dia da semana", () => {
    const occ = expandSeries(series({ recurrence: { freq: "weekly", interval: 2 } }), [], ...range("2026-10-01T00:00Z", "2026-11-05T00:00Z"));
    expect(starts(occ)).toEqual(["2026-10-06T22:00:00.000Z", "2026-10-20T22:00:00.000Z", "2026-11-03T22:00:00.000Z"]);
  });

  it("intervalo longe do início não perde ocorrências", () => {
    const occ = expandSeries(series({ recurrence: { freq: "weekly", interval: 1 } }), [], ...range("2027-03-01T00:00Z", "2027-03-08T00:00Z"));
    expect(starts(occ)).toEqual(["2027-03-02T22:00:00.000Z"]);
  });
});

describe("repetição mensal e anual", () => {
  it("dia 31 pula meses sem dia 31", () => {
    const s = series({
      startsAt: new Date("2027-01-31T13:00:00Z"), // 10:00 SP
      endsAt: new Date("2027-01-31T14:00:00Z"),
      recurrence: { freq: "monthly", interval: 1, count: 4 },
    });
    const occ = expandSeries(s, [], ...range("2027-01-01T00:00Z", "2028-01-01T00:00Z"));
    expect(occ.map((o) => o.start.toISOString().slice(0, 10))).toEqual(["2027-01-31", "2027-03-31", "2027-05-31", "2027-07-31"]);
  });

  it("aniversário em 29/fev só aparece em anos bissextos", () => {
    const s = series({
      allDay: true,
      startsAt: new Date("2028-02-29T03:00:00Z"), // 00:00 SP
      endsAt: new Date("2028-03-01T03:00:00Z"),
      recurrence: { freq: "yearly", interval: 1 },
    });
    const occ = expandSeries(s, [], ...range("2028-01-01T00:00Z", "2033-01-01T00:00Z"));
    expect(occ.map((o) => o.start.toISOString().slice(0, 10))).toEqual(["2028-02-29", "2032-02-29"]);
  });
});

describe("alterações em uma única ocorrência", () => {
  const weekly = series({ recurrence: { freq: "weekly", interval: 1 } });
  const window = range("2026-10-01T00:00Z", "2026-10-31T00:00Z");

  it("cancelar só uma ocorrência mantém as outras", () => {
    const ex: SeriesException = { eventId: "ev1", originalStart: new Date("2026-10-13T22:00:00Z"), cancelled: true };
    const occ = expandSeries(weekly, [ex], ...window);
    expect(starts(occ)).toEqual(["2026-10-06T22:00:00.000Z", "2026-10-20T22:00:00.000Z", "2026-10-27T22:00:00.000Z"]);
  });

  it("mover só uma ocorrência muda apenas ela", () => {
    const ex: SeriesException = {
      eventId: "ev1",
      originalStart: new Date("2026-10-13T22:00:00Z"),
      cancelled: false,
      title: "Aula (remarcada)",
      startsAt: new Date("2026-10-15T12:00:00Z"),
      endsAt: new Date("2026-10-15T13:00:00Z"),
    };
    const occ = expandSeries(weekly, [ex], ...window);
    expect(occ).toHaveLength(4);
    const moved = occ.find((o) => o.modified)!;
    expect(moved.title).toBe("Aula (remarcada)");
    expect(moved.start.toISOString()).toBe("2026-10-15T12:00:00.000Z");
    expect(occ.filter((o) => !o.modified).every((o) => o.title === "Aula")).toBe(true);
  });

  it("ocorrência movida para fora do intervalo não aparece", () => {
    const ex: SeriesException = {
      eventId: "ev1",
      originalStart: new Date("2026-10-27T22:00:00Z"),
      cancelled: false,
      startsAt: new Date("2026-11-03T12:00:00Z"),
      endsAt: new Date("2026-11-03T13:00:00Z"),
    };
    expect(expandSeries(weekly, [ex], ...window)).toHaveLength(3);
  });

  it("ocorrência só arrastada herda descrição e local da série", () => {
    const s = series({ description: "Levar caderno", location: "Sala 2", recurrence: { freq: "weekly", interval: 1 } });
    const ex: SeriesException = {
      eventId: "ev1",
      originalStart: new Date("2026-10-13T22:00:00Z"),
      cancelled: false,
      title: null,
      description: null,
      location: null,
      color: null,
      startsAt: new Date("2026-10-14T22:00:00Z"),
      endsAt: new Date("2026-10-14T23:30:00Z"),
    };
    const moved = expandSeries(s, [ex], ...window).find((o) => o.modified)!;
    expect(moved.title).toBe("Aula");
    expect(moved.description).toBe("Levar caderno");
    expect(moved.location).toBe("Sala 2");
  });

  it("descrição apagada só em uma ocorrência fica vazia só nela", () => {
    const s = series({ description: "Levar caderno", recurrence: { freq: "weekly", interval: 1 } });
    const ex: SeriesException = { eventId: "ev1", originalStart: new Date("2026-10-13T22:00:00Z"), cancelled: false, description: "" };
    const occ = expandSeries(s, [ex], ...window);
    expect(occ.find((o) => o.modified)!.description).toBeNull();
    expect(occ.filter((o) => !o.modified).every((o) => o.description === "Levar caderno")).toBe(true);
  });

  it("cancelada continua contando para o limite de N vezes", () => {
    const s = series({ recurrence: { freq: "weekly", interval: 1, count: 3 } });
    const ex: SeriesException = { eventId: "ev1", originalStart: new Date("2026-10-13T22:00:00Z"), cancelled: true };
    expect(expandSeries(s, [ex], ...window)).toHaveLength(2);
  });
});

describe("fuso horário", () => {
  it("mantém o horário de parede quando o fuso tem horário de verão", () => {
    // Nova York muda de horário em 1/nov/2026; o evento deve continuar às 9:00 locais.
    const s = series({
      timezone: "America/New_York",
      startsAt: new Date("2026-10-26T13:00:00Z"), // 9:00 EDT
      endsAt: new Date("2026-10-26T14:00:00Z"),
      recurrence: { freq: "weekly", interval: 1 },
    });
    const occ = expandSeries(s, [], ...range("2026-10-25T00:00Z", "2026-11-05T00:00Z"));
    expect(starts(occ)).toEqual(["2026-10-26T13:00:00.000Z", "2026-11-02T14:00:00.000Z"]);
  });
});

describe("formulário → banco", () => {
  const base = {
    title: "Consulta",
    color: "blue",
    allDay: false,
    startDate: "2026-10-20",
    startTime: "14:00",
    endDate: "2026-10-20",
    endTime: "15:00",
    recurrence: null,
  };

  it("converte horário de São Paulo para o instante correto", () => {
    const v = inputToSeriesValues(eventInputSchema.parse(base), SP);
    expect(v.startsAt.toISOString()).toBe("2026-10-20T17:00:00.000Z");
    expect(v.endsAt.toISOString()).toBe("2026-10-20T18:00:00.000Z");
    expect(v.description).toBeNull();
  });

  it("dia inteiro termina à meia-noite do dia seguinte", () => {
    const v = inputToSeriesValues(eventInputSchema.parse({ ...base, allDay: true, endDate: "2026-10-21" }), SP);
    expect(v.startsAt.toISOString()).toBe("2026-10-20T03:00:00.000Z");
    expect(v.endsAt.toISOString()).toBe("2026-10-22T03:00:00.000Z");
  });

  it("rejeita fim antes do início e título vazio", () => {
    expect(eventInputSchema.safeParse({ ...base, endTime: "13:00" }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...base, title: "   " }).success).toBe(false);
  });

  it("rejeita 'até data' junto com 'N vezes'", () => {
    const r = { freq: "daily", interval: 1, until: "2026-12-01", count: 5 };
    expect(eventInputSchema.safeParse({ ...base, recurrence: r }).success).toBe(false);
  });

  it("detecta mudança de horário/regra mas não de título", () => {
    const a = inputToSeriesValues(eventInputSchema.parse(base), SP);
    const b = inputToSeriesValues(eventInputSchema.parse({ ...base, title: "Outra" }), SP);
    const c = inputToSeriesValues(eventInputSchema.parse({ ...base, startTime: "14:30" }), SP);
    expect(timingChanged(a, b)).toBe(false);
    expect(timingChanged(a, c)).toBe(true);
  });
});
