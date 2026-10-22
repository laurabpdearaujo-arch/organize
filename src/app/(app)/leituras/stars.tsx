"use client";

import { Star } from "lucide-react";

/** Nota de 1 a 5. Com onChange vira campo (clicar na mesma estrela apaga a nota). */
export function Stars({ value, onChange, size = "sm" }: { value: number | null; onChange?: (v: number | null) => void; size?: "sm" | "md" }) {
  const cls = size === "md" ? "size-5" : "size-3.5";
  if (!onChange) {
    if (!value) return null;
    return (
      <span className="inline-flex shrink-0 text-warning" aria-label={`Nota ${value} de 5`}>
        {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`${cls} ${n <= value ? "fill-current" : "opacity-30"}`} />)}
      </span>
    );
  }
  return (
    <span className="inline-flex gap-0.5" role="radiogroup" aria-label="Nota">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} de 5`}
          onClick={() => onChange(value === n ? null : n)}
          className="rounded p-0.5 text-warning hover:bg-muted"
        >
          <Star className={`${cls} ${value && n <= value ? "fill-current" : "opacity-40"}`} />
        </button>
      ))}
    </span>
  );
}

export const brDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
