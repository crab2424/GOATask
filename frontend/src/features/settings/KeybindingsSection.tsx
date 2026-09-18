import { Fragment, useState } from "react";
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
import { IS_MAC, formatBinding, keyEventToBinding } from "../../shared/lib/keybindings";

const ACTIONS: { id: KeyAction; label: string; desc: string }[] = [
  { id: "addChecklistMarker", label: "チェック項目記号追加", desc: "タスク詳細の編集中、行頭に「- [ ] 」を挿入" },
  { id: "createTaskItem", label: "項目作成", desc: "タスク: 新規フォームを開く（開いていれば送信）／メモ: 新規メモ／単語帳: カード追加欄へ" },
  { id: "save", label: "保存", desc: "編集中のタスク・メモ・カードを保存" },
  { id: "cancel", label: "キャンセル", desc: "編集を閉じる（メモは未保存なら確認、タスクの下書きは保持）" },
];

/** 変更不可の固定キー。設定画面での一覧表示用。 */
const FIXED_SHORTCUTS: { scope: string; keys: { key: string; desc: string }[] }[] = [
  {
    scope: "ディレクトリツリー（タスク・メモ）",
    keys: [
      { key: "↑ / ↓", desc: "前後の項目へ移動" },
      { key: "→", desc: "フォルダを開く／開いていれば最初の子へ" },
      { key: "←", desc: "フォルダを閉じる／閉じていれば親フォルダへ" },
      { key: "Home / End", desc: "先頭／末尾へ" },
      { key: "Enter / Space", desc: "フォルダを選択・開閉／項目を開く" },
      { key: "F2", desc: "フォルダをリネーム" },
      { key: "Shift+F10", desc: "コンテキストメニューを開く（↑↓で移動、→で下位メニュー）" },
      { key: "/", desc: "ツリー検索欄へフォーカス" },
      { key: "Tab", desc: "ツリーへ入る／出る（ツリー内は1つのタブ位置として扱う）" },
    ],
  },
  {
    scope: "単語帳 カード一覧（行にフォーカス時）",
    keys: [
      { key: "↑ / ↓", desc: "前後のカードへ移動" },
      { key: "Space", desc: "選択の切替（チェックボックスは Shift+クリックで範囲選択）" },
      { key: "Enter", desc: "編集" },
      { key: "M", desc: "★マーク切替" },
      { key: "Delete", desc: "削除（確認あり）" },
    ],
  },
  {
    scope: "単語帳 学習画面",
    keys: [
      { key: "Space / Enter", desc: "答えを見る" },
      { key: "← / 1", desc: "不正解" },
      { key: "→ / 2", desc: "正解" },
      { key: "M", desc: "★マーク切替" },
    ],
  },
  {
    scope: "メモ編集",
    keys: [
      { key: IS_MAC ? "⌘+F / ⌘+H" : "Ctrl+F / Ctrl+H", desc: "本文の検索／置換" },
    ],
  },
  {
    scope: "ダイアログ",
    keys: [
      { key: "Escape", desc: "閉じる（キャンセル）" },
      { key: "Enter", desc: "フォーカス中のボタンを実行（危険操作はキャンセル側に初期フォーカス）" },
    ],
  },
];

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
        タスク・メモ・単語帳で共通に使うキー割当。全デバイスで同期されます。
        ボタンを押してから割り当てたいキーを入力してください。
        <span className="ml-1 text-slate-400">
          {IS_MAC
            ? "Windows 側で設定した Ctrl は、この Mac では ⌘ として動作します（⌃ は Mac 固有のキーとして別扱い）。"
            : "Mac 側では Ctrl が ⌘(Command) として動作します。"}
        </span>
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
                {capturing === action.id ? "キーを入力..." : formatBinding(bindingOf(action.id))}
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

      <details className="rounded border border-slate-200 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-slate-600">固定のキー操作一覧</summary>
        <div className="mt-2 space-y-3">
          {FIXED_SHORTCUTS.map((group) => (
            <div key={group.scope}>
              <div className="mb-1 text-[11px] font-semibold text-slate-500">{group.scope}</div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                {group.keys.map((k) => (
                  <Fragment key={k.key}>
                    <dt className="font-mono text-slate-700">{k.key}</dt>
                    <dd className="text-slate-500">{k.desc}</dd>
                  </Fragment>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
