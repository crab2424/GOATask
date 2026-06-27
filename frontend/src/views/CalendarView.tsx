import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createTask, type Task } from "../api/tasks";
import { createCalendarNote, deleteCalendarNote, getCalendar, updateCalendarNote, type CalendarNote } from "../api/calendar";
import { useIsMobile } from "../lib/useIsMobile";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const COLORS = { violet: "bg-violet-100 text-violet-800", sky: "bg-sky-100 text-sky-800", amber: "bg-amber-100 text-amber-800", rose: "bg-rose-100 text-rose-800" } as const;

function dateString(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addDays(date: Date, amount: number) { const next = new Date(date); next.setDate(next.getDate() + amount); return next; }
function datePart(value?: string | null) { return value?.slice(0, 10) ?? null; }

export function CalendarView({ initialDate }: { initialDate?: string | null }) {
  const initial = initialDate ? new Date(`${initialDate}T00:00:00`) : new Date();
  const [cursor, setCursor] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [selected, setSelected] = useState(dateString(initial));
  const [kind, setKind] = useState<"note" | "task">("note");
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(selected);
  const [dueDate, setDueDate] = useState(selected);
  const [color, setColor] = useState<keyof typeof COLORS>("violet");
  const [editingNote, setEditingNote] = useState<CalendarNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const client = useQueryClient();

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);
  const from = dateString(cells[0]);
  const to = dateString(cells[cells.length - 1]);
  const query = useQuery({ queryKey: ["calendar", from, to], queryFn: () => getCalendar(from, to) });
  const tasks = query.data?.tasks ?? [];
  const notes = query.data?.notes ?? [];
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ["calendar"] }), client.invalidateQueries({ queryKey: ["tasks"] })]); };

  const tasksOn = (day: string) => tasks.filter((t) => { const start = datePart(t.start_date) ?? datePart(t.due_date); const end = datePart(t.due_date) ?? start; return !!start && !!end && start <= day && day <= end; });
  const notesOn = (day: string) => notes.filter((n) => datePart(n.date) === day);
  const selectDay = (day: string) => { setSelected(day); setStartDate(day); setDueDate(day); setEditingNote(null); setTitle(""); };

  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (!title.trim()) return;
    setError(null);
    try {
      if (kind === "note") {
        const input = { date: selected, title: title.trim(), color };
        if (editingNote) await updateCalendarNote(editingNote.id, input); else await createCalendarNote(input);
      } else {
        if (startDate && dueDate && startDate > dueDate) throw new Error("開始日は期限以前にしてください");
        await createTask({ title: title.trim(), start_date: startDate ? `${startDate}T00:00:00Z` : null, due_date: dueDate ? `${dueDate}T00:00:00Z` : null });
      }
      setTitle(""); setEditingNote(null); await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };
  const editNote = (note: CalendarNote) => { setKind("note"); setEditingNote(note); setTitle(note.title); setColor((note.color in COLORS ? note.color : "violet") as keyof typeof COLORS); };
  const removeNote = async (note: CalendarNote) => { if (!window.confirm(`「${note.title}」を削除しますか？`)) return; await deleteCalendarNote(note.id); if (editingNote?.id === note.id) { setEditingNote(null); setTitle(""); } await refresh(); };
  const selectedTasks = tasksOn(selected); const selectedNotes = notesOn(selected);
  const monthControls = <div className="flex items-center gap-2">
    <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="rounded border px-3 py-1.5">‹</button>
    <button onClick={() => { const now = new Date(); setCursor(new Date(now.getFullYear(), now.getMonth(), 1)); selectDay(dateString(now)); }} className="rounded border px-3 py-1.5 text-sm">今日</button>
    <strong className="min-w-28 text-center">{cursor.getFullYear()}年 {cursor.getMonth() + 1}月</strong>
    <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="rounded border px-3 py-1.5">›</button>
  </div>;

  return <div className="mx-auto max-w-7xl">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-2xl font-bold">カレンダー</h1>
      <div className="lg:hidden">{monthControls}</div>
    </div>
    {(error || query.error) && <div className="mb-3 rounded border border-rose-300 bg-rose-50 p-2 text-sm text-rose-700">{error ?? String(query.error)}</div>}
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div>
        <div className="mb-3 hidden justify-center lg:flex">{monthControls}</div>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b bg-slate-50 text-center text-xs font-medium text-slate-500">{WEEKDAYS.map((w, i) => <div key={w} className={`py-2 ${i === 0 ? "text-rose-500" : i === 6 ? "text-sky-500" : ""}`}>{w}</div>)}</div>
        <div className="grid grid-cols-7">{cells.map((date) => { const day = dateString(date); const dayTasks = tasksOn(day); const dayNotes = notesOn(day); const outside = date.getMonth() !== cursor.getMonth(); const active = day === selected; const items = [...dayTasks.map((t) => ({ type: "task" as const, value: t })), ...dayNotes.map((n) => ({ type: "note" as const, value: n }))]; const limit = isMobile ? 2 : 3; return <button key={day} onClick={() => selectDay(day)} className={`relative min-h-20 border-b border-r p-1 pt-8 text-left align-top sm:min-h-28 ${active ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : "hover:bg-slate-50"}`}>
          <span className={`absolute left-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${day === dateString(new Date()) ? "bg-slate-900 text-white" : outside ? "text-slate-300" : date.getDay() === 0 ? "text-rose-500" : date.getDay() === 6 ? "text-sky-500" : ""}`}>{date.getDate()}</span>
          <div className="space-y-0.5">{items.slice(0, limit).map((item) => item.type === "task" ? <div key={`t${item.value.id}`} className={`truncate rounded px-1 py-0.5 text-[10px] sm:text-xs ${item.value.status === "done" ? "bg-slate-100 text-slate-400 line-through" : datePart(item.value.due_date) === day ? "bg-rose-100 text-rose-800" : "bg-sky-100 text-sky-800"}`}>{datePart(item.value.due_date) === day ? "⚑ " : ""}{item.value.title}</div> : <div key={`n${item.value.id}`} className={`truncate rounded px-1 py-0.5 text-[10px] sm:text-xs ${COLORS[item.value.color as keyof typeof COLORS] ?? COLORS.violet}`}>• {item.value.title}</div>)}{items.length > limit && <div className="px-1 text-[10px] text-slate-500">ほか{items.length - limit}件</div>}</div>
        </button>; })}</div>
        </div>
      </div>
      <aside className="space-y-4">
        <section className="rounded-lg border bg-white p-4 shadow-sm"><h2 className="font-semibold">{selected.replaceAll("-", "/")} の予定</h2><div className="mt-3 space-y-2">
          {selectedTasks.map((task: Task) => <div key={task.id} className="rounded bg-sky-50 p-2 text-sm"><div className={task.status === "done" ? "line-through text-slate-400" : ""}>{task.title}</div><div className="mt-1 text-xs text-slate-500">{datePart(task.start_date) ?? datePart(task.due_date)} → {datePart(task.due_date) ?? datePart(task.start_date)}</div></div>)}
          {selectedNotes.map((note) => <div key={note.id} className="flex items-center gap-1 rounded bg-violet-50 p-2 text-sm"><button onClick={() => editNote(note)} className="min-w-0 flex-1 truncate text-left">{note.title}</button><button onClick={() => removeNote(note)} className="text-xs text-rose-500">削除</button></div>)}
          {selectedTasks.length + selectedNotes.length === 0 && <p className="text-sm text-slate-500">予定はありません。</p>}
        </div></section>
        <form onSubmit={submit} className="rounded-lg border bg-white p-4 shadow-sm"><div className="mb-3 flex rounded bg-slate-100 p-1 text-sm"><button type="button" onClick={() => { setKind("note"); setEditingNote(null); setTitle(""); }} className={`flex-1 rounded py-1 ${kind === "note" ? "bg-white shadow" : ""}`}>日付メモ</button><button type="button" onClick={() => { setKind("task"); setEditingNote(null); setTitle(""); }} className={`flex-1 rounded py-1 ${kind === "task" ? "bg-white shadow" : ""}`}>タスク</button></div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "note" ? "〇〇の日" : "タスク名"} className="mb-2 w-full rounded border px-3 py-2" />
          {kind === "note" ? <select value={color} onChange={(e) => setColor(e.target.value as keyof typeof COLORS)} className="mb-3 w-full rounded border px-2 py-2 text-sm"><option value="violet">紫</option><option value="sky">青</option><option value="amber">黄</option><option value="rose">赤</option></select> : <div className="mb-3 grid grid-cols-2 gap-2 text-xs"><label>開始日<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-full rounded border p-2" /></label><label>期限<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 w-full rounded border p-2" /></label></div>}
          <div className="flex gap-2"><button disabled={!title.trim()} className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:bg-slate-400">{editingNote ? "更新" : "追加"}</button>{editingNote && <button type="button" onClick={() => { setEditingNote(null); setTitle(""); }} className="rounded border px-3 py-2 text-sm">取消</button>}</div>
        </form>
      </aside>
    </div>
  </div>;
}
