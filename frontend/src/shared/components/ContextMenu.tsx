import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

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
  const innerRef = useRef<HTMLDivElement | null>(null);

  // 開いた直後に先頭項目へフォーカスし、キーボードだけで操作できるようにする。
  // 開いた元の要素（ツリー行など）へ戻すのは Escape 時の useContextMenu 側では行わないため、
  // 閉じたあとのフォーカスはブラウザ既定（body）になる。
  useEffect(() => {
    const items = innerRef.current?.querySelectorAll<HTMLButtonElement>("button");
    items?.[0]?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    // サブメニュー内の項目は除き、このメニュー直属の項目だけを巡回する。
    const container = innerRef.current;
    const items = Array.from(
      container?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    ).filter((b) => b.closest('[role="menu"]') === container);
    if (items.length === 0) return;
    e.preventDefault();
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = 0;
    if (e.key === "ArrowDown") next = idx < 0 ? 0 : (idx + 1) % items.length;
    else if (e.key === "ArrowUp") next = idx < 0 ? items.length - 1 : (idx - 1 + items.length) % items.length;
    else if (e.key === "End") next = items.length - 1;
    items[next]?.focus();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 rounded border border-slate-200 bg-white py-1 text-sm shadow-lg"
      style={{ top: y, left: x, minWidth }}
    >
      {/* 外側は useContextMenu の外側クリック判定用、内側がキーボード巡回の範囲 */}
      <div ref={innerRef} role="menu" onKeyDown={onKeyDown}>
        {children}
      </div>
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
      role="menuitem"
      onClick={onClick}
      className={
        danger
          ? "block w-full px-3 py-1.5 text-left text-rose-600 hover:bg-rose-50 focus:outline-none focus-visible:bg-rose-50"
          : "block w-full px-3 py-1.5 text-left hover:bg-slate-100 focus:outline-none focus-visible:bg-slate-100"
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
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" && !open) {
            e.preventDefault();
            e.stopPropagation();
            const wrapper = e.currentTarget.parentElement;
            setOpen(true);
            requestAnimationFrame(() => {
              wrapper?.querySelector<HTMLButtonElement>('[role="menu"] button')?.focus();
            });
          }
        }}
        className="block w-full px-3 py-1.5 text-left hover:bg-slate-100 focus:outline-none focus-visible:bg-slate-100"
      >
        {label} <span className="float-right text-slate-400">›</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-full top-0 z-50 ml-1 min-w-44 rounded border border-slate-200 bg-white py-1 text-sm shadow-lg"
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(":scope > button")?.focus();
            }
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
