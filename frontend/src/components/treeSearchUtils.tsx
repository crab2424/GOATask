import type { ReactElement } from "react";

export interface TreeSearchResult {
  key: string;
  icon: string;
  label: string;
  path: string;
  onClick: () => void;
}

export function renderTreeSearchResults(
  results: TreeSearchResult[],
): ReactElement {
  if (results.length === 0) {
    return (
      <p className="px-2 py-4 text-center text-sm text-slate-500">
        該当する項目はありません
      </p>
    );
  }
  return (
    <ul className="space-y-0.5">
      {results.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            onClick={r.onClick}
            className="flex w-full items-start gap-1.5 rounded px-1.5 py-1 text-left text-sm hover:bg-slate-100"
          >
            <span aria-hidden className="shrink-0">
              {r.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{r.label}</span>
              {r.path && (
                <span className="block truncate text-xs text-slate-400">
                  {r.path}
                </span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Lowercase + trim. Empty string means "no query". */
export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

export function matchesQuery(text: string, q: string): boolean {
  if (!q) return false;
  return text.toLowerCase().includes(q);
}
