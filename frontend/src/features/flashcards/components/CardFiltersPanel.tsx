import {
  DEFAULT_FILTERS,
  summarizeFilters,
  type CardFilters,
} from "../study/model";

function clampInt(value: string, min: number, max?: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, parsed));
}

interface CardFiltersPanelProps {
  filters: CardFilters;
  onChange: (filters: CardFilters) => void;
  open: boolean;
  onToggleOpen: () => void;
  filteredCount: number;
  totalCount: number;
}

export function CardFiltersPanel({
  filters,
  onChange,
  open,
  onToggleOpen,
  filteredCount,
  totalCount,
}: CardFiltersPanelProps) {
  const set = (patch: Partial<CardFilters>) => onChange({ ...filters, ...patch });
  const rangeInput = (
    value: number | null,
    onValue: (value: number | null) => void,
    max?: number,
  ) => (
    <input
      type="number"
      min={0}
      max={max}
      value={value ?? ""}
      placeholder={value === null ? "無制限" : undefined}
      onChange={(event) =>
        onValue(event.target.value === "" ? null : clampInt(event.target.value, 0, max))
      }
      className="w-24 rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
    />
  );

  return (
    <div className="rounded border border-slate-200 bg-white">
      <button type="button" onClick={onToggleOpen} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm">
        <span className="text-slate-700">
          フィルタ: <span className="font-medium">{summarizeFilters(filters)}</span>
          <span className="ml-2 text-xs text-slate-500">{filteredCount} / {totalCount} 件</span>
        </span>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-200 px-3 py-3 text-sm">
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600">★マーク</p>
            <div className="flex flex-wrap gap-2">
              {([ ["all", "全て"], ["marked", "★のみ"], ["unmarked", "★なし"] ] as const).map(([value, label]) => (
                <button key={value} onClick={() => set({ mark: value })} className={`rounded border px-2.5 py-1 text-xs ${filters.mark === value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600">正答率(%) <span className="ml-2 font-normal text-slate-400">※未回答は0%扱い</span></p>
            <div className="flex items-center gap-2">
              {rangeInput(filters.accMin, (value) => set({ accMin: value ?? 0 }), 100)}
              <span className="text-slate-400">〜</span>
              {rangeInput(filters.accMax, (value) => set({ accMax: value ?? 0 }), 100)}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600">正解数</p>
            <div className="flex items-center gap-2">
              {rangeInput(filters.correctMin, (value) => set({ correctMin: value ?? 0 }))}
              <span className="text-slate-400">〜</span>
              {rangeInput(filters.correctMax, (value) => set({ correctMax: value }))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600">不正解数</p>
            <div className="flex items-center gap-2">
              {rangeInput(filters.wrongMin, (value) => set({ wrongMin: value ?? 0 }))}
              <span className="text-slate-400">〜</span>
              {rangeInput(filters.wrongMax, (value) => set({ wrongMax: value }))}
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={() => onChange(DEFAULT_FILTERS)} className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100">リセット</button>
          </div>
        </div>
      )}
    </div>
  );
}
