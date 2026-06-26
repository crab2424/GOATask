import { useEffect, useRef, useState, type FormEvent } from "react";
import { parseCardsCsv, CsvParseError } from "../lib/parseCardsCsv";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listDecks,
  createDeck,
  updateDeck,
  deleteDeck,
  createCard,
  importCards,
  updateCard,
  deleteCard,
  answerCard,
  toggleCardMark,
  resetCardStats,
  type Deck,
  type Card,
} from "../api/decks";

type Screen = "decks" | "cards" | "setup" | "study" | "result";
type StudyOrder = "random" | "created";
type StudyDirection = "front" | "back";
type StudyResult = { card: Card; correct: boolean };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function accuracy(card: Card): string {
  const total = card.correct_count + card.wrong_count;
  if (total === 0) return "—";
  return `${Math.round((card.correct_count / total) * 100)}%`;
}

type CardFilters = {
  mark: "all" | "marked" | "unmarked";
  accMin: number;
  accMax: number;
  correctMin: number;
  correctMax: number | null;
  wrongMin: number;
  wrongMax: number | null;
};

const DEFAULT_FILTERS: CardFilters = {
  mark: "all",
  accMin: 0,
  accMax: 100,
  correctMin: 0,
  correctMax: null,
  wrongMin: 0,
  wrongMax: null,
};

const SETUP_STORAGE_KEY = "goatask:flashcard:setup";

type StudySetup = {
  filters: CardFilters;
  count: number | "all";
  order: StudyOrder;
  direction: StudyDirection;
};

const DEFAULT_SETUP: StudySetup = {
  filters: DEFAULT_FILTERS,
  count: "all",
  order: "random",
  direction: "front",
};

function loadSetup(): StudySetup {
  try {
    const raw = localStorage.getItem(SETUP_STORAGE_KEY);
    if (!raw) return DEFAULT_SETUP;
    const p = JSON.parse(raw);
    return {
      filters: { ...DEFAULT_FILTERS, ...(p.filters ?? {}) },
      count:
        p.count === "all" || typeof p.count === "number" ? p.count : "all",
      order: p.order === "created" ? "created" : "random",
      direction: p.direction === "back" ? "back" : "front",
    };
  } catch {
    return DEFAULT_SETUP;
  }
}

function saveSetup(s: StudySetup): void {
  try {
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore quota / disabled storage
  }
}

function applyCardFilters(cards: Card[], f: CardFilters): Card[] {
  return cards.filter((c) => {
    if (f.mark === "marked" && !c.marked) return false;
    if (f.mark === "unmarked" && c.marked) return false;
    const total = c.correct_count + c.wrong_count;
    const acc = total === 0 ? 0 : (c.correct_count / total) * 100;
    if (acc < f.accMin || acc > f.accMax) return false;
    if (c.correct_count < f.correctMin) return false;
    if (f.correctMax !== null && c.correct_count > f.correctMax) return false;
    if (c.wrong_count < f.wrongMin) return false;
    if (f.wrongMax !== null && c.wrong_count > f.wrongMax) return false;
    return true;
  });
}

function summarizeFilters(f: CardFilters): string {
  const parts: string[] = [];
  if (f.mark === "marked") parts.push("★のみ");
  else if (f.mark === "unmarked") parts.push("★なし");
  if (f.accMin !== 0 || f.accMax !== 100)
    parts.push(`正答率 ${f.accMin}-${f.accMax}%`);
  if (f.correctMin !== 0 || f.correctMax !== null) {
    if (f.correctMax === null) parts.push(`正解数 ≥${f.correctMin}`);
    else if (f.correctMin === 0) parts.push(`正解数 ≤${f.correctMax}`);
    else parts.push(`正解数 ${f.correctMin}-${f.correctMax}`);
  }
  if (f.wrongMin !== 0 || f.wrongMax !== null) {
    if (f.wrongMax === null) parts.push(`不正解数 ≥${f.wrongMin}`);
    else if (f.wrongMin === 0) parts.push(`不正解数 ≤${f.wrongMax}`);
    else parts.push(`不正解数 ${f.wrongMin}-${f.wrongMax}`);
  }
  return parts.length === 0 ? "全件" : parts.join(" ・ ");
}

