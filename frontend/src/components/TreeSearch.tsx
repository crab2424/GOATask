import { useEffect, useRef, type ReactElement } from "react";

export interface TreeSearchResult {
  key: string;
  icon: string;
  label: string;
  path: string;
  onClick: () => void;
}

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  placeholder?: string;
}

/**
 * Search box rendered above a directory tree. While the query is non-empty,
 * the consumer should swap the tree out for `<TreeSearch.Results />`-style
 * output produced by this component, so callers only need to manage state.
 */
export function TreeSearch({ query, onQueryChange, placeholder }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isInputLike =
        tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
      if (e.key === "/" && !isInputLike) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative mb-2">
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && query) {
            e.stopPropagation();
            onQueryChange("");
          }
        }}
        placeholder={placeholder ?? "検索（/ でフォーカス）"}
        className="w-full rounded border border-slate-300 px-2 py-1 pr-7 text-sm focus:border-slate-500 focus:outline-none"
        aria-label="ツリー内検索"
      />
      {query && (
        <button
          type="button"
          onClick={() => onQueryChange("")}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1 text-xs text-slate-400 hover:text-slate-700"
          aria-label="検索をクリア"
          title="クリア"
        >
          ×
        </button>
      )}
    </div>
  );
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
