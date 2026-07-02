import { useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { AuthField, AuthFormShell } from "../components/AuthFormShell";

interface SignupViewProps {
  onSwitchToLogin: () => void;
}

const USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/;

export function SignupView({ onSwitchToLogin }: SignupViewProps) {
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!USERNAME_RE.test(username)) {
      setError("ユーザー名は英数字とアンダースコアで3〜32文字にしてください");
      return;
    }
    if (password.length < 8) {
      setError("パスワードは8文字以上にしてください");
      return;
    }
    if (password !== passwordConfirm) {
      setError("パスワード確認が一致しません");
      return;
    }
    if (!inviteCode) {
      setError("招待コードを入力してください");
      return;
    }
    setSubmitting(true);
    try {
      await register(username, password, inviteCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFormShell
      title="新規登録"
      subtitle="招待コードを入力してアカウントを作成します"
      onSubmit={onSubmit}
      error={error}
      submitting={submitting}
      submitLabel="登録"
      submittingLabel="登録中..."
      footer={
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-slate-600 underline hover:text-slate-900"
        >
          既にアカウントをお持ちの方はログイン
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
        label="パスワード（8文字以上）"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        required
        minLength={8}
      />
      <AuthField
        label="パスワード確認"
        type="password"
        value={passwordConfirm}
        onChange={setPasswordConfirm}
        autoComplete="new-password"
        required
        minLength={8}
      />
      <AuthField
        label="招待コード"
        type="text"
        value={inviteCode}
        onChange={setInviteCode}
        required
      />
    </AuthFormShell>
  );
}
