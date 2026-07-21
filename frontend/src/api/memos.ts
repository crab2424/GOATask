import { apiFetch, throwIfConflict } from "./client";

export interface Memo {
  id: number;
  title: string;
  content: string;
  folder_id?: number | null;
  color?: string;
  font_size?: string;
  created_at: string;
  updated_at: string;
  // 楽観ロック用のカウンタ。updateMemoで自動的に送信される。
  version: number;
}

export interface NewMemo {
  title: string;
  content?: string;
  folder_id?: number | null;
  color?: string;
  font_size?: string;
}

export async function listMemos(): Promise<Memo[]> {
  const res = await apiFetch(`/api/memos`);
  if (!res.ok) throw new Error(`listMemos failed: ${res.status}`);
  return res.json();
}

export async function createMemo(input: NewMemo): Promise<Memo> {
  const res = await apiFetch(`/api/memos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`createMemo failed: ${res.status}`);
  return res.json();
}

export async function updateMemo(
  id: number,
  input: Partial<Memo>,
  opts: { force?: boolean } = {},
): Promise<Memo> {
  const qs = opts.force ? "?force=true" : "";
  const res = await apiFetch(`/api/memos/${id}${qs}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await throwIfConflict<Memo>(res);
  if (!res.ok) throw new Error(`updateMemo failed: ${res.status}`);
  return res.json();
}

export async function deleteMemo(id: number): Promise<void> {
  const res = await apiFetch(`/api/memos/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`deleteMemo failed: ${res.status}`);
}

export async function reorderMemos(ids: number[]): Promise<void> {
  const res = await apiFetch(`/api/memos-reorder`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error(`reorderMemos failed: ${res.status}`);
}
