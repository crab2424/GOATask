const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";

export interface Folder {
  id: number;
  name: string;
  parent_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface NewFolder {
  name: string;
  parent_id?: number | null;
}

export async function listFolders(): Promise<Folder[]> {
  const res = await fetch(`${API_BASE}/api/folders`);
  if (!res.ok) throw new Error(`listFolders failed: ${res.status}`);
  return res.json();
}

export async function createFolder(input: NewFolder): Promise<Folder> {
  const res = await fetch(`${API_BASE}/api/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`createFolder failed: ${res.status}`);
  return res.json();
}

export async function updateFolder(
  id: number,
  input: Partial<Folder>,
): Promise<Folder> {
  const res = await fetch(`${API_BASE}/api/folders/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`updateFolder failed: ${res.status}`);
  return res.json();
}

export async function deleteFolder(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/folders/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`deleteFolder failed: ${res.status}`);
}
