export interface TaskDraft {
  title: string;
  description: string;
  start_date: string;
  due_date: string;
}

const NEW_PREFIX = "goatask:task-draft:new:";
const EDIT_PREFIX = "goatask:task-draft:edit:";

export const newDraftKey = (projectId: number | null): string =>
  `${NEW_PREFIX}${projectId ?? "root"}`;
export const editDraftKey = (taskId: number): string =>
  `${EDIT_PREFIX}${taskId}`;

export function isDraftEmpty(d: TaskDraft): boolean {
  return !d.title && !d.description && !d.start_date && !d.due_date;
}

export function loadDraft(key: string): TaskDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TaskDraft>;
    return {
      title: parsed.title ?? "",
      description: parsed.description ?? "",
      start_date: parsed.start_date ?? "",
      due_date: parsed.due_date ?? "",
    };
  } catch {
    return null;
  }
}

export function saveDraft(key: string, draft: TaskDraft): void {
  try {
    if (isDraftEmpty(draft)) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    /* ignore quota / privacy errors */
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function hasDraft(key: string): boolean {
  try {
    return !!localStorage.getItem(key);
  } catch {
    return false;
  }
}
