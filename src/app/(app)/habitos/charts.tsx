"use client";

import { useRef, useState } from "react";
import { addDays, weekStartOf } from "@/lib/habits/dates";
import { monthShort, percent, shortDate, WEEKDAY_SHORT } from "@/lib/habits/format";
import { dayScore, weeklyRates, type HabitData } from "@/lib/habits/stats";

/* Cor única (sequencial): o roxo do site, do claro ao escuro conforme a proporção de metas cumpridas. */
const LEVELS = [
  "color-mix(in srgb, var(--primary) 18%, var(--card))",
  "color-mix(in srgb, var(--primary) 40%, var(--card))",
  "color-mix(in srgb, var(--primary) 68%, var(--card))",
  "var(--primary)",
];
function levelColor(ratio: number | null) {
  if (ratio === null) return "var(--muted)";
  if (ratio === 0) return "color-mix(in srgb, var(--muted-foreground) 14%, var(--card))";
  if (ratio < 0.34) return LEVELS[0];
  if (ratio < 0.67) return LEVELS[1];
  if (ratio < 1) return LEVELS[2];
  return LEVELS[3];
}

type Tip = { x: number; y: number; text: string } | null;

/** Posição da dica: centralizada acima do elemento, relativa ao contêiner do gráfico. */
function tipAt(host: HTMLElement | null, el: HTMLElement, text: string): Tip {
  if (!host) return null;
  const h = host.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - h.left + r.width / 2, y: r.top - h.top, text };
}

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-xs shadow-md"
      style={{ left: tip.x, top: tip.y - 6 }}
    >
      {tip.text}
    </div>
  );
}

/** Mapa de calor das últimas `weeks` semanas (colunas = semanas, linhas = dom…sáb). */
export function Heatmap({ habits, today, weeks = 18 }: { habits: HabitData[]; today: string; weeks?: number }) {
  const [tip, setTip] = useState<Tip>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const first = addDays(weekStartOf(today), -7 * (weeks - 1));
  const columns = Array.from({ length: weeks }, (_, w) => addDays(first, w * 7));

  return (
    <div ref={hostRef} className="relative" onMouseLeave={() => setTip(null)}>
      <div className="overflow-x-auto">
      <div className="inline-flex gap-[3px] pt-4">
        <div className="mr-1 grid grid-rows-7 gap-[3px] text-[10px] text-muted-foreground">
          {WEEKDAY_SHORT.map((d, i) => (
            <span key={d} className="flex h-3 items-center">{i % 3 === 0 ? d : ""}</span>
          ))}
        </div>
        {columns.map((ws, w) => {
          const showMonth = w === 0 || monthShort(ws) !== monthShort(addDays(ws, -7));
          return (
            <div key={ws} className="relative grid grid-rows-7 gap-[3px]">
              {showMonth && <span className="absolute -top-4 left-0 text-[10px] text-muted-foreground">{monthShort(addDays(ws, 6))}</span>}
              {Array.from({ length: 7 }, (_, d) => {
                const date = addDays(ws, d);
                if (date > today) return <span key={date} className="size-3" />;
                const score = dayScore(habits, date, today);
                const ratio = score ? score.met / score.due : null;
                const text = score
                  ? `${shortDate(date)}: ${score.met} de ${score.due} metas (${percent(ratio)})`
                  : `${shortDate(date)}: nada previsto`;
                return (
                  <span
                    key={date}
                    aria-label={text}
                    className="size-3 rounded-[3px]"
                    style={{ backgroundColor: levelColor(ratio) }}
                    onMouseEnter={(e) => setTip(tipAt(hostRef.current, e.currentTarget, text))}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      </div>
      <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
        menos
        {[0, 0.2, 0.5, 0.8, 1].map((r) => (
          <span key={r} className="size-3 rounded-[3px]" style={{ backgroundColor: levelColor(r) }} />
        ))}
        mais
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

/** % de metas cumpridas por semana (uma série; a semana atual ainda está em andamento). */
export function WeeklyBars({ habits, today, weeks = 8 }: { habits: HabitData[]; today: string; weeks?: number }) {
  const [tip, setTip] = useState<Tip>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  // Não mostra semanas anteriores ao hábito mais antigo.
  const firstWeek = weekStartOf(habits.reduce((m, h) => (h.createdOn < m ? h.createdOn : m), today));
  const data = weeklyRates(habits, weeks, today).filter((w) => w.weekStart >= firstWeek);
  const H = 120;

  return (
    <div ref={hostRef} className="relative" onMouseLeave={() => setTip(null)}>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-right text-[10px] text-muted-foreground" style={{ height: H }}>
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>
        <div className="relative flex-1">
          {/* grade recessiva */}
          {[0, 0.5, 1].map((g) => (
            <div key={g} className="absolute inset-x-0 border-t border-border/70" style={{ top: H * (1 - g) }} />
          ))}
          <div className="relative flex items-end gap-1.5" style={{ height: H }}>
            {data.map((w, i) => {
              const current = i === data.length - 1;
              const h = w.rate === null ? 0 : Math.max(2, w.rate * H);
              const text =
                w.rate === null
                  ? `Semana de ${shortDate(w.weekStart)}: nada previsto`
                  : `Semana de ${shortDate(w.weekStart)}: ${percent(w.rate)} (${w.met} de ${w.due} metas)${current ? " · em andamento" : ""}`;
              return (
                <div
                  key={w.weekStart}
                  className="flex h-full flex-1 items-end justify-center"
                  aria-label={text}
                  onMouseEnter={(e) => setTip(tipAt(hostRef.current, e.currentTarget.firstElementChild as HTMLElement, text))}
                >
                  <div
                    className="w-full max-w-7 rounded-t-[4px]"
                    style={{
                      height: h,
                      backgroundColor: current ? "color-mix(in srgb, var(--primary) 45%, var(--card))" : "var(--primary)",
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-1.5 text-[10px] text-muted-foreground">
            {data.map((w) => (
              <span key={w.weekStart} className="flex-1 text-center">{shortDate(w.weekStart).replace(" ", "/")}</span>
            ))}
          </div>
        </div>
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}
