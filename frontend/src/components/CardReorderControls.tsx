interface CardReorderControlsProps {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function CardReorderControls({
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: CardReorderControlsProps) {
  return (
    <div className="flex gap-0.5" aria-label="並び替え操作">
      <button
        type="button"
        onClick={onMoveUp}
        disabled={!canMoveUp}
        className="rounded px-1.5 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-25"
        title="上に移動"
        aria-label="上に移動"
      >
        ▲
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={!canMoveDown}
        className="rounded px-1.5 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-25"
        title="下に移動"
        aria-label="下に移動"
      >
        ▼
      </button>
    </div>
  );
}
