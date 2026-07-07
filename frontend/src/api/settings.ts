import { apiFetch, UnauthorizedError } from "./client";

/** タスクモードのキー割当対象アクション。キー操作本体は未実装（割当の保存のみ先行）。 */
export type KeyAction = "addChecklistMarker" | "createTaskItem" | "save" | "cancel";

export type Keybindings = Partial<Record<KeyAction, string>>;

/** サーバー保存するユーザー設定。スキーマはフロントエンドが所有する。 */
export interface UserSettings {
  keybindings?: Keybindings;
}

export const DEFAULT_KEYBINDINGS: Record<KeyAction, string> = {
  addChecklistMarker: "Ctrl+M",
  createTaskItem: "Ctrl+Enter",
  save: "Ctrl+S",
  cancel: "Escape",
};

export async function fetchUserSettings(): Promise<UserSettings> {
  const res = await apiFetch("/api/settings");
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`設定の取得に失敗しました (${res.status})`);
  return res.json();
}

export async function saveUserSettings(settings: UserSettings): Promise<UserSettings> {
  const res = await apiFetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`設定の保存に失敗しました (${res.status})`);
  return res.json();
}
