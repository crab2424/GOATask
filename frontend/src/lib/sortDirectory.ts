export type SortMode =
  | "manual"
  | "name"
  | "updated"
  | "created"
  | "due";

export const MEMO_SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "manual", label: "手動順" },
  { value: "name", label: "名前順" },
  { value: "updated", label: "更新日時順" },
  { value: "created", label: "作成日時順" },
];

export const TASK_SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "manual", label: "手動順" },
  { value: "name", label: "名前順" },
  { value: "due", label: "期限順" },
  { value: "updated", label: "更新日時順" },
  { value: "created", label: "作成日時順" },
];

export function loadSortMode(key: string, fallback: SortMode): SortMode {
  try {
    const v = localStorage.getItem(key);
    if (!v) return fallback;
    return v as SortMode;
  } catch {
    return fallback;
  }
}

interface SortableItem {
  created_at: string;
  updated_at: string;
}

export function sortByMode<T extends SortableItem>(
  items: T[],
  mode: SortMode,
  getName: (item: T) => string,
  getDue?: (item: T) => string | null | undefined,
): T[] {
  const copy = items.slice();
  switch (mode) {
    case "name":
      return copy.sort((a, b) => getName(a).localeCompare(getName(b)));
    case "updated":
      return copy.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    case "created":
      return copy.sort((a, b) => a.created_at.localeCompare(b.created_at));
    case "due": {
      if (!getDue) return copy;
      return copy.sort((a, b) => {
        const ad = getDue(a) ?? "";
        const bd = getDue(b) ?? "";
        if (!ad && !bd) return 0;
        if (!ad) return 1;
        if (!bd) return -1;
        return ad.localeCompare(bd);
      });
    }
    default:
      return copy;
  }
}
