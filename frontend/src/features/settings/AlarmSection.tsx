import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchUserSettings,
  saveUserSettings,
  type Alarm,
  type AlarmRepeat,
  type UserSettings,
} from "../../api/settings";
import { LoadingIndicator } from "../../shared/components/LoadingIndicator";
import {
  describeRepeat,
  nextOccurrence,
  setAlarmMuted,
  useAlarmMuted,
  WEEKDAY_LABELS,
} from "../../shared/lib/alarms";
import { playAlarmSound, stopAlarmSound } from "../../shared/lib/alarmSound";

type Draft = Omit<Alarm, "updatedAt">;

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyDraft(): Draft {
  return { id: newId(), label: "", time: "09:00", repeat: "daily", date: todayString(), days: [1, 2, 3, 4, 5], enabled: true };
}

function formatNext(ms: number | null): string {
  if (ms === null) return "予定なし";
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return sameDay ? `今日 ${hm}` : `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_LABELS[d.getDay()]}) ${hm}`;
}

function draftError(draft: Draft): string | null {
  if (!/^\d{2}:\d{2}$/.test(draft.time)) return "時刻を入力してください";
  if (draft.repeat === "once" && !draft.date) return "日付を入力してください";
  if (draft.repeat === "weekly" && !(draft.days ?? []).length) return "曜日を1つ以上選んでください";
  return null;
}

export function AlarmSection() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["userSettings"], queryFn: fetchUserSettings });
  const muted = useAlarmMuted();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [testing, setTesting] = useState<"idle" | "playing" | "blocked">("idle");
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    "Notification" in window ? Notification.permission : "unsupported",
  );

  const mutation = useMutation({
    mutationFn: (settings: UserSettings) => saveUserSettings(settings),
    onSuccess: (data) => queryClient.setQueryData(["userSettings"], data),
  });

  const alarms = settingsQuery.data?.alarms ?? [];

  const saveAlarms = (next: Alarm[]) => {
    // 他端末の変更を取りこぼさないよう、キャッシュ上の最新値に alarms だけ差し替える
    const current = queryClient.getQueryData<UserSettings>(["userSettings"]) ?? {};
    mutation.mutate({ ...current, alarms: next });
  };

  const commitDraft = () => {
    if (!draft || draftError(draft)) return;
    const alarm: Alarm = {
      ...draft,
      label: draft.label.trim(),
      date: draft.repeat === "once" ? draft.date : undefined,
      days: draft.repeat === "weekly" ? [...(draft.days ?? [])].sort() : undefined,
      updatedAt: Date.now(),
    };
    const exists = alarms.some((a) => a.id === alarm.id);
    const next = exists ? alarms.map((a) => (a.id === alarm.id ? alarm : a)) : [...alarms, alarm];
    next.sort((a, b) => a.time.localeCompare(b.time));
    saveAlarms(next);
    setDraft(null);
  };

  const testSound = async () => {
    if (testing === "playing") {
      stopAlarmSound();
      setTesting("idle");
      return;
    }
    // ボタン押下（ユーザー操作）の中で鳴らすので、ここでは自動再生ブロックを受けない
    const ok = await playAlarmSound();
    setTesting(ok ? "playing" : "blocked");
    if (ok) {
      window.setTimeout(() => {
        stopAlarmSound();
        setTesting("idle");
      }, 2400);
    }
  };

  const requestPermission = async () => {
    if (!("Notification" in window)) return;
    setPermission(await Notification.requestPermission());
  };

  if (settingsQuery.isLoading) return <LoadingIndicator />;
  if (settingsQuery.isError) return <p className="text-xs text-red-600">通知設定の取得に失敗しました</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        指定した時刻に通知音を鳴らし、画面上部に通知を表示します。アラームは全デバイスで同期されます。
        <span className="ml-1 text-slate-400">GOATaskを開いているタブがある間だけ動作します（タブを閉じていると鳴りません）。</span>
      </p>

      <div className="space-y-2 rounded border border-slate-200 px-3 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-700">
            <input type="checkbox" checked={muted} onChange={(e) => setAlarmMuted(e.target.checked)} />
            通知音をミュート（この端末のみ）
          </label>
          <button
            type="button"
            onClick={() => void testSound()}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
          >
            {testing === "playing" ? "■ 停止" : "▶ 通知音を試聴"}
          </button>
          {testing === "blocked" && <span className="text-xs text-rose-600">再生できませんでした</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span>OS通知（タブが裏にあるとき）:</span>
          {permission === "granted" && <span className="text-green-700">許可済み</span>}
          {permission === "denied" && <span className="text-rose-600">ブロック中（ブラウザのサイト設定から許可してください）</span>}
          {permission === "unsupported" && <span className="text-slate-400">このブラウザでは使えません</span>}
          {permission === "default" && (
            <button
              type="button"
              onClick={() => void requestPermission()}
              className="rounded border border-slate-300 px-2 py-0.5 text-slate-700 hover:bg-slate-100"
            >
              許可する
            </button>
          )}
        </div>
      </div>

      {alarms.length === 0 && !draft && <p className="text-xs text-slate-400">アラームはまだありません。</p>}
      <ul className="space-y-2">
        {alarms.map((alarm) =>
          draft?.id === alarm.id ? (
            <li key={alarm.id}>
              <AlarmForm draft={draft} onChange={setDraft} onSubmit={commitDraft} onCancel={() => setDraft(null)} />
            </li>
          ) : (
            <li key={alarm.id} className="flex items-center gap-3 rounded border border-slate-200 px-3 py-2">
              <input
                type="checkbox"
                checked={alarm.enabled}
                aria-label={`${alarm.label || alarm.time} を有効にする`}
                onChange={(e) =>
                  saveAlarms(alarms.map((a) => (a.id === alarm.id ? { ...a, enabled: e.target.checked, updatedAt: Date.now() } : a)))
                }
              />
              <div className={`min-w-0 flex-1 ${alarm.enabled ? "" : "opacity-50"}`}>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-base font-semibold text-slate-900">{alarm.time}</span>
                  <span className="truncate text-sm text-slate-800">{alarm.label || "（名前なし）"}</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  {describeRepeat(alarm)} ・ 次回: {alarm.enabled ? formatNext(nextOccurrence(alarm, new Date())) : "無効"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDraft({ ...alarm, date: alarm.date ?? todayString(), days: alarm.days ?? [1, 2, 3, 4, 5] })}
                className="shrink-0 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
              >
                編集
              </button>
              <button
                type="button"
                onClick={() => saveAlarms(alarms.filter((a) => a.id !== alarm.id))}
                className="shrink-0 rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
              >
                削除
              </button>
            </li>
          ),
        )}
        {draft && !alarms.some((a) => a.id === draft.id) && (
          <li>
            <AlarmForm draft={draft} onChange={setDraft} onSubmit={commitDraft} onCancel={() => setDraft(null)} />
          </li>
        )}
      </ul>

      <div className="flex items-center gap-2">
        {!draft && (
          <button
            type="button"
            onClick={() => setDraft(emptyDraft())}
            className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
          >
            ＋ アラームを追加
          </button>
        )}
        {mutation.isPending && <span className="text-xs text-slate-500">保存中...</span>}
        {mutation.isError && (
          <span className="text-xs text-red-600">
            {mutation.error instanceof Error ? mutation.error.message : "保存に失敗しました"}
          </span>
        )}
      </div>
    </div>
  );
}

