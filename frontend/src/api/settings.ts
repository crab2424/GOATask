import { apiFetch, UnauthorizedError } from "./client";

/**
 * 設定画面で割当を変更できるアクション。
 * - addChecklistMarker: タスク詳細エディタでチェック記号を行頭に挿入
 * - createTaskItem: 新規作成（タスク: フォームを開く/送信、メモ: 新規メモ、単語帳: カード追加欄）
 * - save / cancel: 編集中のタスク・メモ・カードの保存 / 破棄
 * 照合ロジックは shared/lib/keybindings.ts。
 */
export type KeyAction = "addChecklistMarker" | "createTaskItem" | "save" | "cancel";

export type Keybindings = Partial<Record<KeyAction, string>>;

/**
 * 時刻通知（アラーム）。全端末で共有するため user_settings に保存する。
 * - once: date の time に1回だけ鳴る
 * - daily: 毎日 time に鳴る
 * - weekly: days（0=日〜6=土）の曜日の time に鳴る
 */
export type AlarmRepeat = "once" | "daily" | "weekly";

export interface Alarm {
  id: string;
  label: string;
  /** "HH:MM"（端末のローカル時刻） */
  time: string;
  repeat: AlarmRepeat;
  /** repeat === "once" のときの日付 "YYYY-MM-DD" */
  date?: string;
  /** repeat === "weekly" のときの曜日 */
  days?: number[];
  enabled: boolean;
  /** 最終更新時刻(ms)。これより前の発火予定は鳴らさない（作成・編集直後に過去分が鳴るのを防ぐ） */
  updatedAt: number;
}

/** サーバー保存するユーザー設定。スキーマはフロントエンドが所有する。 */
export interface UserSettings {
  keybindings?: Keybindings;
  alarms?: Alarm[];
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
