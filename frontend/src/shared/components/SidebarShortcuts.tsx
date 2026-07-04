import { useState, type ReactElement } from "react";

export interface ShortcutEntry {
  id: number;
  name: string;
  isCurrent: boolean;
  onClick: () => void;
  onToggleFavorite?: () => void;
  starred?: boolean;
}

function readOpen(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === "1";
  } catch {
    return fallback;
  }
}

function Section({
  storageKey,
  defaultOpen,
  title,
  entries,
  emptyHint,
  showStar,
}: {
  storageKey: string;
  defaultOpen: boolean;
  title: string;
  entries: ShortcutEntry[];
  emptyHint?: string;
  showStar: boolean;
}): ReactElement | null {
  const [open, setOpen] = useState(() => readOpen(storageKey, defaultOpen));
  if (entries.length === 0 && !emptyHint) return null;

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-1 px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600"
        aria-expanded={open}
      >
        <span
          className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          ›
        </span>
        <span>
          {title}
          {entries.length > 0 && ` (${entries.length})`}
        </span>
      </button>
      {open &&
        (entries.length === 0 ? (
          <p className="px-2 py-1 text-xs text-slate-400">{emptyHint}</p>
        ) : (
          <ul className="space-y-0.5">
            {entries.map((e) => (
              <li key={e.id} className="group flex h-7 items-center">
                <button
                  type="button"
                  onClick={e.onClick}
                  className={`flex flex-1 items-center gap-1 truncate rounded px-1.5 py-1 text-left text-sm ${
                    e.isCurrent
                      ? "bg-slate-200 font-bold text-slate-900"
                      : "hover:bg-slate-100"
                  }`}
                >
                  <span aria-hidden>📁</span>
                  <span className="truncate">{e.name}</span>
                </button>
                {showStar && e.onToggleFavorite && (
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      e.onToggleFavorite!();
                    }}
                    title={e.starred ? "お気に入り解除" : "お気に入り追加"}
                    className={`px-1 text-sm ${
                      e.starred
                        ? "text-amber-400"
                        : "text-slate-300 opacity-0 group-hover:opacity-100"
                    }`}
                    aria-label={e.starred ? "お気に入り解除" : "お気に入り追加"}
                  >
                    {e.starred ? "★" : "☆"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

interface Props {
  favorites: ShortcutEntry[];
  recents: ShortcutEntry[];
  storagePrefix: string;
}

export function SidebarShortcuts({ favorites, recents, storagePrefix }: Props) {
  return (
    <div className="mb-3 border-b border-slate-200 pb-2">
      <Section
        storageKey={`${storagePrefix}:favoritesOpen`}
        defaultOpen={favorites.length > 0}
        title="★ お気に入り"
        entries={favorites}
        emptyHint={undefined}
        showStar
      />
      <Section
        storageKey={`${storagePrefix}:recentOpen`}
        defaultOpen={false}
        title="🕘 最近"
        entries={recents}
        emptyHint="まだありません"
        showStar={false}
      />
    </div>
  );
}
