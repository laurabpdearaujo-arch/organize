export type Currency = "BRL" | "USD" | "EUR" | "GBP";
export const CURRENCIES: Currency[] = ["BRL", "USD", "EUR", "GBP"];
export const CURRENCY_SYMBOL: Record<Currency, string> = { BRL: "R$", USD: "US$", EUR: "€", GBP: "£" };

/**
 * Converte o que a pessoa digitou em centavos inteiros. Aceita "1.234,56", "1234,56", "1234.56", "50".
 * Retorna null se não for um valor válido (>= 0).
 */
export function parseMoney(input: string): number | null {
  let s = input.trim().replace(/^(R\$|US\$|€|£)\s*/i, "").replace(/\s/g, "");
  if (!s || !/^[\d.,]+$/.test(s)) return null;

  if (s.includes(",")) {
    // vírgula = decimal (padrão brasileiro); pontos são separadores de milhar
    if (s.indexOf(",") !== s.lastIndexOf(",")) return null;
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(".")) {
    const parts = s.split(".");
    const last = parts.at(-1)!;
    // "1234.56" → decimal; "1.234" ou "1.234.567" → milhar
    s = parts.length === 2 && last.length <= 2 ? s : s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, dec = ""] = s.split(".");
  return Number(int) * 100 + Number(dec.padEnd(2, "0"));
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(cents: number, currency: Currency = "BRL", opts: { signed?: boolean } = {}) {
  const key = `${currency}-${opts.signed ? "s" : ""}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
      ...(opts.signed ? { signDisplay: "exceptZero" as const } : {}),
    });
    formatters.set(key, f);
  }
  return f.format(cents / 100);
}

/** Centavos → texto para editar num campo ("1234,56"). */
export function centsToInput(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}
