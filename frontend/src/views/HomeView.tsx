import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listTasks,
  toggleSubtask,
  updateTask,
  type Subtask,
  type Task,
  type TaskStatus,
} from "../api/tasks";
import { MdText } from "../lib/mdInline";
import { stripBulletLines } from "../lib/taskText";

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "未着手",
  doing: "進行中",
  done: "完了",
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  todo: "bg-slate-200 text-slate-700",
  doing: "bg-amber-200 text-amber-800",
  done: "bg-emerald-200 text-emerald-800",
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function isSameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function Clock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString("ja-JP", { hour12: false });
  const date = now.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
      <p className="text-sm text-slate-500">{date}</p>
      <p className="mt-2 font-mono text-5xl font-bold tracking-tight">{time}</p>
    </div>
  );
}

function MiniCalendar({ onOpenCalendar, markedDates }: { onOpenCalendar: (date: string) => void; markedDates: Set<string> }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  const cells = (() => {
    const first = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0).getDate();
    const startOffset = first.getDay();
    const arr: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) arr.push(null);
    for (let d = 1; d <= lastDay; d++) arr.push(new Date(year, month, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  })();

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-center text-sm font-semibold text-slate-700">
        {year}年 {month + 1}月
      </h3>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`py-1 font-medium ${
              i === 0 ? "text-rose-500" : i === 6 ? "text-sky-500" : "text-slate-500"
            }`}
          >
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const isToday = isSameDate(d, today);
          const dow = d.getDay();
          return (
            <button
              key={i}
              onClick={() => onOpenCalendar(formatDate(d))}
              className={`flex h-8 items-center justify-center rounded ${
                isToday
                  ? "bg-slate-900 font-bold text-white"
                  : dow === 0
                    ? "text-rose-500"
                    : dow === 6
                      ? "text-sky-500"
                      : "text-slate-700"
              }`}
            >
              <span className="relative">{d.getDate()}{markedDates.has(formatDate(d)) && <span className={`absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${isToday ? "bg-white" : "bg-violet-500"}`} />}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function HomeView({ onOpenCalendar }: { onOpenCalendar: (date: string) => void }) {
  const queryClient = useQueryClient();
  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: listTasks });
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const error = mutationError
    ? mutationError
    : tasksQuery.error
    ? tasksQuery.error instanceof Error
      ? tasksQuery.error.message
      : String(tasksQuery.error)
    : null;

  const onToggleSubtask = async (taskId: number, sub: Subtask) => {
    try {
      await toggleSubtask(taskId, sub.id, !sub.done);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["calendar"] }),
      ]);
      setMutationError(null);
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : String(e));
    }
  };

  const onToggleDone = async (t: Task) => {
    try {
      const next: TaskStatus = t.status === "done" ? "todo" : "done";
      await updateTask(t.id, { ...t, status: next });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["calendar"] }),
      ]);
      setMutationError(null);
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : String(e));
    }
  };

  const [showDone, setShowDone] = useState(true);
  const todayStr = formatDate(new Date());
  const markedDates = useMemo(() => new Set(tasks.flatMap((t) => [t.start_date?.slice(0, 10), t.due_date?.slice(0, 10)].filter((d): d is string => Boolean(d)))), [tasks]);

  const stickyIds = useRef<Set<number>>(new Set());
  for (const t of tasks) {
    if (
      t.due_date != null &&
      (t.due_date.startsWith(todayStr) || t.status === "doing")
    ) {
      stickyIds.current.add(t.id);
    }
  }
  const allTodayTasks = tasks.filter((t) => stickyIds.current.has(t.id));
  const doneCount = allTodayTasks.filter((t) => t.status === "done").length;
  const todayTasks = showDone
    ? allTodayTasks
    : allTodayTasks.filter((t) => t.status !== "done");

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-bold">ホーム</h1>

      {error && (
        <div className="mb-4 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <Clock />
        </div>
        <div>
          <MiniCalendar onOpenCalendar={onOpenCalendar} markedDates={markedDates} />
        </div>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">今日やること</h2>
          {doneCount > 0 && (
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              {showDone ? `完了済みを非表示（${doneCount}）` : `完了済みを表示（${doneCount}）`}
            </button>
          )}
        </div>
        {todayTasks.length === 0 ? (
          <p className="text-sm text-slate-500">
            進行中のタスクも、今日が期日のタスクもありません。
          </p>
        ) : (
          <ul className="space-y-2">
            {todayTasks.map((t) => {
              const bodyText = stripBulletLines(t.description ?? "");
              const subs = t.subtasks ?? [];
              const subDoneCount = subs.filter((s) => s.done).length;
              const subPct =
                subs.length > 0
                  ? Math.round((subDoneCount / subs.length) * 100)
                  : 0;
              return (
                <li
                  key={t.id}
                  className="flex items-start gap-2 rounded border border-slate-100 bg-slate-50 p-3"
                >
                  <input
                    type="checkbox"
                    checked={t.status === "done"}
                    onChange={() => onToggleDone(t)}
                    disabled={subs.length > 0}
                    className={`mt-0.5 h-4 w-4 accent-slate-900 ${subs.length > 0 ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                    aria-label="完了マーク"
                    title={
                      subs.length > 0
                        ? "サブタスクのチェック状態で自動反映"
                        : undefined
                    }
                  />
                  <span
                    className={`mt-0.5 rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[t.status]}`}
                  >
                    {STATUS_LABEL[t.status]}
                  </span>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{t.title}</p>
                      {subs.length > 0 && (
                        <span className="text-xs text-slate-500">
                          {subDoneCount}/{subs.length}（{subPct}%）
                        </span>
                      )}
                    </div>
                    {bodyText && (
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">
                        <MdText text={bodyText} />
                      </p>
                    )}
                    {subs.length > 0 && (
                      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${subPct}%` }}
                        />
                      </div>
                    )}
                    {subs.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {subs.map((s) => (
                          <li key={s.id} className="text-sm">
                            <label className="flex cursor-pointer items-start gap-2">
                              <input
                                type="checkbox"
                                checked={s.done}
                                onChange={() => onToggleSubtask(t.id, s)}
                                className="mt-0.5 h-4 w-4 cursor-pointer accent-slate-900"
                              />
                              <span
                                className={
                                  s.done
                                    ? "break-words text-slate-400 line-through"
                                    : "break-words text-slate-700"
                                }
                              >
                                <MdText text={s.text} />
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
