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

type Screen = "decks" | "cards" | "study";

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
  const [studyDone, setStudyDone] = useState(false);

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

  const startStudy = (markedOnly: boolean) => {
    if (!selectedDeck) return;
    const pool = selectedDeck.cards ?? [];
    const filtered = markedOnly ? pool.filter((c) => c.marked) : pool;
    if (filtered.length === 0) return;
    setStudyCards(shuffle(filtered));
    setStudyIndex(0);
    setShowBack(false);
    setStudyDone(false);
    setScreen("study");
  };

  const onAnswer = async (correct: boolean) => {
    if (!selectedDeck) return;
    const card = studyCards[studyIndex];
    try {
      await answerCard(selectedDeck.id, card.id, correct);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    if (studyIndex + 1 >= studyCards.length) {
      setStudyDone(true);
      await reloadDeck(selectedDeck.id);
    } else {
      setStudyIndex(studyIndex + 1);
      setShowBack(false);
    }
  };

  const cards = selectedDeck?.cards ?? [];
  const markedCount = cards.filter((c) => c.marked).length;

  if (screen === "study" && !studyDone) {
    const card = studyCards[studyIndex];
    return (
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => {
              setScreen("cards");
              reloadDeck(selectedDeck!.id);
            }}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            ← カード一覧に戻る
          </button>
          <span className="text-sm text-slate-500">
            {studyIndex + 1} / {studyCards.length}
          </span>
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

  if (screen === "study" && studyDone) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="mb-4 text-2xl font-bold">学習完了</p>
          <p className="mb-6 text-slate-600">
            {studyCards.length}枚のカードを学習しました。
          </p>
          <button
            onClick={() => setScreen("cards")}
            className="rounded-lg bg-slate-900 px-6 py-3 text-white hover:bg-slate-700"
          >
            カード一覧に戻る
          </button>
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
                onClick={() => startStudy(true)}
                className="rounded border border-amber-300 px-3 py-1 text-sm text-amber-700 hover:bg-amber-50"
              >
                ★のみ学習（{markedCount}枚）
              </button>
            )}
            <button
              onClick={() => startStudy(false)}
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
