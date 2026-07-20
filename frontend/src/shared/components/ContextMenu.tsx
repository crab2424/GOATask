import { useState, type ReactNode } from "react";

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

/** Nested action menu. Hover opens it on desktop; tap opens it on touch devices. */
export function ContextMenuSubmenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="group relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="block w-full px-3 py-1.5 text-left hover:bg-slate-100"
      >
        {label} <span className="float-right text-slate-400">›</span>
      </button>
      {open && (
        <div className="absolute left-full top-0 z-50 ml-1 min-w-44 rounded border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {children}
        </div>
      )}
    </div>
  );
}
