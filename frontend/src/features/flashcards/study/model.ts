import type { Card } from "../../../api/decks";

export type Screen = "decks" | "cards" | "setup" | "study" | "result";
export type StudyOrder = "random" | "created";
export type StudyDirection = "front" | "back";
export type StudyResult = { card: Card; correct: boolean };

export type CardFilters = {
  mark: "all" | "marked" | "unmarked";
  accMin: number;
  accMax: number;
  correctMin: number;
  correctMax: number | null;
  wrongMin: number;
  wrongMax: number | null;
};

export const DEFAULT_FILTERS: CardFilters = {
  mark: "all",
  accMin: 0,
  accMax: 100,
  correctMin: 0,
  correctMax: null,
  wrongMin: 0,
  wrongMax: null,
};

export type StudySetup = {
  filters: CardFilters;
  count: number | "all";
  order: StudyOrder;
  direction: StudyDirection;
};

const SETUP_STORAGE_KEY = "goatask:flashcard:setup";

export const DEFAULT_SETUP: StudySetup = {
  filters: DEFAULT_FILTERS,
  count: "all",
  order: "random",
  direction: "front",
};

export function loadSetup(): StudySetup {
  try {
    const raw = localStorage.getItem(SETUP_STORAGE_KEY);
    if (!raw) return DEFAULT_SETUP;
    const parsed = JSON.parse(raw);
    return {
      filters: { ...DEFAULT_FILTERS, ...(parsed.filters ?? {}) },
      count:
        parsed.count === "all" || typeof parsed.count === "number"
          ? parsed.count
          : "all",
      order: parsed.order === "created" ? "created" : "random",
      direction: parsed.direction === "back" ? "back" : "front",
    };
  } catch {
    return DEFAULT_SETUP;
  }
}

export function saveSetup(setup: StudySetup): void {
  try {
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // Storage can be disabled or full; studying should still work.
  }
}

export function clearSavedSetup(): void {
  try {
    localStorage.removeItem(SETUP_STORAGE_KEY);
  } catch {
    // Storage can be disabled; local state is still reset by the caller.
  }
}

export function applyCardFilters(cards: Card[], filters: CardFilters): Card[] {
  return cards.filter((card) => {
    if (filters.mark === "marked" && !card.marked) return false;
    if (filters.mark === "unmarked" && card.marked) return false;
    const total = card.correct_count + card.wrong_count;
    const rate = total === 0 ? 0 : (card.correct_count / total) * 100;
    if (rate < filters.accMin || rate > filters.accMax) return false;
    if (card.correct_count < filters.correctMin) return false;
    if (filters.correctMax !== null && card.correct_count > filters.correctMax) return false;
    if (card.wrong_count < filters.wrongMin) return false;
    if (filters.wrongMax !== null && card.wrong_count > filters.wrongMax) return false;
    return true;
  });
}

export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function cardAccuracy(card: Card): string {
  const total = card.correct_count + card.wrong_count;
  return total === 0 ? "—" : `${Math.round((card.correct_count / total) * 100)}%`;
}

export function summarizeFilters(filters: CardFilters): string {
  const parts: string[] = [];
  if (filters.mark === "marked") parts.push("★のみ");
  else if (filters.mark === "unmarked") parts.push("★なし");
  if (filters.accMin !== 0 || filters.accMax !== 100)
    parts.push(`正答率 ${filters.accMin}-${filters.accMax}%`);
  if (filters.correctMin !== 0 || filters.correctMax !== null) {
    if (filters.correctMax === null) parts.push(`正解数 ≥${filters.correctMin}`);
    else if (filters.correctMin === 0) parts.push(`正解数 ≤${filters.correctMax}`);
    else parts.push(`正解数 ${filters.correctMin}-${filters.correctMax}`);
  }
  if (filters.wrongMin !== 0 || filters.wrongMax !== null) {
    if (filters.wrongMax === null) parts.push(`不正解数 ≥${filters.wrongMin}`);
    else if (filters.wrongMin === 0) parts.push(`不正解数 ≤${filters.wrongMax}`);
    else parts.push(`不正解数 ${filters.wrongMin}-${filters.wrongMax}`);
  }
  return parts.length === 0 ? "全件" : parts.join(" ・ ");
}
