import { useEffect, useState, type FormEvent } from "react";
import {
  listDecks,
  createDeck,
  updateDeck,
  deleteDeck,
  createCard,
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

export function FlashcardView() {
  const [decks, setDecks] = useState<Deck[]>([]);
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

  const [setupMarkedOnly, setSetupMarkedOnly] = useState(false);
  const [setupCount, setSetupCount] = useState<number | "all">("all");
  const [setupOrder, setSetupOrder] = useState<StudyOrder>("random");

  const reloadDecks = async () => {
    try {
      setDecks(await listDecks());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const reloadDeck = async (deckId: number) => {
    const fresh = await listDecks();
    setDecks(fresh);
    const d = fresh.find((d) => d.id === deckId);
    if (d) setSelectedDeck(d);
  };

  useEffect(() => {
    reloadDecks();
  }, []);

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
    const filtered = markedOnly ? pool.filter((c) => c.marked) : pool;
    if (filtered.length === 0) return;
    setSetupMarkedOnly(markedOnly);
    setSetupCount("all");
    setSetupOrder("random");
    setScreen("setup");
  };

  const beginStudy = (cards: Card[]) => {
    setStudyCards(cards);
    setStudyIndex(0);
    setShowBack(false);
    setStudyResults([]);
    setScreen("study");
  };

  const onStartFromSetup = () => {
    if (!selectedDeck) return;
    const pool = selectedDeck.cards ?? [];
    const filtered = setupMarkedOnly ? pool.filter((c) => c.marked) : pool;
    const ordered = setupOrder === "random" ? shuffle(filtered) : filtered;
    const limit =
      setupCount === "all" ? ordered.length : Math.min(setupCount, ordered.length);
    if (limit === 0) return;
    beginStudy(ordered.slice(0, limit));
  };

  const onRetryMistakes = () => {
    const mistakes = studyResults.filter((r) => !r.correct).map((r) => r.card);
    if (mistakes.length === 0) return;
    beginStudy(setupOrder === "random" ? shuffle(mistakes) : mistakes);
  };

  const onRetrySame = () => {
    beginStudy(setupOrder === "random" ? shuffle(studyCards) : studyCards);
  };

  const onAnswer = async (correct: boolean) => {
    if (!selectedDeck) return;
    const card = studyCards[studyIndex];
    setStudyResults((prev) => [...prev, { card, correct }]);
    try {
      await answerCard(selectedDeck.id, card.id, correct);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    if (studyIndex + 1 >= studyCards.length) {
      await reloadDeck(selectedDeck.id);
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
              setScreen("cards");
              reloadDeck(selectedDeck!.id);
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

        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="mb-2 text-xs text-slate-400">おもて</p>
          <p className="mb-6 text-center text-2xl font-bold">{card.front}</p>

          {showBack ? (
            <>
              <div className="mb-6 w-full border-t border-slate-200" />
              <p className="mb-2 text-xs text-slate-400">うら</p>
              <p className="mb-8 text-center text-xl">{card.back}</p>
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
    const filtered = setupMarkedOnly ? pool.filter((c) => c.marked) : pool;
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
            <div className="flex gap-2">
              <button
                onClick={() => setSetupMarkedOnly(false)}
                className={`rounded border px-3 py-1.5 text-sm ${!setupMarkedOnly ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
              >
                全カード（{pool.length}枚）
              </button>
              <button
                onClick={() => setSetupMarkedOnly(true)}
                disabled={pool.filter((c) => c.marked).length === 0}
                className={`rounded border px-3 py-1.5 text-sm ${setupMarkedOnly ? "border-amber-500 bg-amber-500 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100"} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                ★のみ（{pool.filter((c) => c.marked).length}枚）
              </button>
            </div>
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

          <div className="mb-6">
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

          <div className="flex justify-end gap-2">
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
          <div className="mb-2 flex gap-2">
            <input
              value={cardFront}
              onChange={(e) => setCardFront(e.target.value)}
              placeholder="おもて（問題）"
              className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
            <input
              value={cardBack}
              onChange={(e) => setCardBack(e.target.value)}
              placeholder="うら（答え）"
              className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
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
          </div>
        </form>

        {cards.length === 0 ? (
          <p className="text-sm text-slate-500">
            カードがまだありません。上のフォームから追加してください。
          </p>
        ) : (
          <ul className="space-y-2">
            {cards.map((c) => {
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