function clampInt(v: string, min: number, max?: number): number {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return min;
  let r = Math.max(min, n);
  if (max !== undefined) r = Math.min(max, r);
  return r;
}

function CardFiltersPanel({
  filters,
  onChange,
  open,
  onToggleOpen,
  filteredCount,
  totalCount,
}: {
  filters: CardFilters;
  onChange: (f: CardFilters) => void;
  open: boolean;
  onToggleOpen: () => void;
  filteredCount: number;
  totalCount: number;
}) {
  const f = filters;
  const set = (patch: Partial<CardFilters>) => onChange({ ...f, ...patch });
  return (
    <div className="rounded border border-slate-200 bg-white">
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
      >
        <span className="text-slate-700">
          フィルタ:{" "}
          <span className="font-medium">{summarizeFilters(f)}</span>
          <span className="ml-2 text-xs text-slate-500">
            {filteredCount} / {totalCount} 件
          </span>
        </span>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-200 px-3 py-3 text-sm">
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600">★マーク</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "全て"],
                  ["marked", "★のみ"],
                  ["unmarked", "★なし"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => set({ mark: k })}
                  className={`rounded border px-2.5 py-1 text-xs ${f.mark === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600">
              正答率(%)
              <span className="ml-2 font-normal text-slate-400">
                ※未回答は0%扱い
              </span>
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                value={f.accMin}
                onChange={(e) =>
                  set({ accMin: clampInt(e.target.value, 0, 100) })
                }
                className="w-20 rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
              />
              <span className="text-slate-400">〜</span>
              <input
                type="number"
                min={0}
                max={100}
                value={f.accMax}
                onChange={(e) =>
                  set({ accMax: clampInt(e.target.value, 0, 100) })
                }
                className="w-20 rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600">正解数</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={f.correctMin}
                onChange={(e) =>
                  set({ correctMin: clampInt(e.target.value, 0) })
                }
                className="w-20 rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
              />
              <span className="text-slate-400">〜</span>
              <input
                type="number"
                min={0}
                value={f.correctMax ?? ""}
                placeholder="無制限"
                onChange={(e) => {
                  const v = e.target.value;
                  set({
                    correctMax: v === "" ? null : clampInt(v, 0),
                  });
                }}
                className="w-24 rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600">不正解数</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={f.wrongMin}
                onChange={(e) => set({ wrongMin: clampInt(e.target.value, 0) })}
                className="w-20 rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
              />
              <span className="text-slate-400">〜</span>
              <input
                type="number"
                min={0}
                value={f.wrongMax ?? ""}
                placeholder="無制限"
                onChange={(e) => {
                  const v = e.target.value;
                  set({
                    wrongMax: v === "" ? null : clampInt(v, 0),
                  });
                }}
                className="w-24 rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => onChange(DEFAULT_FILTERS)}
              className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
            >
              リセット
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function FlashcardView() {
  const queryClient = useQueryClient();
  const decksQuery = useQuery({ queryKey: ["decks"], queryFn: listDecks });
  const decks = decksQuery.data ?? [];
  const [screen, setScreen] = useState<Screen>("decks");
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newDeckName, setNewDeckName] = useState("");

  const [cardFront, setCardFront] = useState("");
  const [cardBack, setCardBack] = useState("");
  const [editingCard, setEditingCard] = useState<Card | null>(null);

  const [studyCards, setStudyCards] = useState<Card[]>([]);
  const [studyIndex, setStudyIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [studyResults, setStudyResults] = useState<StudyResult[]>([]);

  const [setupFilters, setSetupFilters] = useState<CardFilters>(
    () => loadSetup().filters,
  );
  const [setupFiltersOpen, setSetupFiltersOpen] = useState(false);
  const [setupCount, setSetupCount] = useState<number | "all">(
    () => loadSetup().count,
  );
  const [setupOrder, setSetupOrder] = useState<StudyOrder>(
    () => loadSetup().order,
  );
  const [setupDirection, setSetupDirection] = useState<StudyDirection>(
    () => loadSetup().direction,
  );
  const [studyDirection, setStudyDirection] = useState<StudyDirection>("front");

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const [cardFilters, setCardFilters] = useState<CardFilters>(DEFAULT_FILTERS);
  const [cardFiltersOpen, setCardFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | "all">(20);
  const [sortKey, setSortKey] = useState<
    | "created_asc"
    | "created_desc"
    | "accuracy_desc"
    | "accuracy_asc"
    | "front_asc"
    | "front_desc"
  >("created_asc");
  const [sortOpen, setSortOpen] = useState(false);

  const reloadDecks = async () => {
    await queryClient.invalidateQueries({ queryKey: ["decks"] });
    setError(null);
  };

  const reloadDeck = async (deckId: number) => {
    const fresh = await queryClient.fetchQuery({
      queryKey: ["decks"],
      queryFn: listDecks,
      staleTime: 0,
    });
    queryClient.setQueryData(["decks"], fresh);
    const d = fresh.find((d) => d.id === deckId);
    if (d) setSelectedDeck(d);
  };

  useEffect(() => {
    if (decksQuery.error) {
      setError(
        decksQuery.error instanceof Error
          ? decksQuery.error.message
          : String(decksQuery.error),
      );
    }
  }, [decksQuery.error]);

  const onCreateDeck = async (e: FormEvent) => {
    e.preventDefault();
    if (!newDeckName.trim()) return;
    try {
      await createDeck(newDeckName.trim());
      setNewDeckName("");
      await reloadDecks();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onRenameDeck = async (d: Deck) => {
    const name = prompt("新しいデッキ名", d.name);
    if (!name?.trim() || name.trim() === d.name) return;
    try {
      await updateDeck(d.id, name.trim());
      await reloadDecks();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onDeleteDeck = async (d: Deck) => {
    if (!confirm(`デッキ「${d.name}」を削除しますか？カードもすべて削除されます。`))
      return;
    try {
      await deleteDeck(d.id);
      if (selectedDeck?.id === d.id) {
        setSelectedDeck(null);
        setScreen("decks");
      }
      await reloadDecks();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const openDeck = (d: Deck) => {
    setSelectedDeck(d);
    setScreen("cards");
    setEditingCard(null);
    setCardFront("");
    setCardBack("");
  };

  const onAddCard = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedDeck || !cardFront.trim() || !cardBack.trim()) return;
    try {
      if (editingCard) {
        await updateCard(
          selectedDeck.id,
          editingCard.id,
          cardFront.trim(),
          cardBack.trim(),
        );
        setEditingCard(null);
      } else {
        await createCard(selectedDeck.id, cardFront.trim(), cardBack.trim());
      }
      setCardFront("");
      setCardBack("");
      await reloadDeck(selectedDeck.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const parsedImport = (() => {
    if (!importText.trim()) return { cards: [], error: null as string | null };
    try {
      return { cards: parseCardsCsv(importText), error: null };
    } catch (e) {
      if (e instanceof CsvParseError) return { cards: [], error: e.message };
      return { cards: [], error: e instanceof Error ? e.message : String(e) };
    }
  })();

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setImportText(text);
      setImportError(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  const onImportSubmit = async () => {
    if (!selectedDeck) return;
    if (parsedImport.error) {
      setImportError(parsedImport.error);
      return;
    }
    if (parsedImport.cards.length === 0) {
      setImportError("インポートするカードがありません");
      return;
    }
    setImporting(true);
    setImportError(null);
    try {
      await importCards(selectedDeck.id, parsedImport.cards);
      setImportText("");
      setImportOpen(false);
      await reloadDeck(selectedDeck.id);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  const startEditCard = (c: Card) => {
    setEditingCard(c);
    setCardFront(c.front);
    setCardBack(c.back);
  };

  const onDeleteCard = async (c: Card) => {
    if (!selectedDeck) return;
    if (!confirm("このカードを削除しますか？")) return;
    try {
      await deleteCard(selectedDeck.id, c.id);
      await reloadDeck(selectedDeck.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onToggleMark = async (c: Card) => {
    if (!selectedDeck) return;
    try {
      await toggleCardMark(selectedDeck.id, c.id, !c.marked);
      await reloadDeck(selectedDeck.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onResetStats = async (c: Card) => {
    if (!selectedDeck) return;
    try {
      await resetCardStats(selectedDeck.id, c.id);
      await reloadDeck(selectedDeck.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const openSetup = (markedOnly: boolean) => {
    if (!selectedDeck) return;
    const pool = selectedDeck.cards ?? [];
    const saved = loadSetup();
    const filters: CardFilters = markedOnly
      ? { ...saved.filters, mark: "marked" }
      : saved.filters;
    if (applyCardFilters(pool, filters).length === 0) return;
    setSetupFilters(filters);
    setSetupFiltersOpen(false);
    setSetupCount(saved.count);
    setSetupOrder(saved.order);
    setSetupDirection(saved.direction);
    setScreen("setup");
  };

  const resetSetup = () => {
    try {
      localStorage.removeItem(SETUP_STORAGE_KEY);
    } catch {
      // ignore
    }
    setSetupFilters(DEFAULT_SETUP.filters);
    setSetupFiltersOpen(false);
    setSetupCount(DEFAULT_SETUP.count);
    setSetupOrder(DEFAULT_SETUP.order);
    setSetupDirection(DEFAULT_SETUP.direction);
  };

  const beginStudy = (cards: Card[], direction: StudyDirection = studyDirection) => {
    setStudyDirection(direction);
    setStudyCards(cards);
    setStudyIndex(0);
    setShowBack(false);
    setStudyResults([]);
    setScreen("study");
  };

  const onStartFromSetup = () => {
    if (!selectedDeck) return;
    const pool = selectedDeck.cards ?? [];
    const filtered = applyCardFilters(pool, setupFilters);
    const ordered = setupOrder === "random" ? shuffle(filtered) : filtered;
    const limit =
      setupCount === "all" ? ordered.length : Math.min(setupCount, ordered.length);
    if (limit === 0) return;
    saveSetup({
      filters: setupFilters,
      count: setupCount,
      order: setupOrder,
      direction: setupDirection,
    });
    beginStudy(ordered.slice(0, limit), setupDirection);
  };

  const onRetryMistakes = () => {
    const mistakes = studyResults.filter((r) => !r.correct).map((r) => r.card);
    if (mistakes.length === 0) return;
    beginStudy(setupOrder === "random" ? shuffle(mistakes) : mistakes);
  };

  const onRetrySame = () => {
    beginStudy(setupOrder === "random" ? shuffle(studyCards) : studyCards);
  };

  const flushResults = (results: StudyResult[]) => {
    if (!selectedDeck || results.length === 0) return;
    const deckId = selectedDeck.id;
    Promise.allSettled(
      results.map((r) => answerCard(deckId, r.card.id, r.correct)),
    ).then((outcomes) => {
      const failed = outcomes.filter((o) => o.status === "rejected").length;
      if (failed > 0) {
        setError(`統計の保存に失敗しました（${failed}件）`);
      }
      reloadDeck(deckId).catch(() => {});
    });
  };

  const onToggleStudyMark = () => {
    if (!selectedDeck) return;
    const card = studyCards[studyIndex];
    if (!card) return;
    const nextMarked = !card.marked;
    setStudyCards((prev) =>
      prev.map((c, i) => (i === studyIndex ? { ...c, marked: nextMarked } : c)),
    );
    toggleCardMark(selectedDeck.id, card.id, nextMarked).catch((e) => {
      setError(e instanceof Error ? e.message : String(e));
      setStudyCards((prev) =>
        prev.map((c, i) =>
          i === studyIndex ? { ...c, marked: !nextMarked } : c,
        ),
      );
    });
  };

  const onAnswer = (correct: boolean) => {
    const card = studyCards[studyIndex];
    const next = [...studyResults, { card, correct }];
    setStudyResults(next);
    if (studyIndex + 1 >= studyCards.length) {
      flushResults(next);
      setScreen("result");
    } else {
      setStudyIndex(studyIndex + 1);
      setShowBack(false);
    }
  };

  const cards = selectedDeck?.cards ?? [];
  const markedCount = cards.filter((c) => c.marked).length;

  if (screen === "study") {
    const card = studyCards[studyIndex];
    const progress = ((studyIndex + (showBack ? 0.5 : 0)) / studyCards.length) * 100;
    return (
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => {
              if (!confirm("学習を中断しますか？ここまでの回答は記録されます。")) return;
              flushResults(studyResults);
              setScreen("cards");
            }}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            ← 中断
          </button>
          <span className="text-sm text-slate-500">
            {studyIndex + 1} / {studyCards.length}
          </span>
        </div>
        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full bg-slate-900 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="relative flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <button
            onClick={onToggleStudyMark}
            className={`absolute left-3 top-3 text-2xl ${card.marked ? "text-amber-500" : "text-slate-300"} hover:text-amber-500`}
            title={card.marked ? "マーク解除" : "マーク"}
            aria-label={card.marked ? "マーク解除" : "マーク"}
          >
            ★
          </button>
          <p className="mb-2 text-xs text-slate-400">
            {studyDirection === "front" ? "おもて" : "うら"}
          </p>
          <p className="mb-6 text-center text-2xl font-bold">
            {studyDirection === "front" ? card.front : card.back}
          </p>

          {showBack ? (
            <>
              <div className="mb-6 w-full border-t border-slate-200" />
              <p className="mb-2 text-xs text-slate-400">
                {studyDirection === "front" ? "うら" : "おもて"}
              </p>
              <p className="mb-8 text-center text-xl">
                {studyDirection === "front" ? card.back : card.front}
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => onAnswer(false)}
                  className="rounded-lg border border-rose-300 px-6 py-3 text-rose-700 hover:bg-rose-50"
                >
                  不正解
                </button>
                <button
                  onClick={() => onAnswer(true)}
                  className="rounded-lg bg-emerald-600 px-6 py-3 text-white hover:bg-emerald-700"
                >
                  正解
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setShowBack(true)}
              className="rounded-lg bg-slate-900 px-6 py-3 text-white hover:bg-slate-700"
            >
              答えを見る
            </button>
          )}
        </div>
      </div>
    );
  }

  if (screen === "result") {
    const total = studyResults.length;
    const correctCount = studyResults.filter((r) => r.correct).length;
    const wrongCount = total - correctCount;
    const rate = total === 0 ? 0 : Math.round((correctCount / total) * 100);
    const mistakes = studyResults.filter((r) => !r.correct);
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="mb-6 text-center text-2xl font-bold">学習完了</p>

          <div className="mb-6 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">出題</p>
              <p className="text-2xl font-bold">{total}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700">正解</p>
              <p className="text-2xl font-bold text-emerald-700">{correctCount}</p>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs text-rose-700">不正解</p>
              <p className="text-2xl font-bold text-rose-700">{wrongCount}</p>
            </div>
          </div>

          <div className="mb-6">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>正答率</span>
              <span>{rate}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${rate}%` }}
              />
            </div>
          </div>

          {mistakes.length > 0 && (
            <div className="mb-6">
              <p className="mb-2 text-sm font-semibold">間違えたカード</p>
              <ul className="space-y-1">
                {mistakes.map((r) => (
                  <li
                    key={r.card.id}
                    className="rounded border border-rose-100 bg-rose-50/50 px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{r.card.front}</span>
                    <span className="mx-2 text-slate-400">→</span>
                    <span className="text-slate-700">{r.card.back}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              onClick={() => setScreen("cards")}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              カード一覧に戻る
            </button>
            <button
              onClick={onRetrySame}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              もう一度
            </button>
            {mistakes.length > 0 && (
              <button
                onClick={onRetryMistakes}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
              >
                間違えたカードだけ再学習（{mistakes.length}枚）
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (screen === "setup" && selectedDeck) {
    const pool = selectedDeck.cards ?? [];
    const filtered = applyCardFilters(pool, setupFilters);
    const max = filtered.length;
    const presets = [5, 10, 20].filter((n) => n < max);
    return (
      <div className="mx-auto max-w-xl">
        <div className="mb-4">
          <button
            onClick={() => setScreen("cards")}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            ← カード一覧に戻る
          </button>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-bold">学習設定</h2>

          <div className="mb-4">
            <p className="mb-1 text-sm font-semibold">出題対象</p>
            <CardFiltersPanel
              filters={setupFilters}
              onChange={setSetupFilters}
              open={setupFiltersOpen}
              onToggleOpen={() => setSetupFiltersOpen((v) => !v)}
              filteredCount={max}
              totalCount={pool.length}
            />
          </div>

          <div className="mb-4">
            <p className="mb-1 text-sm font-semibold">問題数</p>
            <div className="mb-2 flex flex-wrap gap-2">
              {presets.map((n) => (
                <button
                  key={n}
                  onClick={() => setSetupCount(n)}
                  className={`rounded border px-3 py-1.5 text-sm ${setupCount === n ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
                >
                  {n}問
                </button>
              ))}
              <button
                onClick={() => setSetupCount("all")}
                className={`rounded border px-3 py-1.5 text-sm ${setupCount === "all" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
              >
                全件（{max}問）
              </button>
            </div>
            <input
              type="number"
              min={1}
              max={max}
              value={setupCount === "all" ? max : setupCount}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!Number.isFinite(v)) return;
                setSetupCount(Math.max(1, Math.min(max, v)));
              }}
              className="w-24 rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
            />
            <span className="ml-2 text-xs text-slate-500">最大 {max} 問</span>
          </div>

          <div className="mb-4">
            <p className="mb-1 text-sm font-semibold">順番</p>
            <div className="flex gap-2">
              <button
                onClick={() => setSetupOrder("random")}
                className={`rounded border px-3 py-1.5 text-sm ${setupOrder === "random" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
              >
                ランダム
              </button>
              <button
                onClick={() => setSetupOrder("created")}
                className={`rounded border px-3 py-1.5 text-sm ${setupOrder === "created" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
              >
                作成順
              </button>
            </div>
          </div>

          <div className="mb-6">
            <p className="mb-1 text-sm font-semibold">出題方向</p>
            <div className="flex gap-2">
              <button
                onClick={() => setSetupDirection("front")}
                className={`rounded border px-3 py-1.5 text-sm ${setupDirection === "front" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
              >
                おもて → うら
              </button>
              <button
                onClick={() => setSetupDirection("back")}
                className={`rounded border px-3 py-1.5 text-sm ${setupDirection === "back" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
              >
                うら → おもて
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => {
                if (!confirm("学習設定を初期値に戻しますか？")) return;
                resetSetup();
              }}
              className="text-xs text-slate-500 hover:text-slate-800"
              title="保存された学習設定を初期値に戻す"
            >
              設定をリセット
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setScreen("cards")}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                キャンセル
              </button>
              <button
                onClick={onStartFromSetup}
                disabled={max === 0}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:bg-slate-400"
              >
                開始
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "cards" && selectedDeck) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => setScreen("decks")}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            ← デッキ一覧
          </button>
          <div className="flex gap-2">
            {markedCount > 0 && (
              <button
                onClick={() => openSetup(true)}
                className="rounded border border-amber-300 px-3 py-1 text-sm text-amber-700 hover:bg-amber-50"
              >
                ★のみ学習（{markedCount}枚）
              </button>
            )}
            <button
              onClick={() => openSetup(false)}
              disabled={cards.length === 0}
              className="rounded bg-slate-900 px-3 py-1 text-sm text-white hover:bg-slate-700 disabled:bg-slate-400"
            >
              学習開始（{cards.length}枚）
            </button>
          </div>
        </div>

        <h1 className="mb-4 text-2xl font-bold">{selectedDeck.name}</h1>

        {error && (
          <div className="mb-4 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <form
          onSubmit={onAddCard}
          className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h2 className="mb-3 text-sm font-semibold">
            {editingCard ? "カードを編集" : "カードを追加"}
          </h2>
          <div className="mb-2 flex flex-col gap-2 sm:flex-row">
            <input
              value={cardFront}
              onChange={(e) => setCardFront(e.target.value)}
              placeholder="おもて（問題）"
              className="w-full flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
            <input
              value={cardBack}
              onChange={(e) => setCardBack(e.target.value)}
              placeholder="うら（答え）"
              className="w-full flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!cardFront.trim() || !cardBack.trim()}
              className="rounded bg-slate-900 px-4 py-1.5 text-sm text-white hover:bg-slate-700 disabled:bg-slate-400"
            >
              {editingCard ? "更新" : "追加"}
            </button>
            {editingCard && (
              <button
                type="button"
                onClick={() => {
                  setEditingCard(null);
                  setCardFront("");
                  setCardBack("");
                }}
                className="rounded border border-slate-300 px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
              >
                キャンセル
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setImportOpen((v) => !v);
                setImportError(null);
              }}
              className="ml-auto rounded border border-slate-300 px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              {importOpen ? "インポートを閉じる" : "CSVインポート"}
            </button>
          </div>
        </form>

        {importOpen && (
          <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold">CSVインポート</h2>
            <p className="mb-2 text-xs text-slate-600">
              1行1カード，カンマ区切りで「表,裏」の2列．上の行から古い順に登録されます．タブ区切りは使用不可．カンマや改行を値に含める場合は <code>"..."</code> で囲み，値内の <code>"</code> は <code>""</code> と書いてください．
            </p>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <input
                ref={importFileRef}
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                onChange={onImportFile}
                className="text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  setImportText("");
                  setImportError(null);
                }}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
              >
                クリア
              </button>
            </div>
            <textarea
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                setImportError(null);
              }}
              placeholder={'apple,りんご\nbook,本\n"hello, world","こんにちは"'}
              rows={6}
              className="mb-2 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm focus:border-slate-500 focus:outline-none"
            />
            {parsedImport.error ? (
              <div className="mb-2 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {parsedImport.error}
              </div>
            ) : importText.trim() ? (
              <div className="mb-2 text-xs text-slate-600">
                {parsedImport.cards.length}件のカードを認識
                {parsedImport.cards.length > 0 && (
                  <span className="ml-2 text-slate-500">
                    （先頭: {parsedImport.cards[0].front} / {parsedImport.cards[0].back}）
                  </span>
                )}
              </div>
            ) : null}
            {importError && (
              <div className="mb-2 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {importError}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onImportSubmit}
                disabled={
                  importing ||
                  !!parsedImport.error ||
                  parsedImport.cards.length === 0
                }
                className="rounded bg-slate-900 px-4 py-1.5 text-sm text-white hover:bg-slate-700 disabled:bg-slate-400"
              >
                {importing ? "インポート中…" : `${parsedImport.cards.length}件をインポート`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportOpen(false);
                  setImportText("");
                  setImportError(null);
                }}
                className="rounded border border-slate-300 px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {cards.length === 0 ? (
          <p className="text-sm text-slate-500">
            カードがまだありません。上のフォームから追加してください。
          </p>
        ) : (() => {
          const filteredCards = applyCardFilters(cards, cardFilters);
          const accRate = (c: Card) => {
            const total = c.correct_count + c.wrong_count;
            return total === 0 ? -1 : c.correct_count / total;
          };
          const sorted = [...filteredCards].sort((a, b) => {
            switch (sortKey) {
              case "created_asc":
                return a.id - b.id;
              case "created_desc":
                return b.id - a.id;
              case "accuracy_desc":
                return accRate(b) - accRate(a);
              case "accuracy_asc":
                return accRate(a) - accRate(b);
              case "front_asc":
                return a.front.localeCompare(b.front, "ja");
              case "front_desc":
                return b.front.localeCompare(a.front, "ja");
            }
          });
          const sortLabels: Record<typeof sortKey, string> = {
            created_asc: "作成順（古い→新しい）",
            created_desc: "作成順（新しい→古い）",
            accuracy_desc: "正答率（高い→低い）",
            accuracy_asc: "正答率（低い→高い）",
            front_asc: "おもて昇順（あ→ん）",
            front_desc: "おもて降順（ん→あ）",
          };
          const size = pageSize === "all" ? sorted.length || 1 : pageSize;
          const totalPages = Math.max(1, Math.ceil(sorted.length / size));
          const currentPage = Math.min(page, totalPages);
          const start = (currentPage - 1) * size;
          const pageCards = sorted.slice(start, start + size);
          return (
            <>
              <div className="mb-3">
                <CardFiltersPanel
                  filters={cardFilters}
                  onChange={(f) => {
                    setCardFilters(f);
                    setPage(1);
                  }}
                  open={cardFiltersOpen}
                  onToggleOpen={() => setCardFiltersOpen((v) => !v)}
                  filteredCount={filteredCards.length}
                  totalCount={cards.length}
                />
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-500">1ページ:</span>
                {([10, 20, 50, "all"] as const).map((n) => (
                  <button
                    key={String(n)}
                    onClick={() => {
                      setPageSize(n);
                      setPage(1);
                    }}
                    className={`rounded border px-2.5 py-1 text-xs ${pageSize === n ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
                  >
                    {n === "all" ? "全件" : `${n}件`}
                  </button>
                ))}
              </div>

              <div className="mb-3 rounded border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setSortOpen((v) => !v)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                >
                  <span className="text-slate-700">
                    並び替え: <span className="font-medium">{sortLabels[sortKey]}</span>
                  </span>
                  <span className="text-slate-400">{sortOpen ? "▲" : "▼"}</span>
                </button>
                {sortOpen && (
                  <div className="flex flex-wrap gap-2 border-t border-slate-200 px-3 py-2">
                    {(Object.entries(sortLabels) as [typeof sortKey, string][]).map(
                      ([k, label]) => (
                        <button
                          key={k}
                          onClick={() => {
                            setSortKey(k);
                            setSortOpen(false);
                            setPage(1);
                          }}
                          className={`rounded border px-2.5 py-1 text-xs ${sortKey === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
                        >
                          {label}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>

              {sorted.length === 0 ? (
                <p className="text-sm text-slate-500">該当するカードがありません。</p>
              ) : (
                <ul className="space-y-2">
                  {pageCards.map((c) => {
              const total = c.correct_count + c.wrong_count;
              return (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex flex-1 items-center gap-3">
                    <button
                      onClick={() => onToggleMark(c)}
                      className={`text-lg ${c.marked ? "text-amber-500" : "text-slate-300"} hover:text-amber-500`}
                      title={c.marked ? "マーク解除" : "マーク"}
                    >
                      ★
                    </button>
                    <div className="flex-1">
                      <span className="font-medium">{c.front}</span>
                      <span className="mx-2 text-slate-400">→</span>
                      <span className="text-slate-600">{c.back}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span title="正答率">正答率 {accuracy(c)}</span>
                      <span title="正解/不正解">
                        ○{c.correct_count} ×{c.wrong_count}
                      </span>
                      {total > 0 && (
                        <button
                          onClick={() => onResetStats(c)}
                          className="text-slate-400 hover:text-slate-700"
                          title="統計をリセット"
                        >
                          ↺
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="ml-3 flex gap-2">
                    <button
                      onClick={() => startEditCard(c)}
                      className="text-sm text-slate-600 hover:text-slate-900"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => onDeleteCard(c)}
                      className="text-sm text-rose-600 hover:text-rose-800"
                    >
                      削除
                    </button>
                  </div>
                </li>
              );
            })}
                </ul>
              )}

              {sorted.length > 0 && totalPages > 1 && (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
                  <button
                    onClick={() => setPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="rounded border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    前へ
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`min-w-[2rem] rounded border px-2 py-1 ${p === currentPage ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="rounded border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    次へ
                  </button>
                  <span className="ml-2 text-xs text-slate-500">
                    {start + 1}-{Math.min(start + size, sorted.length)} / {sorted.length}件
                  </span>
                </div>
              )}
            </>
          );
        })()}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold">単語帳</h1>

      {error && (
        <div className="mb-4 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <form
        onSubmit={onCreateDeck}
        className="mb-6 flex gap-2"
      >
        <input
          value={newDeckName}
          onChange={(e) => setNewDeckName(e.target.value)}
          placeholder="新しいデッキ名"
          className="flex-1 rounded border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!newDeckName.trim()}
          className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 disabled:bg-slate-400"
        >
          作成
        </button>
      </form>

      {decks.length === 0 ? (
        <p className="text-sm text-slate-500">
          デッキがまだありません。上のフォームから作成してください。
        </p>
      ) : (
        <ul className="space-y-2">
          {decks.map((d) => {
            const cardCount = d.cards?.length ?? 0;
            return (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <button
                  onClick={() => openDeck(d)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <span className="text-2xl">🃏</span>
                  <div>
                    <p className="font-medium">{d.name}</p>
                    <p className="text-xs text-slate-500">{cardCount}枚</p>
                  </div>
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => onRenameDeck(d)}
                    className="text-sm text-slate-600 hover:text-slate-900"
                  >
                    名前変更
                  </button>
                  <button
                    onClick={() => onDeleteDeck(d)}
                    className="text-sm text-rose-600 hover:text-rose-800"
                  >
                    削除
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
