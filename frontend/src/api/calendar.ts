import { apiFetch } from "./client";
import type { Task } from "./tasks";

export interface CalendarNote {
  id: number;
  date: string;
  title: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface CalendarData { tasks: Task[]; notes: CalendarNote[] }
export interface CalendarNoteInput { date: string; title: string; color?: string }

export async function getCalendar(from: string, to: string): Promise<CalendarData> {
  const params = new URLSearchParams({ from, to });
  const res = await apiFetch(`/api/calendar?${params}`);
  if (!res.ok) throw new Error(`getCalendar failed: ${res.status}`);
  return res.json();
}

export async function createCalendarNote(input: CalendarNoteInput): Promise<CalendarNote> {
  const res = await apiFetch("/api/calendar-notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!res.ok) throw new Error(`createCalendarNote failed: ${res.status}`);
  return res.json();
}

export async function updateCalendarNote(id: number, input: CalendarNoteInput): Promise<CalendarNote> {
  const res = await apiFetch(`/api/calendar-notes/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!res.ok) throw new Error(`updateCalendarNote failed: ${res.status}`);
  return res.json();
}

export async function deleteCalendarNote(id: number): Promise<void> {
  const res = await apiFetch(`/api/calendar-notes/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`deleteCalendarNote failed: ${res.status}`);
}
