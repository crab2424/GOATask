import type { Card } from "../../../api/decks";
import { CardFiltersPanel } from "../components/CardFiltersPanel";
import { applyCardFilters, type CardFilters, type StudyDirection, type StudyOrder } from "../study/model";

interface StudySetupScreenProps {
  cards: Card[];
  filters: CardFilters;
  filtersOpen: boolean;
  count: number | "all";
  order: StudyOrder;
  direction: StudyDirection;
  onFiltersChange: (filters: CardFilters) => void;
  onToggleFilters: () => void;
  onCountChange: (count: number | "all") => void;
  onOrderChange: (order: StudyOrder) => void;
  onDirectionChange: (direction: StudyDirection) => void;
  onReset: () => void;
  onCancel: () => void;
  onStart: () => void;
}

export function StudySetupScreen(props: StudySetupScreenProps) {
  const filtered = applyCardFilters(props.cards, props.filters);
  const max = filtered.length;
  const presets = [5, 10, 20].filter((value) => value < max);
  const choiceClass = (active: boolean) => `rounded border px-3 py-1.5 text-sm ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`;

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4"><button onClick={props.onCancel} className="text-sm text-slate-500 hover:text-slate-800">← カード一覧に戻る</button></div>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold">学習設定</h2>
        <div className="mb-4">
          <p className="mb-1 text-sm font-semibold">出題対象</p>
          <CardFiltersPanel filters={props.filters} onChange={props.onFiltersChange} open={props.filtersOpen} onToggleOpen={props.onToggleFilters} filteredCount={max} totalCount={props.cards.length} />
        </div>
        <div className="mb-4">
          <p className="mb-1 text-sm font-semibold">問題数</p>
          <div className="mb-2 flex flex-wrap gap-2">
            {presets.map((value) => <button key={value} onClick={() => props.onCountChange(value)} className={choiceClass(props.count === value)}>{value}問</button>)}
            <button onClick={() => props.onCountChange("all")} className={choiceClass(props.count === "all")}>全件（{max}問）</button>
          </div>
          <input type="number" min={1} max={max} value={props.count === "all" ? max : props.count} onChange={(event) => { const value = Number.parseInt(event.target.value, 10); if (Number.isFinite(value)) props.onCountChange(Math.max(1, Math.min(max, value))); }} className="w-24 rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none" />
          <span className="ml-2 text-xs text-slate-500">最大 {max} 問</span>
        </div>
        <div className="mb-4">
          <p className="mb-1 text-sm font-semibold">順番</p>
          <div className="flex gap-2">
            <button onClick={() => props.onOrderChange("random")} className={choiceClass(props.order === "random")}>ランダム</button>
            <button onClick={() => props.onOrderChange("created")} className={choiceClass(props.order === "created")}>作成順</button>
          </div>
        </div>
        <div className="mb-6">
          <p className="mb-1 text-sm font-semibold">出題方向</p>
          <div className="flex gap-2">
            <button onClick={() => props.onDirectionChange("front")} className={choiceClass(props.direction === "front")}>おもて → うら</button>
            <button onClick={() => props.onDirectionChange("back")} className={choiceClass(props.direction === "back")}>うら → おもて</button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <button onClick={props.onReset} className="text-xs text-slate-500 hover:text-slate-800" title="保存された学習設定を初期値に戻す">設定をリセット</button>
          <div className="flex gap-2">
            <button onClick={props.onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">キャンセル</button>
            <button onClick={props.onStart} disabled={max === 0} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:bg-slate-400">開始</button>
          </div>
        </div>
      </div>
    </div>
  );
}
