import { useSyncExternalStore } from "react";
import type { Alarm } from "../../api/settings";

/** 発火予定時刻からこの時間以内なら鳴らす。バックグラウンドタブのタイマー間引きやスリープ復帰の遅れを吸収する。 */
export const ALARM_GRACE_MS = 5 * 60 * 1000;

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function parseTime(time: string): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? [h, min] : null;
}

function atTime(day: Date, h: number, min: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, min, 0, 0);
}

/**
 * now 以前で最も新しい発火予定時刻(ms)を返す。該当なしなら null。
 * 日付をまたぐ猶予のため、毎日・曜日指定は今日と昨日の2候補を見る。
 */
export function latestOccurrence(alarm: Alarm, now: Date): number | null {
  const hm = parseTime(alarm.time);
  if (!hm) return null;
  if (alarm.repeat === "once") {
    if (!alarm.date) return null;
    const [y, mo, d] = alarm.date.split("-").map(Number);
    const t = new Date(y, mo - 1, d, hm[0], hm[1]).getTime();
    return t <= now.getTime() ? t : null;
  }
  for (const back of [0, 1]) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    if (alarm.repeat === "weekly" && !(alarm.days ?? []).includes(day.getDay())) continue;
    const t = atTime(day, hm[0], hm[1]).getTime();
    if (t <= now.getTime()) return t;
  }
  return null;
}

/** 次の発火予定時刻(ms)。一覧の「次回」表示用。 */
export function nextOccurrence(alarm: Alarm, now: Date): number | null {
  const hm = parseTime(alarm.time);
  if (!hm) return null;
  if (alarm.repeat === "once") {
    if (!alarm.date) return null;
    const [y, mo, d] = alarm.date.split("-").map(Number);
    const t = new Date(y, mo - 1, d, hm[0], hm[1]).getTime();
    return t > now.getTime() ? t : null;
  }
  for (let ahead = 0; ahead <= 7; ahead++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead);
    if (alarm.repeat === "weekly" && !(alarm.days ?? []).includes(day.getDay())) continue;
    const t = atTime(day, hm[0], hm[1]).getTime();
    if (t > now.getTime()) return t;
  }
  return null;
}

export function describeRepeat(alarm: Alarm): string {
  if (alarm.repeat === "once") return alarm.date ?? "";
  if (alarm.repeat === "daily") return "毎日";
  const days = [...(alarm.days ?? [])].sort();
  return days.length ? `毎週 ${days.map((d) => WEEKDAY_LABELS[d]).join("・")}` : "曜日未指定";
}

// ---- 発火済みの記録（同じブラウザの複数タブで二重に鳴らさないため localStorage で共有） ----

const FIRED_KEY = "goatask:alarmFired";

function readFired(): Record<string, number> {
  try {
    return JSON.parse(window.localStorage.getItem(FIRED_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

/**
 * 鳴らすべきアラームを「発火済み」に記録しながら返す。
 * 記録してから返すので、呼び出し側は戻り値を必ず鳴らすこと。
 */
export function claimDueAlarms(alarms: Alarm[], now: Date): { alarm: Alarm; at: number }[] {
  const fired = readFired();
  const due: { alarm: Alarm; at: number }[] = [];
  for (const alarm of alarms) {
    if (!alarm.enabled) continue;
    const at = latestOccurrence(alarm, now);
    if (at === null) continue;
    if (now.getTime() - at > ALARM_GRACE_MS) continue;
    if (at <= alarm.updatedAt) continue;
    if ((fired[alarm.id] ?? 0) >= at) continue;
    fired[alarm.id] = at;
    due.push({ alarm, at });
  }
  if (due.length > 0) {
    // 削除済みアラームの記録を掃除してから保存する
    const ids = new Set(alarms.map((a) => a.id));
    for (const id of Object.keys(fired)) if (!ids.has(id)) delete fired[id];
    try {
      window.localStorage.setItem(FIRED_KEY, JSON.stringify(fired));
    } catch {
      // 保存できない環境では別タブでも鳴る可能性があるが、通知自体は行う
    }
  }
  return due;
}

// ---- ミュート（端末ごと・localStorage保存） ----

const MUTE_KEY = "goatask:alarmMuted";
const muteListeners = new Set<() => void>();

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

let muted = readMuted();

export function isAlarmMuted(): boolean {
  return muted;
}

export function setAlarmMuted(value: boolean) {
  muted = value;
  try {
    window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // 保存できなくてもこのタブ内では切り替わる
  }
  muteListeners.forEach((fn) => fn());
}

// 別タブでミュートを切り替えたときも追従する
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== MUTE_KEY) return;
    muted = readMuted();
    muteListeners.forEach((fn) => fn());
  });
}

export function useAlarmMuted(): boolean {
  return useSyncExternalStore(
    (fn) => {
      muteListeners.add(fn);
      return () => muteListeners.delete(fn);
    },
    () => muted,
  );
}
