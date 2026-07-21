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

// サーバーが 409 を返したときに投げる楽観ロック衝突エラー。
// current にはサーバー側の現行値（Task or Memo）が入る。
// 呼び出し側は catch して衝突ダイアログを開き、上書き or 取り込みを選ばせる。
export class ConflictError<T = unknown> extends Error {
  current: T;
  constructor(current: T) {
    super("conflict");
    this.name = "ConflictError";
    this.current = current;
  }
}

// 409を検出したらConflictErrorを投げる共通ヘルパ。
// 呼び出し側は他のステータスコード判定と組み合わせて使う。
export async function throwIfConflict<T>(res: Response): Promise<void> {
  if (res.status !== 409) return;
  try {
    const body = await res.json();
    throw new ConflictError<T>(body?.current as T);
  } catch (err) {
    if (err instanceof ConflictError) throw err;
    throw new ConflictError<T>(undefined as T);
  }
}
