import { useState } from "react";
import { useAuth } from "../lib/AuthContext";

export function LoginView() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ログインに失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-bold text-slate-900">GOATask</h1>
        <p className="text-xs text-slate-500">ログインしてください</p>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">ユーザー名</span>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">パスワード</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            required
          />
        </label>

        {error && (
          <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:bg-slate-400"
        >
          {submitting ? "ログイン中..." : "ログイン"}
        </button>
      </form>
    </div>
  );
}
