import { apiFetch } from "./client";

export interface AuthUser {
  id: number;
  username: string;
}

export async function fetchMe(): Promise<AuthUser | null> {
  const res = await apiFetch(`/api/auth/me`);
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`fetchMe failed: ${res.status}`);
  return res.json();
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await apiFetch(`/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (res.status === 401) throw new Error("ユーザー名またはパスワードが違います");
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  return res.json();
}

export async function logout(): Promise<void> {
  const res = await apiFetch(`/api/auth/logout`, { method: "POST" });
  if (!res.ok && res.status !== 204) throw new Error(`logout failed: ${res.status}`);
}
