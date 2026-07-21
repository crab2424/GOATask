import { apiFetch } from "./client";

export interface SharedFile {
  id: number;
  filename: string;
  content_type: string;
  size: number;
  created_at: string;
}

export interface FileShare {
  id: number;
  url: string;
  expires_at: string;
}

async function errorMessage(res: Response, operation: string): Promise<Error> {
  const text = await res.text();
  return new Error(`${operation} failed: ${res.status}${text ? ` ${text}` : ""}`);
}

export interface FileListResponse {
  files: SharedFile[];
  used_bytes: number;
  max_bytes: number;
  remaining_bytes: number;
}

export async function listFiles(): Promise<FileListResponse> {
  const res = await apiFetch("/api/files");
  if (!res.ok) throw await errorMessage(res, "listFiles");
  return res.json();
}

export async function uploadFile(file: File): Promise<SharedFile> {
  const body = new FormData();
  body.append("file", file);
  const res = await apiFetch("/api/files", { method: "POST", body });
  if (!res.ok) throw await errorMessage(res, "uploadFile");
  return res.json();
}

export async function createFileShare(id: number): Promise<FileShare> {
  const res = await apiFetch(`/api/files/${id}/shares`, { method: "POST" });
  if (!res.ok) throw await errorMessage(res, "createFileShare");
  return res.json();
}

export async function deleteFile(id: number): Promise<void> {
  const res = await apiFetch(`/api/files/${id}`, { method: "DELETE" });
  if (!res.ok) throw await errorMessage(res, "deleteFile");
}
