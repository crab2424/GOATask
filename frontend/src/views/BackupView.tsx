import { useState } from "react";
import {
  backupFilename,
  downloadJson,
  fetchBackup,
  type BackupScope,
} from "../api/backup";

const SCOPES: { id: BackupScope; label: string; desc: string }[] = [
  { id: "all", label: "全データ", desc: "タスク・メモ・単語帳をまとめて1ファイル" },
  { id: "tasks", label: "タスク", desc: "tasks / subtasks / projects" },
  { id: "memos", label: "メモ", desc: "memos / folders" },
  { id: "decks", label: "単語帳", desc: "decks / cards" },
];

export function BackupView() {
  const [busy, setBusy] = useState<BackupScope | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onExport = async (scope: BackupScope) => {
    setBusy(scope);
    setError(null);
    try {
      const data = await fetchBackup(scope);
      downloadJson(data, backupFilename(scope));
    } catch (e) {
      setError(e instanceof Error ? e.message : "エクスポートに失敗しました");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h2 className="text-xl font-bold text-slate-900">バックアップ</h2>
        <p className="mt-1 text-sm text-slate-500">
          ローカルと本番(Render)のデータをJSONファイルで往復させるためのページ。
        </p>
      </header>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-700">エクスポート</h3>
        <p className="text-xs text-slate-500">
          選択した範囲のデータを JSON ファイルとしてダウンロードします。
        </p>
        <ul className="space-y-2">
          {SCOPES.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded border border-slate-200 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800">
                  {s.label}
                </div>
                <div className="text-[11px] text-slate-500">{s.desc}</div>
              </div>
              <button
                onClick={() => onExport(s.id)}
                disabled={busy !== null}
                className="shrink-0 rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
              >
                {busy === s.id ? "取得中..." : "ダウンロード"}
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <p className="text-xs text-red-600">{error}</p>
        )}
      </section>

      <section className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold text-slate-600">インポート</h3>
        <p className="mt-1 text-xs text-slate-500">
          次回の実装で追加予定です。
        </p>
      </section>
    </div>
  );
}
