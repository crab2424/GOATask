import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileShare, deleteFile, listFiles, uploadFile, type SharedFile } from "../../api/files";
import { useDialogs } from "../../shared/components/DialogProvider";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
}

export function FilesView() {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { confirmDialog } = useDialogs();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 直近に発行した共有リンク。クリップボードや新規タブがブラウザに止められても
  // ここから取り出せるよう、画面に表示する。
  const [shareInfo, setShareInfo] = useState<{ filename: string; url: string; expiresAt: string } | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const filesQuery = useQuery({ queryKey: ["files"], queryFn: listFiles });
  const uploadMutation = useMutation({
    mutationFn: uploadFile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["files"] });
      setMessage("アップロードしました");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteFile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["files"] });
      setMessage("ファイルを削除しました");
    },
  });

  const files = filesQuery.data?.files ?? [];
  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setMessage(null);
    try {
      await uploadMutation.mutateAsync(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleShare = async (file: SharedFile) => {
    setError(null);
    setMessage(null);
    try {
      const share = await createFileShare(file.id);
      setShareInfo({ filename: file.filename, url: share.url, expiresAt: share.expires_at });
      setShareCopied(false);
      try {
        await navigator.clipboard.writeText(share.url);
        setMessage(`共有リンクをコピーしました（${formatDate(share.expires_at)}まで）`);
      } catch {
        setMessage(`共有リンクを発行しました（${formatDate(share.expires_at)}まで）`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "共有リンクの発行に失敗しました");
    }
  };

  const handleDelete = async (file: SharedFile) => {
    if (!(await confirmDialog({ title: `${file.filename}を削除しますか？`, message: "共有リンクもこのファイルへのアクセスも利用できなくなります。", confirmLabel: "削除", cancelLabel: "キャンセル", danger: true }))) return;
    setError(null);
    setMessage(null);
    try {
      await deleteMutation.mutateAsync(file.id);
      setShareInfo((info) => (info?.filename === file.filename ? null : info));
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">ファイル共有</h2>
          <p className="mt-1 text-sm text-slate-500">非公開ストレージに保存し、7日間の共有リンクを発行します。</p>
        </div>
        <button onClick={() => inputRef.current?.click()} disabled={uploadMutation.isPending} className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
          {uploadMutation.isPending ? "アップロード中…" : "ファイルを追加"}
        </button>
        <input ref={inputRef} type="file" className="hidden" onChange={(event) => void handleUpload(event.target.files?.[0])} />
      </header>

      {(error || filesQuery.error) && <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error ?? (filesQuery.error instanceof Error ? filesQuery.error.message : "ファイル一覧の取得に失敗しました")}</div>}
      {message && <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>}
      {shareInfo && (
        <div className="space-y-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 break-words text-slate-700">
              <span className="font-semibold">{shareInfo.filename}</span> の共有リンク
              <span className="ml-1 text-xs text-slate-500">（{formatDate(shareInfo.expiresAt)}まで有効）</span>
            </p>
            <button onClick={() => setShareInfo(null)} aria-label="共有リンクの表示を閉じる" className="shrink-0 rounded px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">×</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={shareInfo.url}
              onFocus={(event) => event.currentTarget.select()}
              aria-label="共有リンクのURL"
              className="min-w-0 flex-1 rounded border border-slate-300 bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-700"
            />
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareInfo.url);
                  setShareCopied(true);
                } catch {
                  setError("コピーできませんでした。URLを選択して手動でコピーしてください。");
                }
              }}
              className="shrink-0 rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              {shareCopied ? "コピーしました" : "コピー"}
            </button>
            <a href={shareInfo.url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">開く</a>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
          <div>保存済みファイル（{files.length}）</div>
          {filesQuery.data && (
            <div className="mt-1 text-xs font-normal text-slate-500">
              容量: {formatBytes(filesQuery.data.used_bytes)} / {formatBytes(filesQuery.data.max_bytes)}
              <span className="ml-2">残り {formatBytes(filesQuery.data.remaining_bytes)}</span>
            </div>
          )}
        </div>
        {filesQuery.isLoading ? <p className="p-6 text-sm text-slate-500">読み込み中…</p> : files.length === 0 ? <p className="p-6 text-sm text-slate-500">まだファイルがありません。</p> : (
          <ul className="divide-y divide-slate-100">
            {files.map((file) => (
              <li key={file.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800" title={file.filename}>{file.filename}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatBytes(file.size)} · {file.content_type} · {formatDate(file.created_at)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => void handleShare(file)} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">共有リンク</button>
                  <button onClick={() => void handleDelete(file)} disabled={deleteMutation.isPending} className="rounded border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">削除</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
