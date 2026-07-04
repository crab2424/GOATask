export type Mode = "home" | "tasks" | "calendar" | "memos" | "flashcards" | "calculator" | "backup";

export interface NavigationItem {
  id: Mode;
  label: string;
  icon: string;
}

export const NAV_ITEMS: NavigationItem[] = [
  { id: "home", label: "ホーム", icon: "🏠" },
  { id: "tasks", label: "タスク", icon: "✓" },
  { id: "calendar", label: "カレンダー", icon: "▦" },
  { id: "memos", label: "メモ", icon: "📝" },
  { id: "flashcards", label: "単語帳", icon: "🃏" },
  { id: "calculator", label: "電卓", icon: "🧮" },
  { id: "backup", label: "バックアップ", icon: "💾" },
];

export const PRIMARY_MOBILE_ITEMS = NAV_ITEMS.slice(0, 4);
export const SECONDARY_MOBILE_ITEMS = NAV_ITEMS.slice(4);
