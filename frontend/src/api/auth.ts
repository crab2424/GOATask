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

export async function register(
  username: string,
  password: string,
  inviteCode: string,
): Promise<AuthUser> {
  const res = await apiFetch(`/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, invite_code: inviteCode }),
  });
  if (res.ok) return res.json();
  let msg = `register failed: ${res.status}`;
  try {
    const body = await res.json();
    if (typeof body?.message === "string") msg = body.message;
  } catch {
    // レスポンスがJSONでなくても既定メッセージで返す
  }
  if (res.status === 403) throw new Error(msg || "登録が許可されていません");
  if (res.status === 409) throw new Error("そのユーザー名はすでに使われています");
  if (res.status === 400) throw new Error(msg);
  throw new Error(msg);
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await apiFetch(`/api/auth/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (res.status === 401) throw new Error("現在のパスワードが違います");
  if (res.status === 400) throw new Error("新しいパスワードは8〜72文字にしてください");
  if (!res.ok && res.status !== 204) throw new Error(`パスワード変更に失敗しました (${res.status})`);
}

export async function logout(): Promise<void> {
  const res = await apiFetch(`/api/auth/logout`, { method: "POST" });
  if (!res.ok && res.status !== 204) throw new Error(`logout failed: ${res.status}`);
}
