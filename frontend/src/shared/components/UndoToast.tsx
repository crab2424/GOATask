import { useEffect } from "react";

interface Props {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  /** ms before auto-dismissing. Defaults to 6000. */
  durationMs?: number;
}

export function UndoToast({
  message,
  onUndo,
  onDismiss,
  durationMs = 6000,
}: Props) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [onDismiss, durationMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg md:bottom-6"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onUndo}
        className="rounded-full bg-amber-300 px-3 py-0.5 text-xs font-semibold text-slate-900 hover:bg-amber-200"
      >
        元に戻す
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="閉じる"
        className="text-slate-400 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}
