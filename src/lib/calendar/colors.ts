export const EVENT_COLORS = {
  violet: { label: "Roxo", hex: "#6d5fe0" },
  blue: { label: "Azul", hex: "#3b7de0" },
  teal: { label: "Turquesa", hex: "#1a9aa6" },
  green: { label: "Verde", hex: "#2e9a5f" },
  amber: { label: "Laranja", hex: "#d68512" },
  rose: { label: "Rosa", hex: "#d64f86" },
  gray: { label: "Cinza", hex: "#7a7a88" },
} as const;

export type EventColor = keyof typeof EVENT_COLORS;
export const EVENT_COLOR_KEYS = Object.keys(EVENT_COLORS) as [EventColor, ...EventColor[]];

export function colorHex(color: string) {
  return (EVENT_COLORS as Record<string, { hex: string }>)[color]?.hex ?? EVENT_COLORS.violet.hex;
}
