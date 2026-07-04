export type FontSize = "s" | "m" | "l" | "xl";

export const FONT_SIZES: { value: FontSize; label: string; px: number }[] = [
  { value: "s", label: "S", px: 13 },
  { value: "m", label: "M", px: 15 },
  { value: "l", label: "L", px: 18 },
  { value: "xl", label: "XL", px: 22 },
];

export const DEFAULT_FONT_SIZE: FontSize = "m";

export function normalizeFontSize(raw: string | null | undefined): FontSize {
  if (raw === "s" || raw === "m" || raw === "l" || raw === "xl") return raw;
  return DEFAULT_FONT_SIZE;
}

export function fontSizePx(value: FontSize): number {
  return FONT_SIZES.find((f) => f.value === value)?.px ?? 15;
}
