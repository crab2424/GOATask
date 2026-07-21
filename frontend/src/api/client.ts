import { getClientId } from "../shared/lib/clientId";

export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  // どのクライアントが投げたリクエストかをサーバーに伝え、SSEで同じIDのクライアントに
  // 自分の変更通知を返させないようにする。
  headers.set("X-Client-Id", getClientId());
  return fetch(`${API_BASE}${path}`, { ...init, credentials: "include", headers });
}

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}
