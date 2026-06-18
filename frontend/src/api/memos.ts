const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";

export interface Memo {
  id: number;
  title: string;
  content: string;
  folder_id?: number | null;
  color?: string;
  created_at: string;
  updated_at: string;
}

export interface NewMemo {
  title: string;
  content?: string;
  folder_id?: number | null;
  color?: string;
}

export async function listMemos(): Promise<Memo[]> {
  const res = await fetch(`${API_BASE}/api/memos`);
  if (!res.ok) throw new Error(`listMemos failed: ${res.status}`);
  return res.json();
}

export async function createMemo(input: NewMemo): Promise<Memo> {
  const res = await fetch(`${API_BASE}/api/memos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`createMemo failed: ${res.status}`);
  return res.json();
}

export async function updateMemo(id: number, input: Partial<Memo>): Promise<Memo> {
  const res = await fetch(`${API_BASE}/api/memos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`updateMemo failed: ${res.status}`);
  return res.json();
}

export async function deleteMemo(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/memos/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`deleteMemo failed: ${res.status}`);
}
