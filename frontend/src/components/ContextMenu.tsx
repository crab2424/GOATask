import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { clampMenuPosition } from "../lib/menuPosition";

// Shared right-click / long-press popup menu used by the Task (project/task)
// and Memo (folder/memo) directories. Previously each of those four menus
// duplicated the same state + on-screen clamp + outside-click/Escape close
// + ref plumbing; this centralises it.

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

  // Close if the menu is currently open for the same item (isSame returns true),
  // otherwise open at the given position. Used by ⋮ buttons so the second click
  // dismisses the menu instead of reopening it after the outside-click listener
  // closed it on mousedown.
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

  /** Returns true when a card click was consumed solely to dismiss the menu. */
  const closeOnCardClick = useCallback(() => {
    if (menu) {
      setMenu(null);
      return true;
    }
    // The document-level mousedown runs before the card's click. Remember that
    // dismissal briefly so the same gesture doesn't also activate the card.
    return Date.now() - outsideDismissedAt.current < 400;
  }, [menu]);

  return { menu, open, close, toggle, closeOnCardClick, ref };
}

interface ContextMenuProps {
  x: number;
  y: number;
  menuRef: React.Ref<HTMLDivElement>;
  minWidth?: number;
  children: ReactNode;
}

/** The fixed-position popup container. Position it with the state from
 *  `useContextMenu` and pass its `ref` as `menuRef`. */
export function ContextMenu({
  x,
  y,
  menuRef,
  minWidth = 140,
  children,
}: ContextMenuProps) {
  return (
    <div
      ref={menuRef}
      className="fixed z-50 rounded border border-slate-200 bg-white py-1 text-sm shadow-lg"
      style={{ top: y, left: x, minWidth }}
    >
      {children}
    </div>
  );
}

interface ContextMenuItemProps {
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}

/** A single row in a context menu. `danger` renders the destructive style. */
export function ContextMenuItem({
  onClick,
  danger,
  children,
}: ContextMenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        danger
          ? "block w-full px-3 py-1.5 text-left text-rose-600 hover:bg-rose-50"
          : "block w-full px-3 py-1.5 text-left hover:bg-slate-100"
      }
    >
      {children}
    </button>
  );
}
