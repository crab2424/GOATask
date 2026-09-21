import { useQuery } from "@tanstack/react-query";
import { fetchUserSettings } from "../../api/settings";
import { setAlarmMuted, useAlarmMuted } from "../lib/alarms";

/**
 * 通知音のミュート切替。有効なアラームがあるか、ミュート中のときだけ表示する。
 * - icon: スマホヘッダー / 畳んだPCサイドバー用のアイコンのみ
 * - row: PCサイドバー下部の行表示（collapsed で畳んだサイドバー用にアイコンのみ）
 */
export function AlarmMuteButton({ variant, collapsed = false }: { variant: "icon" | "row"; collapsed?: boolean }) {
  const settingsQuery = useQuery({ queryKey: ["userSettings"], queryFn: fetchUserSettings });
  const muted = useAlarmMuted();
  const hasAlarms = (settingsQuery.data?.alarms ?? []).some((a) => a.enabled);
  if (!hasAlarms && !muted) return null;

  const icon = muted ? "🔕" : "🔔";
  const label = muted ? "通知音ミュート中" : "通知音ON";
  const title = muted ? "通知音はミュート中です（クリックで解除）" : "通知音ON（クリックでミュート）";
  const tone = muted ? "text-rose-600 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-100";

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={() => setAlarmMuted(!muted)}
        title={title}
        aria-label={title}
        aria-pressed={muted}
        className={`shrink-0 rounded p-1 text-base leading-none transition-colors ${tone}`}
      >
        {icon}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setAlarmMuted(!muted)}
      title={title}
      aria-pressed={muted}
      aria-label={collapsed ? title : undefined}
      className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm transition-colors ${tone} ${muted ? "font-semibold" : ""} ${collapsed ? "justify-center" : ""}`}
    >
      <span className="w-5 shrink-0 text-center">{icon}</span>
      {!collapsed && <span>{label}</span>}
    </button>
  );
}
