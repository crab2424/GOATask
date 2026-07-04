import { useCallback, useEffect, useRef, useState } from "react";
import { clampMenuPosition } from "../lib/menuPosition";

// Shared right-click / long-press popup state used by the Task (project/task)
// and Memo (folder/memo) directories. Extracted from ContextMenu.tsx so the
// components file only exports components (react-refresh/only-export-components).

/**
 * State + open/close plumbing for a single context menu. `T` carries the
 * payload identifying what was clicked (e.g. `{ projectId: number }`).
 * `width`/`height` are the expected popup size, used to clamp it on screen.
 */
export function useContextMenu<T>(width: number, height: number) {
  const [menu, setMenu] = useState<({ x: number; y: number } & T) | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const outsideDismissedAt = useRef(0);

  const close = useCallback(() => setMenu(null), []);

  const open = useCallback(
    (x: number, y: number, data: T) => {
      setMenu({ ...clampMenuPosition(x, y, width, height), ...data });
    },
    [width, height],
  );

  const toggle = useCallback(
    (x: number, y: number, data: T, isSame: (curr: T) => boolean) => {
      setMenu((curr) => {
        if (curr && isSame(curr as T)) return null;
        return { ...clampMenuPosition(x, y, width, height), ...data };
      });
    },
    [width, height],
  );

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        outsideDismissedAt.current = Date.now();
        setMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const closeOnCardClick = useCallback(() => {
    if (menu) {
      setMenu(null);
      return true;
    }
    return Date.now() - outsideDismissedAt.current < 400;
  }, [menu]);

  return { menu, open, close, toggle, closeOnCardClick, ref };
}
