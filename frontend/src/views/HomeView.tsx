import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listTasks, type TaskStatus } from "../api/tasks";

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
  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: listTasks });
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const error = tasksQuery.error
    ? tasksQuery.error instanceof Error
      ? tasksQuery.error.message
      : String(tasksQuery.error)
    : null;

  const todayStr = formatDate(new Date());
  const markedDates = useMemo(() => new Set(tasks.flatMap((t) => [t.start_date?.slice(0, 10), t.due_date?.slice(0, 10)].filter((d): d is string => Boolean(d)))), [tasks]);
  const todayTasks = tasks.filter(
    (t) =>
      t.status === "doing" ||
      (t.due_date != null && t.due_date.startsWith(todayStr)),
  );

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
        <h2 className="mb-3 text-lg font-semibold">今日やること</h2>
        {todayTasks.length === 0 ? (
          <p className="text-sm text-slate-500">
            進行中のタスクも、今日が期日のタスクもありません。
          </p>
        ) : (
          <ul className="space-y-2">
            {todayTasks.map((t) => (
              <li
                key={t.id}
                className="flex items-start gap-2 rounded border border-slate-100 bg-slate-50 p-3"
              >
                <span
                  className={`mt-0.5 rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[t.status]}`}
                >
                  {STATUS_LABEL[t.status]}
                </span>
                <div className="flex-1">
                  <p className="font-medium">{t.title}</p>
                  {t.description && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                      {t.description}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
