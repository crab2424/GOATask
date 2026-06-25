const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";

export type BackupScope = "all" | "tasks" | "memos" | "decks";

export async function fetchBackup(scope: BackupScope): Promise<unknown> {
  const path = scope === "all" ? "/api/backup/export" : `/api/backup/export/${scope}`;
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`export failed: ${res.status}`);
  return res.json();
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type ImportMode = "replace" | "merge";

export interface ImportResult {
  mode: ImportMode;
  scope: string;
  inserted: Record<string, number>;
}

export async function importBackup(
  data: unknown,
  mode: ImportMode,
  token?: string,
): Promise<ImportResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["X-Backup-Token"] = token;
  const res = await fetch(`${API_BASE}/api/backup/import`, {
    method: "POST",
    headers,
    body: JSON.stringify({ mode, data }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`import failed: ${res.status} ${text}`);
  }
  return res.json();
}

export function backupFilename(scope: BackupScope): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `goatask-${scope}-${yyyy}${mm}${dd}.json`;
}
