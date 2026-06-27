import type { ReactElement } from "react";

export interface ShortcutEntry {
  id: number;
  name: string;
  isCurrent: boolean;
  onClick: () => void;
  onToggleFavorite?: () => void;
  starred?: boolean;
}

function Section({
  title,
  entries,
  emptyHint,
  showStar,
}: {
  title: string;
  entries: ShortcutEntry[];
  emptyHint?: string;
  showStar: boolean;
}): ReactElement | null {
  if (entries.length === 0 && !emptyHint) return null;
  return (
    <div className="mb-2">
      <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </div>
      {entries.length === 0 ? (
        <p className="px-2 py-1 text-xs text-slate-400">{emptyHint}</p>
      ) : (
        <ul className="space-y-0.5">
          {entries.map((e) => (
            <li key={e.id} className="group flex items-center">
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
      )}
    </div>
  );
}

interface Props {
  favorites: ShortcutEntry[];
  recents: ShortcutEntry[];
}

export function SidebarShortcuts({ favorites, recents }: Props) {
  if (favorites.length === 0 && recents.length === 0) return null;
  return (
    <div className="mb-3 border-b border-slate-200 pb-2">
      <Section
        title="★ お気に入り"
        entries={favorites}
        emptyHint={undefined}
        showStar
      />
      <Section title="🕘 最近" entries={recents} showStar={false} />
    </div>
  );
}