const REPEAT_OPTIONS: { id: AlarmRepeat; label: string }[] = [
  { id: "once", label: "1回のみ" },
  { id: "daily", label: "毎日" },
  { id: "weekly", label: "曜日指定" },
];

function AlarmForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const error = draftError(draft);
  const days = draft.days ?? [];
  return (
    <form
      className="space-y-2 rounded border border-blue-300 bg-blue-50/40 px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="time"
          required
          value={draft.time}
          onChange={(e) => onChange({ ...draft, time: e.target.value })}
          className="rounded border border-slate-300 bg-white px-2 py-1 font-mono text-sm text-slate-900"
        />
        <input
          type="text"
          autoFocus
          value={draft.label}
          maxLength={100}
          placeholder="名前（例: 会議）"
          onChange={(e) => onChange({ ...draft, label: e.target.value })}
          className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={draft.repeat}
          onChange={(e) => onChange({ ...draft, repeat: e.target.value as AlarmRepeat })}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
        >
          {REPEAT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        {draft.repeat === "once" && (
          <input
            type="date"
            value={draft.date ?? ""}
            onChange={(e) => onChange({ ...draft, date: e.target.value })}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
          />
        )}
        {draft.repeat === "weekly" && (
          <div className="flex gap-1">
            {WEEKDAY_LABELS.map((label, day) => {
              const on = days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ ...draft, days: on ? days.filter((d) => d !== day) : [...days, day] })}
                  className={`h-7 w-7 rounded-full border text-xs transition-colors ${
                    on ? "border-slate-900 bg-slate-900 font-semibold text-white" : "border-slate-300 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={error !== null}
          className="rounded bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          保存
        </button>
        <button type="button" onClick={onCancel} className="rounded px-3 py-1 text-xs text-slate-600 hover:bg-slate-100">
          キャンセル
        </button>
        {error && <span className="text-xs text-slate-500">{error}</span>}
      </div>
    </form>
  );
}
