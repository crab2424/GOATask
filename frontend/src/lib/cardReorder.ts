import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type TouchEvent,
} from "react";

export type CardDropTarget = { id: number; before: boolean } | null;

export function reorderIds(
  ids: number[],
  draggedId: number,
  overId: number,
  before: boolean,
): number[] {
  if (draggedId === overId) return ids;
  const next = ids.filter((id) => id !== draggedId);
  const overIndex = next.indexOf(overId);
  if (overIndex < 0) return ids;
  next.splice(before ? overIndex : overIndex + 1, 0, draggedId);
  return next;
}

/** Reorders only visible items while retaining hidden items in their slots. */
export function mergeVisibleOrder(allIds: number[], visibleIds: number[]): number[] {
  const visible = new Set(visibleIds);
  let index = 0;
  return allIds.map((id) => (visible.has(id) ? visibleIds[index++] : id));
}

const HOLD_MS = 500;
const MOVE_TOLERANCE = 10;

export function useTouchCardReorder(
  enabled: boolean,
  onDrop: (draggedId: number, target: CardDropTarget) => void | Promise<void>,
) {
  const timer = useRef<number | null>(null);
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const activeIdRef = useRef<number | null>(null);
  const targetRef = useRef<CardDropTarget>(null);
  const suppressClick = useRef(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [target, setTarget] = useState<CardDropTarget>(null);

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const reset = () => {
    clearTimer();
    gesture.current = null;
    activeIdRef.current = null;
    targetRef.current = null;
    setActiveId(null);
    setTarget(null);
  };

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const bind = (id: number) => ({
    onTouchStart: (e: TouchEvent<HTMLElement>) => {
      if (!enabled || e.touches.length !== 1) return;
      const element = e.target as HTMLElement;
      const interactive = element.closest("button, input, textarea, select, a");
      if (interactive && !element.closest("[data-reorder-handle]")) return;
      if (element.closest("[data-reorder-ignore]")) return;
      const touch = e.touches[0];
      gesture.current = { id, x: touch.clientX, y: touch.clientY };
      clearTimer();
      timer.current = window.setTimeout(() => {
        activeIdRef.current = id;
        suppressClick.current = true;
        setActiveId(id);
        navigator.vibrate?.(20);
      }, HOLD_MS);
    },
    onTouchMove: (e: TouchEvent<HTMLElement>) => {
      const current = gesture.current;
      const touch = e.touches[0];
      if (!current || !touch) return;
      if (activeIdRef.current === null) {
        if (
          Math.abs(touch.clientX - current.x) > MOVE_TOLERANCE ||
          Math.abs(touch.clientY - current.y) > MOVE_TOLERANCE
        ) {
          clearTimer();
          gesture.current = null;
        }
        return;
      }
      e.preventDefault();
      const card = document
        .elementFromPoint(touch.clientX, touch.clientY)
        ?.closest<HTMLElement>("[data-reorder-card]");
      const overId = Number(card?.dataset.reorderCard);
      if (!card || !Number.isFinite(overId) || overId === activeIdRef.current) {
        targetRef.current = null;
        setTarget(null);
        return;
      }
      const rect = card.getBoundingClientRect();
      const next = { id: overId, before: touch.clientY < rect.top + rect.height / 2 };
      targetRef.current = next;
      setTarget(next);
    },
    onTouchEnd: (e: TouchEvent<HTMLElement>) => {
      clearTimer();
      const draggedId = activeIdRef.current;
      if (draggedId !== null) {
        e.preventDefault();
        void onDrop(draggedId, targetRef.current);
      }
      reset();
    },
    onTouchCancel: reset,
    onClickCapture: (e: MouseEvent<HTMLElement>) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  });

  return { activeId, target, bind };
}
