import { apiFetch, throwIfConflict } from "./client";

export type TaskStatus = "todo" | "doing" | "done";

export interface Subtask {
  id: number;
  task_id: number;
  text: string;
  done: boolean;
  position: number;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  due_date?: string | null;
  start_date?: string | null;
  project_id?: number | null;
  created_at: string;
  updated_at: string;
  // 楽観ロック用のカウンタ。updateTaskで自動的に送信される。
  version: number;
  subtasks: Subtask[];
}

export interface NewTask {
  title: string;
  description?: string;
  status?: TaskStatus;
  due_date?: string | null;
  start_date?: string | null;
  project_id?: number | null;
}

export async function listTasks(): Promise<Task[]> {
  const res = await apiFetch(`/api/tasks`);
  if (!res.ok) throw new Error(`listTasks failed: ${res.status}`);
  return res.json();
}

export async function createTask(input: NewTask): Promise<Task> {
  const res = await apiFetch(`/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`createTask failed: ${res.status}`);
  return res.json();
}

export async function updateTask(
  id: number,
  input: Partial<Task>,
  opts: { force?: boolean } = {},
): Promise<Task> {
  const qs = opts.force ? "?force=true" : "";
  const res = await apiFetch(`/api/tasks/${id}${qs}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await throwIfConflict<Task>(res);
  if (!res.ok) throw new Error(`updateTask failed: ${res.status}`);
  return res.json();
}

export async function toggleSubtask(
  taskId: number,
  subtaskId: number,
  done: boolean,
): Promise<Task> {
  const res = await apiFetch(
    `/api/tasks/${taskId}/subtasks/${subtaskId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    },
  );
  if (!res.ok) throw new Error(`toggleSubtask failed: ${res.status}`);
  return res.json();
}

export async function deleteTask(id: number): Promise<void> {
  const res = await apiFetch(`/api/tasks/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`deleteTask failed: ${res.status}`);
}

export async function reorderTasks(ids: number[]): Promise<void> {
  const res = await apiFetch(`/api/tasks-reorder`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error(`reorderTasks failed: ${res.status}`);
}

export async function checkHealth(): Promise<{ status: string }> {
  const res = await apiFetch(`/health`);
  if (!res.ok) throw new Error(`health failed: ${res.status}`);
  return res.json();
}
