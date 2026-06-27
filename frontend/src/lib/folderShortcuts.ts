import { useCallback, useEffect, useState } from "react";

const RECENT_LIMIT = 5;

function readNumberArray(key: string): number[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is number => typeof n === "number");
  } catch {
    return [];
  }
}

function writeArray(key: string, arr: number[]) {
  try {
    localStorage.setItem(key, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

/** Persisted Set of "favorite" folder ids. */
export function useFavorites(key: string) {
  const [ids, setIds] = useState<Set<number>>(
    () => new Set(readNumberArray(key)),
  );
  useEffect(() => {
    writeArray(key, [...ids]);
  }, [key, ids]);
  const toggle = useCallback((id: number) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const has = useCallback((id: number) => ids.has(id), [ids]);
  return { ids, toggle, has };
}

/** Persisted MRU list of recently visited folder ids (most recent first). */
export function useRecent(key: string) {
  const [ids, setIds] = useState<number[]>(() => readNumberArray(key));
  useEffect(() => {
    writeArray(key, ids);
  }, [key, ids]);
  const push = useCallback((id: number) => {
    setIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, RECENT_LIMIT);
      return next;
    });
  }, []);
  /** Drop ids that no longer exist (called after the underlying list loads). */
  const prune = useCallback((existing: Set<number>) => {
    setIds((prev) => {
      const filtered = prev.filter((id) => existing.has(id));
      if (filtered.length === prev.length) return prev;
      return filtered;
    });
  }, []);
  return { ids, push, prune };
}
