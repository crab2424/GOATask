import { useState } from "react";
import { changePassword } from "../../api/auth";

export function PasswordChangeForm() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setOpen(true); setDone(false); }}
          className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition-colors hover:bg-slate-100"
        >
          パスワードを変更
        </button>
        {done && <span className="text-xs text-green-700">✓ 変更しました（他デバイスは再ログインが必要）</span>}
      </div>
    );
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("新しいパスワードが確認欄と一致しません");
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      setOpen(false);
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "パスワード変更に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="max-w-xs space-y-2">
      <div>
        <label className="block text-xs font-medium text-slate-600">現在のパスワード</label>
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">新しいパスワード（8文字以上）</label>
        <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} maxLength={72} className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600">新しいパスワード（確認）</label>
        <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs" />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50">
          {busy ? "変更中..." : "変更する"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100">
          キャンセル
        </button>
      </div>
    </form>
  );
}
