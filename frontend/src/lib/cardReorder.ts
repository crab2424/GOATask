import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type TouchEvent,
} from "react";
import { flushSync } from "react-dom";

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

export function reorderItemsInSlots<T extends { id: number }>(
  items: T[],
  orderedIds: number[],
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = orderedIds.map((id) => byId.get(id)).filter((item): item is T => !!item);
  const affected = new Set(orderedIds);
  let index = 0;
  return items.map((item) => (affected.has(item.id) ? ordered[index++] : item));
}

/** FLIP animation for list order changes; rollback uses a deliberately faster return. */
export function animateCardReorder(update: () => void, rollback = false) {
  const before = new Map<number, DOMRect>();
  document.querySelectorAll<HTMLElement>("[data-reorder-card]").forEach((card) => {
    before.set(Number(card.dataset.reorderCard), card.getBoundingClientRect());
  });

  flushSync(update);
  requestAnimationFrame(() => {
    document.querySelectorAll<HTMLElement>("[data-reorder-card]").forEach((card) => {
      const previous = before.get(Number(card.dataset.reorderCard));
      if (!previous) return;
      const current = card.getBoundingClientRect();
      const deltaY = previous.top - current.top;
      if (Math.abs(deltaY) < 1) return;
      card.animate(
        [{ transform: `translateY(${deltaY}px)` }, { transform: "translateY(0)" }],
        { duration: rollback ? 80 : 220, easing: rollback ? "ease-out" : "cubic-bezier(0.2, 0, 0, 1)" },
      );
    });
  });
}

const HOLD_MS = 500;
// Allow small finger drift while waiting for the long press to activate.
const MOVE_TOLERANCE = 18;
// Keep a card target selectable slightly beyond its visual bounds. This makes
// touch reordering much less brittle near the gaps and viewport edges.
const DROP_GRACE_PX = 36;

function cardAtPoint(x: number, y: number): HTMLElement | null {
  const direct = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-reorder-card]");
  if (direct) return direct;

  let nearest: { card: HTMLElement; distance: number } | null = null;
  for (const node of document.querySelectorAll<HTMLElement>("[data-reorder-card]")) {
    const rect = node.getBoundingClientRect();
    if (
      x < rect.left - DROP_GRACE_PX ||
      x > rect.right + DROP_GRACE_PX ||
      y < rect.top - DROP_GRACE_PX ||
      y > rect.bottom + DROP_GRACE_PX
    ) {
      continue;
    }
    const distance = Math.max(rect.top - y, 0, y - rect.bottom);
    if (!nearest || distance < nearest.distance) nearest = { card: node, distance };
  }
  return nearest?.card ?? null;
}

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
      const card = cardAtPoint(touch.clientX, touch.clientY);
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
