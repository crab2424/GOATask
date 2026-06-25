import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  backupFilename,
  downloadJson,
  fetchBackup,
  importBackup,
  type BackupScope,
  type ImportMode,
  type ImportResult,
} from "../api/backup";

const SCOPES: { id: BackupScope; label: string; desc: string }[] = [
  { id: "all", label: "全データ", desc: "タスク・メモ・単語帳をまとめて1ファイル" },
  { id: "tasks", label: "タスク", desc: "tasks / subtasks / projects" },
  { id: "memos", label: "メモ", desc: "memos / folders" },
  { id: "decks", label: "単語帳", desc: "decks / cards" },
];

const TOKEN_KEY = "goatask:backupToken";

export function BackupView() {
  const queryClient = useQueryClient();
  const [busyScope, setBusyScope] = useState<BackupScope | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<{
    scope: string;
    version: number;
    counts: Record<string, number>;
  } | null>(null);
  const [mode, setMode] = useState<ImportMode>("merge");
  const [token, setToken] = useState<string>(
    () => window.localStorage.getItem(TOKEN_KEY) ?? "",
  );
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onExport = async (scope: BackupScope) => {
    setBusyScope(scope);
    setExportError(null);
    try {
      const data = await fetchBackup(scope);
      downloadJson(data, backupFilename(scope));
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "エクスポートに失敗しました");
    } finally {
      setBusyScope(null);
    }
  };

  const onFileChange = async (f: File | null) => {
    setFile(f);
    setParsed(null);
    setImportError(null);
    setImportResult(null);
    if (!f) return;
    try {
      const text = await f.text();
      const json = JSON.parse(text);
      if (typeof json !== "object" || json === null) {
        throw new Error("invalid JSON");
      }
      const scope = String(json.scope ?? "all");
      const version = Number(json.version ?? 0);
      const counts: Record<string, number> = {};
      for (const k of ["tasks", "subtasks", "projects", "memos", "folders", "decks", "cards"]) {
        if (Array.isArray(json[k])) counts[k] = json[k].length;
      }
      setParsed({ scope, version, counts });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "JSONの読み込みに失敗");
    }
  };

  const startImport = () => {
    if (!file || !parsed) return;
    setConfirmOpen(true);
  };

  const runImport = async () => {
    if (!file) return;
    setConfirmOpen(false);
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      // replace の前に安全策として現在の状態を自動DL
      if (mode === "replace") {
        try {
          const scope = (parsed?.scope as BackupScope) ?? "all";
          const safeScope: BackupScope = ["all", "tasks", "memos", "decks"].includes(scope)
            ? (scope as BackupScope)
            : "all";
          const snapshot = await fetchBackup(safeScope);
          downloadJson(snapshot, `goatask-pre-import-${safeScope}-${Date.now()}.json`);
        } catch {
          // 取得失敗しても本処理は続行（ユーザーが上書きを了承済み）
        }
      }
      const text = await file.text();
      const json = JSON.parse(text);
      const result = await importBackup(json, mode, token || undefined);
      setImportResult(result);
      window.localStorage.setItem(TOKEN_KEY, token);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["memos"] }),
        queryClient.invalidateQueries({ queryKey: ["folders"] }),
        queryClient.invalidateQueries({ queryKey: ["decks"] }),
      ]);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "インポートに失敗しました");
    } finally {
      setImporting(false);
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
                <div className="text-sm font-medium text-slate-800">{s.label}</div>
                <div className="text-[11px] text-slate-500">{s.desc}</div>
              </div>
              <button
                onClick={() => onExport(s.id)}
                disabled={busyScope !== null}
                className="shrink-0 rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
              >
                {busyScope === s.id ? "取得中..." : "ダウンロード"}
              </button>
            </li>
          ))}
        </ul>
        {exportError && <p className="text-xs text-red-600">{exportError}</p>}
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-700">インポート</h3>
        <p className="text-xs text-slate-500">
          エクスポートで作った JSON ファイルから復元します。
          <span className="font-semibold text-red-600">全置換モード</span>
          は既存データを完全に置き換えるため、実行直前に現在の状態を自動DLします。
        </p>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-600">ファイル</label>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-slate-700 file:mr-2 file:rounded file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-700"
          />
          {parsed && (
            <div className="rounded bg-slate-50 p-2 text-[11px] text-slate-600">
              <div>
                scope: <span className="font-mono">{parsed.scope}</span> / version:{" "}
                <span className="font-mono">{parsed.version}</span>
              </div>
              <div className="mt-1">
                {Object.entries(parsed.counts).map(([k, v]) => (
                  <span key={k} className="mr-3">
                    {k}: <span className="font-mono">{v}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-600">モード</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="radio"
                name="mode"
                value="merge"
                checked={mode === "merge"}
                onChange={() => setMode("merge")}
              />
              <span>マージ（既存を残して追加）</span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="radio"
                name="mode"
                value="replace"
                checked={mode === "replace"}
                onChange={() => setMode("replace")}
              />
              <span className="font-semibold text-red-600">全置換（削除して投入）</span>
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-600">
            BACKUP_TOKEN（サーバーで設定している場合）
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="未設定なら空欄でOK"
            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={startImport}
            disabled={!file || !parsed || importing}
            className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            {importing ? "インポート中..." : "インポート実行"}
          </button>
          {importResult && (
            <span className="text-xs text-green-700">
              ✓ 完了：
              {Object.entries(importResult.inserted)
                .map(([k, v]) => `${k}=${v}`)
                .join(", ")}
            </span>
          )}
        </div>
        {importError && <p className="text-xs text-red-600">{importError}</p>}
      </section>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-lg bg-white p-4 shadow-xl">
            <h4 className="text-sm font-semibold text-slate-900">
              {mode === "replace" ? "全置換を実行しますか？" : "マージを実行しますか？"}
            </h4>
            <p className="text-xs text-slate-600">
              {mode === "replace"
                ? "対象スコープの既存データを全削除してから投入します。実行前に現在の状態を自動でダウンロードします。"
                : "既存データはそのまま、ファイル内のレコードを追加します。重複は手動で整理してください。"}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
              >
                キャンセル
              </button>
              <button
                onClick={runImport}
                className={`rounded px-3 py-1.5 text-xs font-semibold text-white ${
                  mode === "replace"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-slate-900 hover:bg-slate-700"
                }`}
              >
                実行
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
