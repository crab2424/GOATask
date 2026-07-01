import type { TouchEvent as ReactTouchEvent, MouseEvent as ReactMouseEvent } from "react";

const MOVE_TOLERANCE_PX = 10;

/**
 * Factory (not a hook) so it can be created freely inside .map() without
 * violating rules-of-hooks — each call just closes over its own local state.
 */
export function createLongPressHandlers(
  onLongPress: (x: number, y: number) => void,
  delayMs = 550,
) {
  let timer: number | null = null;
  let start: { x: number; y: number } | null = null;
  let fired = false;

  const clear = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  const onTouchStart = (e: ReactTouchEvent) => {
    if (e.touches.length !== 1) {
      clear();
      return;
    }
    const touch = e.touches[0];
    start = { x: touch.clientX, y: touch.clientY };
    fired = false;
    clear();
    timer = window.setTimeout(() => {
      fired = true;
      onLongPress(touch.clientX, touch.clientY);
    }, delayMs);
  };

  const onTouchMove = (e: ReactTouchEvent) => {
    if (!start) return;
    const touch = e.touches[0];
    if (
      Math.abs(touch.clientX - start.x) > MOVE_TOLERANCE_PX ||
      Math.abs(touch.clientY - start.y) > MOVE_TOLERANCE_PX
    ) {
      clear();
    }
  };

  const onTouchEnd = () => clear();

  const onClickCapture = (e: ReactMouseEvent) => {
    if (fired) {
      e.stopPropagation();
      e.preventDefault();
      fired = false;
    }
  };

  return { onTouchStart, onTouchMove, onTouchEnd, onClickCapture };
}
