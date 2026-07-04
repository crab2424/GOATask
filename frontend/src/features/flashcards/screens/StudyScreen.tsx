import type { Card } from "../../../api/decks";
import type { StudyDirection } from "../study/model";

interface StudyScreenProps {
  card: Card;
  index: number;
  total: number;
  showBack: boolean;
  direction: StudyDirection;
  onStop: () => void;
  onToggleMark: () => void;
  onShowBack: () => void;
  onAnswer: (correct: boolean) => void;
}

export function StudyScreen({ card, index, total, showBack, direction, onStop, onToggleMark, onShowBack, onAnswer }: StudyScreenProps) {
  const progress = ((index + (showBack ? 0.5 : 0)) / total) * 100;
  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onStop} className="text-sm text-slate-500 hover:text-slate-800">← 中断</button>
        <span className="text-sm text-slate-500">{index + 1} / {total}</span>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full bg-slate-900 transition-all" style={{ width: `${progress}%` }} />
      </div>
      <div className="relative flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <button onClick={onToggleMark} className={`absolute left-3 top-3 text-2xl ${card.marked ? "text-amber-500" : "text-slate-300"} hover:text-amber-500`} title={card.marked ? "マーク解除" : "マーク"} aria-label={card.marked ? "マーク解除" : "マーク"}>★</button>
        <p className="mb-2 text-xs text-slate-400">{direction === "front" ? "おもて" : "うら"}</p>
        <p className="mb-6 text-center text-2xl font-bold">{direction === "front" ? card.front : card.back}</p>
        {showBack ? (
          <>
            <div className="mb-6 w-full border-t border-slate-200" />
            <p className="mb-2 text-xs text-slate-400">{direction === "front" ? "うら" : "おもて"}</p>
            <p className="mb-8 text-center text-xl">{direction === "front" ? card.back : card.front}</p>
            <div className="flex gap-4">
              <button onClick={() => onAnswer(false)} className="rounded-lg border border-rose-300 px-6 py-3 text-rose-700 hover:bg-rose-50">不正解</button>
              <button onClick={() => onAnswer(true)} className="rounded-lg bg-emerald-600 px-6 py-3 text-white hover:bg-emerald-700">正解</button>
            </div>
          </>
        ) : (
          <button onClick={onShowBack} className="rounded-lg bg-slate-900 px-6 py-3 text-white hover:bg-slate-700">答えを見る</button>
        )}
      </div>
    </div>
  );
}
