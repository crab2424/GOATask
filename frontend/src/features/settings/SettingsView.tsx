import { BackupView } from "../backup/BackupView";
import { NAV_ITEMS, type Mode } from "../../app/navigation";
import type { Theme } from "../../shared/lib/useTheme";

const THEME_OPTIONS: { id: Theme; label: string; desc: string }[] = [
  { id: "light", label: "ライト", desc: "常に明るいテーマ" },
  { id: "dark", label: "ダーク", desc: "常に暗いテーマ" },
  { id: "system", label: "システム", desc: "OSの設定に追従" },
];

interface SettingsViewProps {
  username: string;
  health: string;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  startupMode: Mode;
  onStartupModeChange: (mode: Mode) => void;
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
        <h3 className="text-sm font-semibold text-slate-700">外観</h3>
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-600">テーマ（この端末のみ）</p>
          <div className="flex gap-2">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => props.onThemeChange(option.id)}
                title={option.desc}
                className={`rounded border px-3 py-1.5 text-xs transition-colors ${
                  props.theme === option.id
                    ? "border-slate-900 bg-slate-900 font-semibold text-white"
                    : "border-slate-300 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1 border-t border-slate-200 pt-3">
          <label className="block text-xs font-medium text-slate-600">起動時に開くモード（この端末のみ）</label>
          <select
            value={props.startupMode}
            onChange={(event) => props.onStartupModeChange(event.target.value as Mode)}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
          >
            {NAV_ITEMS.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-700">バックアップ</h3>
        <BackupView embedded />
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-700">通知</h3>
        <p className="text-xs text-slate-400">時刻通知機能の実装後に設定項目が追加されます。</p>
      </section>
    </div>
  );
}
