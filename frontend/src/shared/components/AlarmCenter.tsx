import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchUserSettings, type Alarm } from "../../api/settings";
import { claimDueAlarms, isAlarmMuted, useAlarmMuted } from "../lib/alarms";
import { installAudioUnlock, playAlarmSound, stopAlarmSound } from "../lib/alarmSound";

const CHECK_INTERVAL_MS = 10 * 1000;

type SoundState = "playing" | "muted" | "blocked" | "stopped";

interface Ringing {
  key: string;
  alarm: Alarm;
  at: number;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function showOsNotification(alarm: Alarm, muted: boolean) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  // 画面を見ているときはアプリ内バナーで十分なので、OS通知は裏にいるときだけ出す
  if (!document.hidden && document.hasFocus()) return;
  try {
    const n = new Notification(`⏰ ${alarm.label || "アラーム"}`, {
      body: `${alarm.time}${muted ? "（GOATaskはミュート中）" : ""}`,
      tag: `goatask-alarm-${alarm.id}`,
      requireInteraction: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Notification コンストラクタ非対応環境（Android Chrome など）は画面内表示のみ
  }
}

/**
 * 時刻通知の本体。ログイン中は常にマウントし、10秒ごと＋タブ復帰時に発火判定する。
 * 鳴っている間は画面上部にバナーを出し、タブが裏にあればタイトルを点滅させる。
 */
export function AlarmCenter() {
  const settingsQuery = useQuery({ queryKey: ["userSettings"], queryFn: fetchUserSettings });
  const alarms = settingsQuery.data?.alarms;
  const [ringing, setRinging] = useState<Ringing[]>([]);
  const [rawSound, setSound] = useState<SoundState>("stopped");
  const muted = useAlarmMuted();
  // 鳴動中にミュートされたら表示もミュート扱いにする（音は下の effect で止める）
  const sound: SoundState = muted && rawSound === "playing" ? "muted" : rawSound;

  useEffect(() => installAudioUnlock(), []);

  const ring = useCallback(async () => {
    if (isAlarmMuted()) {
      setSound("muted");
      return;
    }
    setSound((await playAlarmSound()) ? "playing" : "blocked");
  }, []);

  useEffect(() => {
    const check = () => {
      if (!alarms?.length) return;
      const due = claimDueAlarms(alarms, new Date());
      if (due.length === 0) return;
      setRinging((prev) => [
        ...prev,
        ...due.map(({ alarm, at }) => ({ key: `${alarm.id}:${at}`, alarm, at })),
      ]);
      due.forEach(({ alarm }) => showOsNotification(alarm, isAlarmMuted()));
      void ring();
    };
    check();
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [alarms, ring]);

  // 鳴動中にミュートしたら即座に止める
  useEffect(() => {
    if (muted) stopAlarmSound();
  }, [muted]);

  // タブが裏にある間はタイトルを点滅させる
  const active = ringing.length > 0;
  const firstLabel = ringing[0]?.alarm.label || "アラーム";
  useEffect(() => {
    if (!active) return;
    const original = document.title;
    let on = false;
    const timer = window.setInterval(() => {
      on = document.hidden ? !on : false;
      document.title = on ? `⏰ ${firstLabel}` : original;
    }, 1000);
    return () => {
      window.clearInterval(timer);
      document.title = original;
    };
  }, [active, firstLabel]);

  const dismissAll = () => {
    stopAlarmSound();
    setSound("stopped");
    setRinging([]);
  };

  const dismissOne = (key: string) => {
    const rest = ringing.filter((r) => r.key !== key);
    setRinging(rest);
    if (rest.length === 0) {
      stopAlarmSound();
      setSound("stopped");
    }
  };

  if (!active) return null;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label="時刻通知"
      className="fixed left-1/2 top-3 z-[70] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-amber-300 bg-white p-3 shadow-xl"
    >
      <ul className="space-y-1">
        {ringing.map((r) => (
          <li key={r.key} className="flex items-center gap-2">
            <span className="text-xl" aria-hidden>⏰</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-900">{r.alarm.label || "アラーム"}</div>
              <div className="text-xs text-slate-500">{formatTime(r.at)}</div>
            </div>
            {ringing.length > 1 && (
              <button
                type="button"
                onClick={() => dismissOne(r.key)}
                aria-label="この通知を閉じる"
                className="rounded px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {sound === "muted" && (
        <p className="mt-2 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">🔇 ミュート中のため音は鳴りません</p>
      )}
      {sound === "blocked" && (
        <div className="mt-2 flex items-center gap-2 rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">
          <span className="flex-1">🔇 ブラウザが自動再生をブロックしました</span>
          <button
            type="button"
            onClick={() => void ring()}
            className="shrink-0 rounded border border-rose-300 px-2 py-0.5 font-semibold hover:bg-rose-100"
          >
            ▶ 鳴らす
          </button>
        </div>
      )}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          autoFocus
          onClick={dismissAll}
          className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
        >
          {sound === "playing" ? "停止" : "閉じる"}
        </button>
      </div>
    </div>
  );
}
