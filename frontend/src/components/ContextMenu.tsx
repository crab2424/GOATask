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

  const close = useCallback(() => setMenu(null), []);

  const open = useCallback(
    (x: number, y: number, data: T) => {
      setMenu({ ...clampMenuPosition(x, y, width, height), ...data });
    },
    [width, height],
  );

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(null);
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

  return { menu, open, close, ref };
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
