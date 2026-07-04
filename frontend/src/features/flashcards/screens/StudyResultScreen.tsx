import type { StudyResult } from "../study/model";

interface StudyResultScreenProps {
  results: StudyResult[];
  onBack: () => void;
  onRetry: () => void;
  onRetryMistakes: () => void;
}

export function StudyResultScreen({ results, onBack, onRetry, onRetryMistakes }: StudyResultScreenProps) {
  const total = results.length;
  const correctCount = results.filter((result) => result.correct).length;
  const wrongCount = total - correctCount;
  const rate = total === 0 ? 0 : Math.round((correctCount / total) * 100);
  const mistakes = results.filter((result) => !result.correct);
  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="mb-6 text-center text-2xl font-bold">学習完了</p>
        <div className="mb-6 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">出題</p><p className="text-2xl font-bold">{total}</p></div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs text-emerald-700">正解</p><p className="text-2xl font-bold text-emerald-700">{correctCount}</p></div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3"><p className="text-xs text-rose-700">不正解</p><p className="text-2xl font-bold text-rose-700">{wrongCount}</p></div>
        </div>
        <div className="mb-6">
          <div className="mb-1 flex justify-between text-xs text-slate-500"><span>正答率</span><span>{rate}%</span></div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-500" style={{ width: `${rate}%` }} /></div>
        </div>
        {mistakes.length > 0 && (
          <div className="mb-6">
            <p className="mb-2 text-sm font-semibold">間違えたカード</p>
            <ul className="space-y-1">
              {mistakes.map((result) => <li key={result.card.id} className="rounded border border-rose-100 bg-rose-50/50 px-3 py-2 text-sm"><span className="font-medium">{result.card.front}</span><span className="mx-2 text-slate-400">→</span><span className="text-slate-700">{result.card.back}</span></li>)}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={onBack} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">カード一覧に戻る</button>
          <button onClick={onRetry} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">もう一度</button>
          {mistakes.length > 0 && <button onClick={onRetryMistakes} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700">間違えたカードだけ再学習（{mistakes.length}枚）</button>}
        </div>
      </div>
    </div>
  );
}
