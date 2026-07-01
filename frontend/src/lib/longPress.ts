import type { TouchEvent as ReactTouchEvent, MouseEvent as ReactMouseEvent } from "react";

const MOVE_TOLERANCE_PX = 10;
// How long after firing we still treat the trailing click as "consumed".
// Bounds how long a stale "fired" flag could otherwise suppress a click.
const FIRED_WINDOW_MS = 800;

interface LongPressState {
  timer: number | null;
  start: { x: number; y: number } | null;
  firedAt: number | null;
}

/**
 * Per-key state store that survives re-renders. Card components are re-created
 * on every render (they're plain functions called from .map()), so the
 * "fired" flag must live outside that closure — otherwise opening the context
 * menu (a setState triggered from the long-press callback) re-renders the
 * list and swaps in a fresh closure before the trailing touchend/click for
 * the same gesture arrives, and the click leaks through.
 */
export type LongPressStore = Map<string, LongPressState>;

export function createLongPressStore(): LongPressStore {
  return new Map();
}

function getState(store: LongPressStore, key: string): LongPressState {
  let state = store.get(key);
  if (!state) {
    state = { timer: null, start: null, firedAt: null };
    store.set(key, state);
  }
  return state;
}

export function createLongPressHandlers(
  store: LongPressStore,
  key: string,
  onLongPress: (x: number, y: number) => void,
  delayMs = 550,
) {
  const state = getState(store, key);

  const clearTimer = () => {
    if (state.timer !== null) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
  };

  const onTouchStart = (e: ReactTouchEvent) => {
    if (e.touches.length !== 1) {
      clearTimer();
      return;
    }
    const touch = e.touches[0];
    state.start = { x: touch.clientX, y: touch.clientY };
    clearTimer();
    state.timer = window.setTimeout(() => {
      state.firedAt = Date.now();
      onLongPress(touch.clientX, touch.clientY);
    }, delayMs);
  };

  const onTouchMove = (e: ReactTouchEvent) => {
    if (!state.start) return;
    const touch = e.touches[0];
    if (
      Math.abs(touch.clientX - state.start.x) > MOVE_TOLERANCE_PX ||
      Math.abs(touch.clientY - state.start.y) > MOVE_TOLERANCE_PX
    ) {
      clearTimer();
    }
  };

  const onTouchEnd = () => clearTimer();

  const onClickCapture = (e: ReactMouseEvent) => {
    if (state.firedAt !== null && Date.now() - state.firedAt < FIRED_WINDOW_MS) {
      e.stopPropagation();
      e.preventDefault();
      state.firedAt = null;
    }
  };

  return { onTouchStart, onTouchMove, onTouchEnd, onClickCapture };
}
