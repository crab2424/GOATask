import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_KEYBINDINGS,
  fetchUserSettings,
  saveUserSettings,
  type KeyAction,
  type Keybindings,
  type UserSettings,
} from "../../api/settings";
import { LoadingIndicator } from "../../shared/components/LoadingIndicator";

const ACTIONS: { id: KeyAction; label: string; desc: string }[] = [
  { id: "addChecklistMarker", label: "チェック項目記号追加", desc: "編集中の行にチェック記号を挿入" },
  { id: "createTaskItem", label: "タスク項目作成", desc: "新しいタスク項目を作成" },
  { id: "save", label: "保存", desc: "編集内容を保存" },
  { id: "cancel", label: "キャンセル", desc: "編集を破棄して閉じる" },
];

/** KeyboardEventを "Ctrl+Shift+K" 形式の表記へ変換する。修飾キー単体は未確定としてnull。 */
function keyEventToBinding(event: React.KeyboardEvent): string | null {
  const key = event.key;
  if (key === "Control" || key === "Shift" || key === "Alt" || key === "Meta") return null;
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.metaKey) parts.push("Cmd");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join("+");
}

export function KeybindingsSection() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["userSettings"], queryFn: fetchUserSettings });
  // サーバー保存値の上に未保存の編集を重ねる。表示値 = 上書き ?? サーバー値 ?? デフォルト
  const [overrides, setOverrides] = useState<Keybindings>({});
  const [capturing, setCapturing] = useState<KeyAction | null>(null);
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: (settings: UserSettings) => saveUserSettings(settings),
    onSuccess: (data) => {
      queryClient.setQueryData(["userSettings"], data);
      setOverrides({});
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    },
  });

  const serverBindings = settingsQuery.data?.keybindings ?? {};
  const bindingOf = (action: KeyAction) =>
    overrides[action] ?? serverBindings[action] ?? DEFAULT_KEYBINDINGS[action];
  const isDirty = ACTIONS.some(
    (a) => bindingOf(a.id) !== (serverBindings[a.id] ?? DEFAULT_KEYBINDINGS[a.id]),
  );

  const onSave = () => {
    mutation.mutate({ ...settingsQuery.data, keybindings: { ...serverBindings, ...overrides } });
  };

  if (settingsQuery.isLoading) {
    return <LoadingIndicator />;
  }
  if (settingsQuery.isError) {
    return <p className="text-xs text-red-600">キー設定の取得に失敗しました</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        タスクモードのディレクトリ操作で使うキー割当。全デバイスで同期されます。
        <span className="ml-1 text-slate-400">※キー操作機能は今後実装予定（割当のみ先行）</span>
      </p>
      <ul className="space-y-2">
        {ACTIONS.map((action) => (
          <li key={action.id} className="flex items-center justify-between gap-3 rounded border border-slate-200 px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-800">{action.label}</div>
              <div className="text-[11px] text-slate-500">{action.desc}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => setCapturing(capturing === action.id ? null : action.id)}
                onKeyDown={(event) => {
                  if (capturing !== action.id) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const binding = keyEventToBinding(event);
                  if (!binding) return;
                  setOverrides((prev) => ({ ...prev, [action.id]: binding }));
                  setCapturing(null);
                }}
                onBlur={() => { if (capturing === action.id) setCapturing(null); }}
                className={`min-w-[7rem] rounded border px-2 py-1 font-mono text-xs transition-colors ${
                  capturing === action.id
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-300 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {capturing === action.id ? "キーを入力..." : bindingOf(action.id)}
              </button>
              {bindingOf(action.id) !== DEFAULT_KEYBINDINGS[action.id] && (
                <button
                  onClick={() => setOverrides((prev) => ({ ...prev, [action.id]: DEFAULT_KEYBINDINGS[action.id] }))}
                  title="デフォルトに戻す"
                  className="rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  ↺
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={!isDirty || mutation.isPending}
          className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
        >
          {mutation.isPending ? "保存中..." : "キー設定を保存"}
        </button>
        {saved && <span className="text-xs text-green-700">✓ 保存しました</span>}
        {mutation.isError && (
          <span className="text-xs text-red-600">
            {mutation.error instanceof Error ? mutation.error.message : "保存に失敗しました"}
          </span>
        )}
      </div>
    </div>
  );
}
