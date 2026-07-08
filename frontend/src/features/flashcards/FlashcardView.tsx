import { useEffect, useRef, useState, type FormEvent } from "react";
import { parseCardsCsv, CsvParseError } from "./study/parseCardsCsv";
import { useDialogs } from "../../shared/components/DialogProvider";
import { CardFiltersPanel } from "./components/CardFiltersPanel";
import { StudyScreen } from "./screens/StudyScreen";
import { StudyResultScreen } from "./screens/StudyResultScreen";
import { StudySetupScreen } from "./screens/StudySetupScreen";
import {
  DEFAULT_FILTERS,
  DEFAULT_SETUP,
  applyCardFilters,
  cardAccuracy,
  clearSavedSetup,
  loadSetup,
  saveSetup,
  shuffle,
  type CardFilters,
  type Screen,
  type StudyDirection,
  type StudyOrder,
  type StudyResult,
} from "./study/model";
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
  deleteCardsBulk,
  answerCard,
  toggleCardMark,
  resetCardStats,
  type Deck,
  type Card,
} from "../../api/decks";

export function FlashcardView() {
  const queryClient = useQueryClient();
  const { confirmDialog, promptDialog } = useDialogs();
  const decksQuery = useQuery({ queryKey: ["decks"], queryFn: listDecks });
  const decks = decksQuery.data ?? [];
  const [screen, setScreen] = useState<Screen>("decks");
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newDeckName, setNewDeckName] = useState("");

  const [cardFront, setCardFront] = useState("");
  const [cardBack, setCardBack] = useState("");
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");

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
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    const name = await promptDialog({ title: "デッキ名を変更", defaultValue: d.name, confirmLabel: "変更" });
    if (!name?.trim() || name.trim() === d.name) return;
    try {
      await updateDeck(d.id, name.trim());
      await reloadDecks();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onDeleteDeck = async (d: Deck) => {
    if (!(await confirmDialog({ title: `デッキ「${d.name}」を削除しますか？`, message: "カードもすべて削除されます。", confirmLabel: "削除", danger: true })))
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
    setEditingCardId(null);
    setEditFront("");
    setEditBack("");
    setCardFront("");
    setCardBack("");
    setSelectedIds(new Set());
  };

  const onAddCard = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedDeck || !cardFront.trim() || !cardBack.trim()) return;
    try {
      await createCard(selectedDeck.id, cardFront.trim(), cardBack.trim());
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
    setEditingCardId(c.id);
    setEditFront(c.front);
    setEditBack(c.back);
  };

  const cancelEditCard = () => {
    setEditingCardId(null);
    setEditFront("");
    setEditBack("");
  };

  const saveEditCard = async (c: Card) => {
    if (!selectedDeck) return;
    if (!editFront.trim() || !editBack.trim()) return;
    try {
      await updateCard(
        selectedDeck.id,
        c.id,
        editFront.trim(),
        editBack.trim(),
      );
      cancelEditCard();
      await reloadDeck(selectedDeck.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onResetStatsFromEdit = async (c: Card) => {
    if (!selectedDeck) return;
    if (!(await confirmDialog({ title: "このカードの統計をリセットします", message: "正答率・不正解数の記録が消えます。", confirmLabel: "リセット", danger: true }))) return;
    try {
      await resetCardStats(selectedDeck.id, c.id);
      await reloadDeck(selectedDeck.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onDeleteCard = async (c: Card) => {
    if (!selectedDeck) return;
    if (!(await confirmDialog({ title: "このカードを削除しますか？", confirmLabel: "削除", danger: true }))) return;
    try {
      await deleteCard(selectedDeck.id, c.id);
      await reloadDeck(selectedDeck.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onBulkDelete = async (ids: number[]) => {
    if (!selectedDeck || ids.length === 0) return;
    if (
      !(await confirmDialog({
        title: `選択した ${ids.length} 枚のカードを削除します`,
        message: "元に戻せません。よろしいですか？",
        confirmLabel: "削除",
        danger: true,
      }))
    )
      return;
    setBulkDeleting(true);
    try {
      await deleteCardsBulk(selectedDeck.id, ids);
      setSelectedIds(new Set());
      if (editingCardId !== null && ids.includes(editingCardId)) {
        cancelEditCard();
      }
      await reloadDeck(selectedDeck.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBulkDeleting(false);
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
    clearSavedSetup();
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
    return (
      <StudyScreen
        card={studyCards[studyIndex]}
        index={studyIndex}
        total={studyCards.length}
        showBack={showBack}
        direction={studyDirection}
        onStop={async () => {
          if (!(await confirmDialog({ title: "学習を中断しますか？", message: "ここまでの回答は記録されます。", confirmLabel: "中断" }))) return;
          flushResults(studyResults);
          setScreen("cards");
        }}
        onToggleMark={onToggleStudyMark}
        onShowBack={() => setShowBack(true)}
        onAnswer={onAnswer}
      />
    );
  }

  if (screen === "result") {
    return (
      <StudyResultScreen
        results={studyResults}
        onBack={() => setScreen("cards")}
        onRetry={onRetrySame}
        onRetryMistakes={onRetryMistakes}
      />
    );
  }

  if (screen === "setup" && selectedDeck) {
    return (
      <StudySetupScreen
        cards={selectedDeck.cards ?? []}
        filters={setupFilters}
        filtersOpen={setupFiltersOpen}
        count={setupCount}
        order={setupOrder}
        direction={setupDirection}
        onFiltersChange={setSetupFilters}
        onToggleFilters={() => setSetupFiltersOpen((value) => !value)}
        onCountChange={setSetupCount}
        onOrderChange={setSetupOrder}
        onDirectionChange={setSetupDirection}
        onReset={async () => {
          if (await confirmDialog({ title: "学習設定を初期値に戻しますか？", confirmLabel: "戻す" })) resetSetup();
        }}
        onCancel={() => setScreen("cards")}
        onStart={onStartFromSetup}
      />
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
          <h2 className="mb-3 text-sm font-semibold">カードを追加</h2>
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
              追加
            </button>
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

              {(() => {
                const pageIds = pageCards.map((c) => c.id);
                const sortedIds = sorted.map((c) => c.id);
                const selectedOnPage = pageIds.filter((id) =>
                  selectedIds.has(id),
                ).length;
                const allPageSelected =
                  pageIds.length > 0 && selectedOnPage === pageIds.length;
                const someSelectedNotAll =
                  selectedIds.size > 0 && !allPageSelected;
                const allSortedSelected =
                  sortedIds.length > 0 &&
                  sortedIds.every((id) => selectedIds.has(id));
                return (
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                    <label className="flex items-center gap-2 text-slate-600">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelectedNotAll && !allPageSelected;
                        }}
                        onChange={(e) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) pageIds.forEach((id) => next.add(id));
                            else pageIds.forEach((id) => next.delete(id));
                            return next;
                          });
                        }}
                        disabled={pageIds.length === 0}
                        className="h-4 w-4 cursor-pointer accent-slate-900"
                      />
                      このページ全選択
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedIds(new Set(sortedIds))
                      }
                      disabled={
                        sortedIds.length === 0 || allSortedSelected
                      }
                      className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      全件選択（{sortedIds.length}枚）
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedIds(new Set())}
                      disabled={selectedIds.size === 0}
                      className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      選択解除
                    </button>
                    <span className="text-xs text-slate-500">
                      選択中 {selectedIds.size} 枚
                    </span>
                    {selectedIds.size > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          onBulkDelete(Array.from(selectedIds))
                        }
                        disabled={bulkDeleting}
                        className="ml-auto rounded bg-rose-600 px-3 py-1 text-xs text-white hover:bg-rose-700 disabled:bg-rose-300"
                      >
                        {bulkDeleting
                          ? "削除中…"
                          : `${selectedIds.size}枚を削除`}
                      </button>
                    )}
                  </div>
                );
              })()}

              {sorted.length === 0 ? (
                <p className="text-sm text-slate-500">該当するカードがありません。</p>
              ) : (
                <ul className="space-y-2">
                  {pageCards.map((c) => {
              const total = c.correct_count + c.wrong_count;
              const isEditing = editingCardId === c.id;
              const isSelected = selectedIds.has(c.id);
              if (isEditing) {
                return (
                  <li
                    key={c.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-slate-300 bg-slate-50 p-3 shadow-sm"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled
                      className="mt-2 h-4 w-4 cursor-not-allowed accent-slate-900 opacity-50"
                      title="編集中のカードは選択できません"
                    />
                    <div className="flex-1">
                      <div className="mb-2 flex flex-col gap-2 sm:flex-row">
                        <input
                          value={editFront}
                          onChange={(e) => setEditFront(e.target.value)}
                          placeholder="おもて（問題）"
                          className="w-full flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                        />
                        <input
                          value={editBack}
                          onChange={(e) => setEditBack(e.target.value)}
                          placeholder="うら（答え）"
                          className="w-full flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => saveEditCard(c)}
                          disabled={!editFront.trim() || !editBack.trim()}
                          className="rounded bg-slate-900 px-3 py-1 text-sm text-white hover:bg-slate-700 disabled:bg-slate-400"
                        >
                          保存
                        </button>
                        <button
                          onClick={cancelEditCard}
                          className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          キャンセル
                        </button>
                        {total > 0 && (
                          <button
                            onClick={() => onResetStatsFromEdit(c)}
                            className="ml-auto text-xs text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
                            title="このカードの統計をリセット"
                          >
                            ↺ 統計リセット
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-xs text-slate-500">
                      <button
                        onClick={() => onToggleMark(c)}
                        className={`text-lg ${c.marked ? "text-amber-500" : "text-slate-300"} hover:text-amber-500`}
                        title={c.marked ? "マーク解除" : "マーク"}
                      >
                        ★
                      </button>
                      <span title="正答率">正答率 {cardAccuracy(c)}</span>
                      <span title="正解/不正解">
                        ○{c.correct_count} ×{c.wrong_count}
                      </span>
                    </div>
                  </li>
                );
              }
              return (
                <li
                  key={c.id}
                  className={`flex items-center justify-between rounded-lg border bg-white p-3 shadow-sm ${isSelected ? "border-slate-900 ring-1 ring-slate-300" : "border-slate-200"}`}
                >
                  <div className="flex flex-1 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelected(c.id)}
                      className="h-4 w-4 cursor-pointer accent-slate-900"
                      aria-label="選択"
                    />
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
                      <span title="正答率">正答率 {cardAccuracy(c)}</span>
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
