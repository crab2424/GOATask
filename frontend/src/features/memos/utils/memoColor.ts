export interface PresetColor {
  value: string;
  label: string;
}

export const PRESET_COLORS: PresetColor[] = [
  { value: "#fca5a5", label: "赤" },
  { value: "#fdba74", label: "橙" },
  { value: "#fde047", label: "黄" },
  { value: "#86efac", label: "緑" },
  { value: "#93c5fd", label: "青" },
  { value: "#c4b5fd", label: "紫" },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidColor(c: string | null | undefined): c is string {
  return typeof c === "string" && HEX_RE.test(c);
}
