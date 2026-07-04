import { useState } from "react";
import { useAuth } from "../lib/useAuth";
import { AuthField, AuthFormShell } from "../components/AuthFormShell";

interface LoginViewProps {
  onSwitchToSignup: () => void;
}

export function LoginView({ onSwitchToSignup }: LoginViewProps) {
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
    <AuthFormShell
      title="GOATask"
      subtitle="ログインしてください"
      onSubmit={onSubmit}
      error={error}
      submitting={submitting}
      submitLabel="ログイン"
      submittingLabel="ログイン中..."
      footer={
        <button
          type="button"
          onClick={onSwitchToSignup}
          className="text-slate-600 underline hover:text-slate-900"
        >
          新規登録はこちら
        </button>
      }
    >
      <AuthField
        label="ユーザー名"
        type="text"
        value={username}
        onChange={setUsername}
        autoComplete="username"
        required
      />
      <AuthField
        label="パスワード"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        required
      />
    </AuthFormShell>
  );
}
