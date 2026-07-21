// クライアントごとの一意ID。同一ユーザーが複数タブ/端末で開いていても
// タブごとに別IDを持ち、自分が送った変更のSSE通知を自分自身で無視するために使う。
//
// SessionStorageに保存するのでタブを開いている間だけ有効。タブを閉じたら破棄される。

const KEY = "goatask:clientId";

function generate(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // フォールバック（古いブラウザ向け）
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let cached: string | null = null;

export function getClientId(): string {
  if (cached) return cached;
  try {
    const stored = window.sessionStorage.getItem(KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
    const fresh = generate();
    window.sessionStorage.setItem(KEY, fresh);
    cached = fresh;
    return fresh;
  } catch {
    // SessionStorageが使えない環境ではメモリキャッシュのみで動く
    if (!cached) cached = generate();
    return cached;
  }
}
