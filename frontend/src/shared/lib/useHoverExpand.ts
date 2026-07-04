import { useCallback, useRef } from "react";

/**
 * Auto-expand-on-hover during drag-and-drop.
 *
 * Call `schedule(id)` while a draggable is hovering over a collapsed folder —
 * after `delayMs` (default 500) the `expand` callback fires. Call `clear()`
 * when the hover moves away or the drag ends.
 */
export function useHoverExpand(
  expand: (id: number) => void,
  isExpanded: (id: number) => boolean,
  delayMs = 500,
) {
  const timerRef = useRef<{ id: number; timer: number } | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current.timer);
      timerRef.current = null;
    }
  }, []);

  const schedule = useCallback(
    (id: number) => {
      if (timerRef.current?.id === id) return;
      clear();
      if (isExpanded(id)) return;
      const timer = window.setTimeout(() => {
        expand(id);
        timerRef.current = null;
      }, delayMs);
      timerRef.current = { id, timer };
    },
    [expand, isExpanded, delayMs, clear],
  );

  const currentId = useCallback(() => timerRef.current?.id ?? null, []);

  return { schedule, clear, currentId };
}
