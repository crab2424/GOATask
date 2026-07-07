interface SettingsViewProps {
  username: string;
  health: string;
  onLogout: () => void;
}

export function SettingsView(props: SettingsViewProps) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h2 className="text-xl font-bold text-slate-900">設定</h2>
      </header>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-700">アカウント</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">ユーザー名</dt>
            <dd className="font-mono text-slate-800">{props.username}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">API</dt>
            <dd className="font-mono text-slate-800">{props.health}</dd>
          </div>
        </dl>
        <div className="border-t border-slate-200 pt-3">
          <button
            onClick={props.onLogout}
            className="rounded border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50"
          >
            ログアウト
          </button>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-700">通知</h3>
        <p className="text-xs text-slate-400">時刻通知機能の実装後に設定項目が追加されます。</p>
      </section>
    </div>
  );
}
