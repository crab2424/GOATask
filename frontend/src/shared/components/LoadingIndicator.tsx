interface LoadingIndicatorProps {
  /** 添えるテキスト。省略時は「読み込み中...」 */
  label?: string;
  /** 画面全体の中央に表示する場合true。falseはインライン（セクション内）表示 */
  fullscreen?: boolean;
}

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function LoadingIndicator({ label = "読み込み中...", fullscreen = false }: LoadingIndicatorProps) {
  const body = (
    <div className="flex items-center justify-center gap-2 text-sm text-slate-500" role="status">
      <Spinner />
      <span>{label}</span>
    </div>
  );
  if (fullscreen) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50">{body}</div>;
  }
  return <div className="py-10">{body}</div>;
}
