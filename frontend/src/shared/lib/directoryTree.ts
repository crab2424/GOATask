// Generic helpers for parent/child tree structures used by Folder/Project
// directories. Items only need an `id` and an optional `parent_id`.

export interface TreeNode {
  id: number;
  parent_id?: number | null;
}

/** Group nodes by parent_id (null = root). */
export function buildChildMap<T extends TreeNode>(
  nodes: T[],
): Map<number | null, T[]> {
  const map = new Map<number | null, T[]>();
  for (const n of nodes) {
    const key = n.parent_id ?? null;
    const arr = map.get(key) ?? [];
    arr.push(n);
    map.set(key, arr);
  }
  return map;
}

/** Group child items (tasks/memos) by their parent folder id. */
export function buildItemsByParent<T extends { id: number }>(
  items: T[],
  getParent: (item: T) => number | null,
): Map<number | null, T[]> {
  const map = new Map<number | null, T[]>();
  for (const it of items) {
    const key = getParent(it);
    const arr = map.get(key) ?? [];
    arr.push(it);
    map.set(key, arr);
  }
  return map;
}

/** Walk up parent links to produce a root→leaf path of nodes. */
export function buildBreadcrumb<T extends TreeNode>(
  nodes: T[],
  leafId: number | null,
): T[] {
  const path: T[] = [];
  let id = leafId;
  while (id !== null) {
    const n = nodes.find((x) => x.id === id);
    if (!n) break;
    path.unshift(n);
    id = n.parent_id ?? null;
  }
  return path;
}

/** True iff `checkId` is `ancestorId` or a descendant of it. */
export function isDescendant<T extends TreeNode>(
  nodes: T[],
  ancestorId: number,
  checkId: number | null,
): boolean {
  if (checkId === null) return false;
  if (checkId === ancestorId) return true;
  const n = nodes.find((x) => x.id === checkId);
  if (!n) return false;
  return isDescendant(nodes, ancestorId, n.parent_id ?? null);
}

/** Flat list with depth-prefixed labels for use in <select> options. */
export function flatTreeOptions<T extends TreeNode & { name: string }>(
  childMap: Map<number | null, T[]>,
): { id: number; label: string }[] {
  const out: { id: number; label: string }[] = [];
  const walk = (parent: number | null, depth: number) => {
    const list = childMap.get(parent) ?? [];
    for (const n of list) {
      out.push({ id: n.id, label: `${"　".repeat(depth)}${n.name}` });
      walk(n.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Expand the set so it contains every ancestor of `id` (inclusive). */
export function expandAncestors<T extends TreeNode>(
  nodes: T[],
  prev: Set<number>,
  id: number,
): Set<number> {
  const next = new Set(prev);
  let cur: number | null = id;
  while (cur !== null) {
    next.add(cur);
    const n = nodes.find((x) => x.id === cur);
    cur = n?.parent_id ?? null;
  }
  return next;
}
