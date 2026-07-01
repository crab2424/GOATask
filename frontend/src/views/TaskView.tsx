import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type ReactElement,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTask,
  deleteTask,
  listTasks,
  reorderTasks,
  toggleSubtask,
  updateTask,
  type Subtask,
  type Task,
  type TaskStatus,
} from "../api/tasks";
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject,
  type Project,
} from "../api/projects";
import { useIsMobile } from "../lib/useIsMobile";
import { MobileDrawer } from "../components/MobileDrawer";
import {
  TreeSearch,
  matchesQuery,
  normalizeQuery,
  renderTreeSearchResults,
  type TreeSearchResult,
} from "../components/TreeSearch";
import {
  TASK_SORT_OPTIONS,
  loadSortMode,
  sortByMode,
  type SortMode,
} from "../lib/sortDirectory";
import { useFavorites, useRecent } from "../lib/folderShortcuts";
import {
  SidebarShortcuts,
  type ShortcutEntry,
} from "../components/SidebarShortcuts";
import { UndoToast } from "../components/UndoToast";
import { handleTreeKeyDown } from "../lib/treeKeyboard";
import {
  buildBreadcrumb,
  buildChildMap,
  buildItemsByParent,
  expandAncestors,
  flatTreeOptions,
  isDescendant,
} from "../lib/directoryTree";
import { useHoverExpand } from "../lib/useHoverExpand";
import { createLongPressHandlers, createLongPressStore } from "../lib/longPress";
import { clampMenuPosition } from "../lib/menuPosition";
import { MdText } from "../lib/mdInline";
import { stripBulletLines } from "../lib/taskText";
import { TaskDescriptionEditor } from "../components/TaskDescriptionEditor";
import {
  clearDraft,
  editDraftKey,
  hasDraft,
  loadDraft,
  newDraftKey,
  saveDraft,
} from "../lib/taskDraft";

function ProgressBar({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className={`h-1 w-full overflow-hidden rounded-full bg-slate-200 ${className ?? ""}`}>
      <div
        className="h-full rounded-full bg-emerald-500 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

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

const STATUS_DOT_COLOR: Record<TaskStatus, string> = {
  todo: "#94a3b8",
  doing: "#f59e0b",
  done: "#10b981",
};
const OVERDUE_DOT_COLOR = "#f43f5e";
const PROJECT_MENU_W = 190;
const PROJECT_MENU_H = 160;
const TASK_MENU_W = 150;
const TASK_MENU_H = 90;
const PROJECT_EXPANDED_KEY = "goatask-project-expanded";
const CURRENT_PROJECT_KEY = "goatask-current-project";
const TASK_SORT_KEY = "goatask:task-sort";
const TASK_FILTER_KEY = "goatask:task-filter";
const TASK_TIDIED_KEY = "goatask:task-tidied";
type TaskDueFilter = "all" | "with" | "overdue" | "today";
interface TaskFilter {
  todo: boolean;
  doing: boolean;
  due: TaskDueFilter;
}
const DEFAULT_FILTER: TaskFilter = { todo: true, doing: true, due: "all" };

function taskDotColor(t: Task): string {
  if (t.status === "done") return STATUS_DOT_COLOR.done;
  if (t.due_date && t.due_date.slice(0, 10) < todayStr())
    return OVERDUE_DOT_COLOR;
  return STATUS_DOT_COLOR[t.status];
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoToDateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

function dateInputToIso(input: string): string | null {
  return input ? `${input}T00:00:00Z` : null;
}

function dueLabel(iso: string | null | undefined, status: TaskStatus) {
  if (!iso) return null;
  const date = iso.slice(0, 10);
  const today = todayStr();
  const overdue = status !== "done" && date < today;
  const isToday = date === today;
  const cls = overdue
    ? "text-rose-600"
    : isToday
      ? "text-amber-600"
      : "text-slate-500";
  const suffix = overdue ? "（期限超過）" : isToday ? "（今日）" : "";
  return (
    <span className={`text-xs ${cls}`}>
      期限 {date}
      {suffix}
    </span>
  );
}

type DragItem = { type: "task" | "project"; id: number } | null;
type DropTarget = { kind: "folder"; projectId: number | null } | null;

interface TaskViewProps {
  initialTaskId?: number | null;
  onInitialTaskHandled?: () => void;
}

export function TaskView({ initialTaskId, onInitialTaskHandled }: TaskViewProps = {}) {
  const queryClient = useQueryClient();
  const longPressStore = useRef(createLongPressStore()).current;
  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: listTasks });
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const tasks = tasksQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem(CURRENT_PROJECT_KEY);
      if (!saved || saved === "root") return null;
      const id = Number(saved);
      return Number.isFinite(id) ? id : null;
    } catch {
      return null;
    }
  });
  const isMobile = useIsMobile();
  const [treeOpen, setTreeOpen] = useState(false);
  const [treeQuery, setTreeQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>(() =>
    loadSortMode(TASK_SORT_KEY, "manual"),
  );
  useEffect(() => {
    localStorage.setItem(TASK_SORT_KEY, sortMode);
  }, [sortMode]);
  const [filter, setFilter] = useState<TaskFilter>(() => {
    try {
      const saved = localStorage.getItem(TASK_FILTER_KEY);
      if (!saved) return DEFAULT_FILTER;
      return { ...DEFAULT_FILTER, ...JSON.parse(saved) };
    } catch {
      return DEFAULT_FILTER;
    }
  });
  useEffect(() => {
    localStorage.setItem(TASK_FILTER_KEY, JSON.stringify(filter));
  }, [filter]);
  const favorites = useFavorites("goatask:project-favorites");
  const recent = useRecent("goatask:project-recent");
  const [undoState, setUndoState] = useState<{
    message: string;
    snapshot: Task;
  } | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem(PROJECT_EXPANDED_KEY);
      return saved
        ? new Set(JSON.parse(saved) as number[])
        : new Set<number>();
    } catch {
      return new Set<number>();
    }
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editProjectId, setEditProjectId] = useState<number | null>(null);

  const [showDone, setShowDone] = useState(false);
  const [tidied, setTidied] = useState<boolean>(() => {
    try {
      return localStorage.getItem(TASK_TIDIED_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    localStorage.setItem(TASK_TIDIED_KEY, tidied ? "1" : "0");
  }, [tidied]);
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dragItem, setDragItem] = useState<DragItem>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const dragItemRef = useRef<DragItem>(null);

  const [focusTaskId, setFocusTaskId] = useState<number | null>(null);
  const taskRefs = useRef<Map<number, HTMLLIElement>>(new Map());

  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    projectId: number;
  } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement | null>(null);

  const [taskCtxMenu, setTaskCtxMenu] = useState<{
    x: number;
    y: number;
    taskId: number;
  } | null>(null);
  const taskCtxMenuRef = useRef<HTMLDivElement | null>(null);

  const openProjectCtxMenu = (x: number, y: number, projectId: number) => {
    setCtxMenu({ ...clampMenuPosition(x, y, PROJECT_MENU_W, PROJECT_MENU_H), projectId });
  };

  const hoverExpand = useHoverExpand(
    (id) =>
      setExpanded((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      }),
    (id) => expanded.has(id),
  );

  const reload = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tasks"] }),
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({ queryKey: ["calendar"] }),
    ]);
    setError(null);
  };

  useEffect(() => {
    if (!projectsQuery.isSuccess) return;
    setCurrentProjectId((cur) =>
      cur !== null && !projects.some((proj) => proj.id === cur) ? null : cur,
    );
  }, [projects, projectsQuery.isSuccess]);

  const queryError = tasksQuery.error ?? projectsQuery.error;
  const queryErrorMsg = queryError
    ? queryError instanceof Error
      ? queryError.message
      : String(queryError)
    : null;

  useEffect(() => {
    localStorage.setItem(
      PROJECT_EXPANDED_KEY,
      JSON.stringify([...expanded]),
    );
  }, [expanded]);

  useEffect(() => {
    localStorage.setItem(
      CURRENT_PROJECT_KEY,
      currentProjectId === null ? "root" : String(currentProjectId),
    );
  }, [currentProjectId]);

  useEffect(() => {
    if (!ctxMenu) return;
    const onDown = (e: MouseEvent) => {
      if (!ctxMenuRef.current?.contains(e.target as Node)) setCtxMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCtxMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  useEffect(() => {
    if (!taskCtxMenu) return;
    const onDown = (e: MouseEvent) => {
      if (!taskCtxMenuRef.current?.contains(e.target as Node))
        setTaskCtxMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTaskCtxMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [taskCtxMenu]);

  const [hasNewDraftFlag, setHasNewDraftFlag] = useState(false);
  useEffect(() => {
    setHasNewDraftFlag(hasDraft(newDraftKey(currentProjectId)));
  }, [currentProjectId, showNewTaskForm, title, description, startDate, dueDate]);

  useEffect(() => {
    if (!showNewTaskForm) return;
    const d = loadDraft(newDraftKey(currentProjectId));
    if (d) {
      setTitle(d.title);
      setDescription(d.description);
      setStartDate(d.start_date);
      setDueDate(d.due_date);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNewTaskForm]);

  useEffect(() => {
    if (!showNewTaskForm) return;
    saveDraft(newDraftKey(currentProjectId), {
      title,
      description,
      start_date: startDate,
      due_date: dueDate,
    });
  }, [showNewTaskForm, currentProjectId, title, description, startDate, dueDate]);

  useEffect(() => {
    if (editingId === null) return;
    const d = loadDraft(editDraftKey(editingId));
    if (d) {
      setEditTitle(d.title);
      setEditDescription(d.description);
      setEditStartDate(d.start_date);
      setEditDueDate(d.due_date);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  useEffect(() => {
    if (editingId === null) return;
    saveDraft(editDraftKey(editingId), {
      title: editTitle,
      description: editDescription,
      start_date: editStartDate,
      due_date: editDueDate,
    });
  }, [editingId, editTitle, editDescription, editStartDate, editDueDate]);

  useEffect(() => {
    if (focusTaskId === null) return;
    const el = taskRefs.current.get(focusTaskId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(() => setFocusTaskId(null), 1600);
    return () => clearTimeout(timer);
  }, [focusTaskId, currentProjectId, tasks]);

  // --- Computed ---

  const childProjectsMap = useMemo(() => buildChildMap(projects), [projects]);

  const tasksByProject = useMemo(
    () => buildItemsByParent(tasks, (t) => t.project_id ?? null),
    [tasks],
  );

  const breadcrumb = useMemo(
    () => buildBreadcrumb(projects, currentProjectId),
    [currentProjectId, projects],
  );

  const flatProjectOptions = useMemo(
    () => flatTreeOptions(childProjectsMap),
    [childProjectsMap],
  );

  const recursiveTaskCount = useMemo(() => {
    const map = new Map<number | null, number>();
    const calc = (projectId: number | null): number => {
      if (map.has(projectId)) return map.get(projectId)!;
      const direct = (tasksByProject.get(projectId) ?? []).filter(
        (t) => t.status !== "done",
      ).length;
      const children = childProjectsMap.get(projectId) ?? [];
      let total = direct;
      for (const c of children) total += calc(c.id);
      map.set(projectId, total);
      return total;
    };
    projects.forEach((p) => calc(p.id));
    calc(null);
    return map;
  }, [projects, tasks, childProjectsMap, tasksByProject]);

  const recursiveDoneCount = useMemo(() => {
    const map = new Map<number | null, number>();
    const calc = (projectId: number | null): number => {
      if (map.has(projectId)) return map.get(projectId)!;
      const direct = (tasksByProject.get(projectId) ?? []).filter(
        (t) => t.status === "done",
      ).length;
      const children = childProjectsMap.get(projectId) ?? [];
      let total = direct;
      for (const c of children) total += calc(c.id);
      map.set(projectId, total);
      return total;
    };
    projects.forEach((p) => calc(p.id));
    calc(null);
    return map;
  }, [projects, tasks, childProjectsMap, tasksByProject]);

  const earliestDueByProject = useMemo<Map<number, string>>(() => {
    const cache = new Map<number, string | null>();
    const calc = (projectId: number): string | null => {
      if (cache.has(projectId)) return cache.get(projectId)!;
      let earliest: string | null = null;
      for (const t of tasksByProject.get(projectId) ?? []) {
        if (t.status === "done" || !t.due_date) continue;
        const d = t.due_date.slice(0, 10);
        if (earliest === null || d < earliest) earliest = d;
      }
      for (const c of childProjectsMap.get(projectId) ?? []) {
        const ce = calc(c.id);
        if (ce && (earliest === null || ce < earliest)) earliest = ce;
      }
      cache.set(projectId, earliest);
      return earliest;
    };
    projects.forEach((p) => calc(p.id));
    const out = new Map<number, string>();
    cache.forEach((v, k) => {
      if (v) out.set(k, v);
    });
    return out;
  }, [projects, tasks, childProjectsMap, tasksByProject]);

  const directProjectsRaw = childProjectsMap.get(currentProjectId) ?? [];
  const directTasksRaw = tasksByProject.get(currentProjectId) ?? [];
  const directProjects = useMemo(() => {
    if (sortMode === "due") {
      return [...directProjectsRaw].sort((a, b) => {
        const ad = earliestDueByProject.get(a.id);
        const bd = earliestDueByProject.get(b.id);
        if (!ad && !bd) return a.name.localeCompare(b.name);
        if (!ad) return 1;
        if (!bd) return -1;
        return ad.localeCompare(bd);
      });
    }
    return sortByMode(directProjectsRaw, sortMode, (p) => p.name);
  }, [directProjectsRaw, sortMode, earliestDueByProject]);
  const directTasks = useMemo(
    () =>
      sortByMode(
        directTasksRaw,
        sortMode,
        (t) => t.title,
        (t) => t.due_date,
      ),
    [directTasksRaw, sortMode],
  );
  const doneTasks = directTasks.filter((t) => t.status === "done");
  const activeTasksAll = tidied
    ? directTasks.filter((t) => t.status !== "done")
    : directTasks;
  const activeTasks = useMemo(() => {
    const today = todayStr();
    return activeTasksAll.filter((t) => {
      if (t.status === "todo" && !filter.todo) return false;
      if (t.status === "doing" && !filter.doing) return false;
      const date = t.due_date ? t.due_date.slice(0, 10) : null;
      switch (filter.due) {
        case "with":
          if (!date) return false;
          break;
        case "overdue":
          if (!date || date >= today) return false;
          break;
        case "today":
          if (date !== today) return false;
          break;
      }
      return true;
    });
  }, [activeTasksAll, filter]);

  // --- DnD helpers ---

  const canDrop = (targetProjectId: number | null): boolean => {
    const item = dragItemRef.current;
    if (!item) return false;
    if (item.type === "task") {
      const task = tasks.find((t) => t.id === item.id);
      return !!task && (task.project_id ?? null) !== targetProjectId;
    }
    if (item.type === "project") {
      if (targetProjectId === item.id) return false;
      if (
        targetProjectId !== null &&
        isDescendant(projects, item.id, targetProjectId)
      )
        return false;
      const p = projects.find((proj) => proj.id === item.id);
      if (p && (p.parent_id ?? null) === targetProjectId) return false;
      return true;
    }
    return false;
  };

  const isDropTargetFor = (projectId: number | null) =>
    dropTarget !== null &&
    dropTarget.kind === "folder" &&
    dropTarget.projectId === projectId;

  // --- Navigation ---

  const navigateTo = (id: number | null) => {
    setCurrentProjectId(id);
    if (id !== null) {
      setExpanded((prev) => expandAncestors(projects, prev, id));
      recent.push(id);
    }
    setTreeOpen(false);
  };

  useEffect(() => {
    if (!projectsQuery.isSuccess) return;
    recent.prune(new Set(projects.map((p) => p.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectsQuery.isSuccess, projects]);

  const buildShortcutEntry = (id: number): ShortcutEntry | null => {
    const p = projects.find((x) => x.id === id);
    if (!p) return null;
    return {
      id,
      name: p.name,
      isCurrent: currentProjectId === id,
      onClick: () => navigateTo(id),
      onToggleFavorite: () => favorites.toggle(id),
      starred: favorites.has(id),
    };
  };

  const favoriteEntries = [...favorites.ids]
    .map(buildShortcutEntry)
    .filter((x): x is ShortcutEntry => x !== null);
  const recentEntries = recent.ids
    .map(buildShortcutEntry)
    .filter((x): x is ShortcutEntry => x !== null);

  // --- DnD handlers ---

  const handleDragStart = (
    e: ReactDragEvent,
    type: "task" | "project",
    id: number,
  ) => {
    const item = { type, id };
    dragItemRef.current = item;
    setDragItem(item);
    e.dataTransfer.setData("text/plain", JSON.stringify(item));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    dragItemRef.current = null;
    setDragItem(null);
    setDropTarget(null);
    hoverExpand.clear();
  };

  const handleFolderDragOver = (
    e: ReactDragEvent,
    targetProjectId: number | null,
  ) => {
    if (!dragItemRef.current) return;
    e.stopPropagation();
    if (!canDrop(targetProjectId)) {
      setDropTarget((prev) => (prev === null ? prev : null));
      hoverExpand.clear();
      return;
    }
    e.preventDefault();
    setDropTarget({ kind: "folder", projectId: targetProjectId });
    if (targetProjectId !== null) hoverExpand.schedule(targetProjectId);
    else hoverExpand.clear();
  };

  const handleFolderDragLeave = (
    e: ReactDragEvent,
    targetProjectId: number | null,
  ) => {
    e.stopPropagation();
    if (
      targetProjectId !== null &&
      hoverExpand.currentId() === targetProjectId
    ) {
      hoverExpand.clear();
    }
  };

  const handleFolderDrop = async (
    e: ReactDragEvent,
    targetProjectId: number | null,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    hoverExpand.clear();
    const item = dragItemRef.current;
    if (!item) return;
    try {
      if (item.type === "task") {
        const task = tasks.find((t) => t.id === item.id);
        if (task) {
          await updateTask(task.id, { ...task, project_id: targetProjectId });
        }
      } else if (item.type === "project") {
        await updateProject(item.id, { parent_id: targetProjectId });
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    dragItemRef.current = null;
    setDragItem(null);
    setDropTarget(null);
  };

  // --- Task CRUD ---

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (startDate && dueDate && startDate > dueDate) { setError("開始日は期限以前にしてください"); return; }
    try {
      await createTask({
        title: title.trim(),
        description: description.trim(),
        start_date: dateInputToIso(startDate),
        due_date: dateInputToIso(dueDate),
        project_id: currentProjectId,
      });
      clearDraft(newDraftKey(currentProjectId));
      setTitle("");
      setDescription("");
      setStartDate("");
      setDueDate("");
      setShowNewTaskForm(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const cycleStatus = async (t: Task) => {
    const next: TaskStatus =
      t.status === "todo" ? "doing" : t.status === "doing" ? "done" : "todo";
    await updateTask(t.id, { ...t, status: next });
    await reload();
  };

  const toggleDone = async (t: Task) => {
    const next: TaskStatus = t.status === "done" ? "todo" : "done";
    await updateTask(t.id, { ...t, status: next });
    await reload();
  };

  const onToggleSubtask = async (taskId: number, sub: Subtask) => {
    try {
      await toggleSubtask(taskId, sub.id, !sub.done);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onDeleteTask = async (t: Task) => {
    try {
      await deleteTask(t.id);
      await reload();
      const subs = t.subtasks ?? [];
      const note = subs.length > 0 ? "（サブタスクは復元不可）" : "";
      setUndoState({
        message: `「${t.title}」を削除しました${note}`,
        snapshot: t,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const restoreTask = async () => {
    if (!undoState) return;
    const t = undoState.snapshot;
    setUndoState(null);
    try {
      await createTask({
        title: t.title,
        description: t.description,
        status: t.status,
        start_date: t.start_date,
        due_date: t.due_date,
        project_id: t.project_id ?? null,
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const moveTask = async (taskId: number, direction: "up" | "down") => {
    const idx = activeTasks.findIndex((t) => t.id === taskId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= activeTasks.length) return;
    const reordered = [...activeTasks];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    const allIds = tidied
      ? [...reordered, ...doneTasks].map((t) => t.id)
      : reordered.map((t) => t.id);
    try {
      await reorderTasks(allIds);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const startEdit = (t: Task) => {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditDescription(t.description);
    setEditStartDate(isoToDateInput(t.start_date));
    setEditDueDate(isoToDateInput(t.due_date));
    setEditProjectId(t.project_id ?? null);
  };

  const cancelEdit = () => {
    if (editingId !== null) clearDraft(editDraftKey(editingId));
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
    setEditStartDate("");
    setEditDueDate("");
    setEditProjectId(null);
  };

  const saveEdit = async (t: Task) => {
    if (!editTitle.trim()) return;
    if (editStartDate && editDueDate && editStartDate > editDueDate) { setError("開始日は期限以前にしてください"); return; }
    try {
      await updateTask(t.id, {
        ...t,
        title: editTitle.trim(),
        description: editDescription.trim(),
        start_date: dateInputToIso(editStartDate),
        due_date: dateInputToIso(editDueDate),
        project_id: editProjectId,
      });
      clearDraft(editDraftKey(t.id));
      cancelEdit();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // --- Project CRUD ---

  const onCreateProjectIn = async (
    parentId: number | null,
    e?: React.MouseEvent,
  ) => {
    e?.stopPropagation();
    const name = prompt("プロジェクト名");
    if (!name?.trim()) return;
    try {
      const p = await createProject({
        name: name.trim(),
        parent_id: parentId,
      });
      if (parentId !== null) {
        setExpanded((prev) => new Set(prev).add(parentId));
      }
      setExpanded((prev) => new Set(prev).add(p.id));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onRenameProject = async (p: Project, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const name = prompt("新しいプロジェクト名", p.name);
    if (!name?.trim() || name.trim() === p.name) return;
    try {
      await updateProject(p.id, {
        name: name.trim(),
        parent_id: p.parent_id ?? null,
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onDeleteProject = async (p: Project, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const subProjects = childProjectsMap.get(p.id) ?? [];
    const pTasks = tasksByProject.get(p.id) ?? [];
    const activeInProject = pTasks.filter((t) => t.status !== "done").length;
    const totalDescendant = recursiveTaskCount.get(p.id) ?? 0;
    const parentLabel = p.parent_id ? "親プロジェクト" : "ルート";
    const msg = [
      `プロジェクト「${p.name}」を削除しますか？`,
      "",
      "【影響範囲】",
      subProjects.length > 0
        ? `・サブプロジェクト ${subProjects.length}件 → ${parentLabel}に繰り上がり`
        : null,
      activeInProject > 0
        ? `・直下のタスク ${activeInProject}件 → ${parentLabel}に移動`
        : null,
      totalDescendant > activeInProject && subProjects.length > 0
        ? `・配下の全アクティブタスク 計${totalDescendant}件（サブ含む）`
        : null,
      subProjects.length === 0 && pTasks.length === 0
        ? "・影響なし（空のプロジェクト）"
        : null,
    ]
      .filter(Boolean)
      .join("\n");
    if (!confirm(msg)) return;
    try {
      if (currentProjectId === p.id) {
        setCurrentProjectId(p.parent_id ?? null);
      }
      await deleteProject(p.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // --- Tree rendering ---

  const renderTreeProject = (p: Project, depth: number): ReactElement => {
    const isOpen = expanded.has(p.id);
    const subProjects = childProjectsMap.get(p.id) ?? [];
    const subTasks = (tasksByProject.get(p.id) ?? []).filter(
      (t) => t.status !== "done",
    );
    const hasChildren = subProjects.length > 0 || subTasks.length > 0;
    const isCurrent = currentProjectId === p.id;
    const count = recursiveTaskCount.get(p.id) ?? 0;
    const isDrop = isDropTargetFor(p.id);

    const toggleProjectExpand = () => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(p.id)) next.delete(p.id);
        else next.add(p.id);
        return next;
      });
    };
    return (
      <li
        key={`p-${p.id}`}
        role="treeitem"
        aria-expanded={isOpen}
        className={`rounded ${isDrop ? "bg-blue-50 ring-2 ring-blue-400" : ""}`}
        onDragOver={(e) => handleFolderDragOver(e, p.id)}
        onDragLeave={(e) => handleFolderDragLeave(e, p.id)}
        onDrop={(e) => handleFolderDrop(e, p.id)}
      >
        <button
          type="button"
          draggable
          data-tree-node={`project:${p.id}`}
          onClick={() => {
            setCurrentProjectId(p.id);
            setExpanded((prev) => {
              const next = expandAncestors(projects, prev, p.id);
              if (prev.has(p.id)) next.delete(p.id);
              return next;
            });
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              e.stopPropagation();
              if (!isOpen) toggleProjectExpand();
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              e.stopPropagation();
              if (isOpen) toggleProjectExpand();
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            openProjectCtxMenu(e.clientX, e.clientY, p.id);
          }}
          onDragStart={(e) => handleDragStart(e, "project", p.id)}
          onDragEnd={handleDragEnd}
          className={`flex w-full items-center gap-1 rounded px-1 py-1 text-left text-sm transition-colors ${
            isCurrent
              ? "bg-slate-200 font-bold text-slate-900"
              : "hover:bg-slate-100"
          } ${
            dragItem?.type === "project" && dragItem.id === p.id
              ? "opacity-40"
              : ""
          }`}
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
        >
          <span className="flex w-4 shrink-0 items-center justify-center text-slate-400">
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`}
            >
              <path
                d="M6 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="flex-1 truncate">
            {p.name}
            {count > 0 && (
              <span className="ml-1 text-xs text-slate-400">{count}</span>
            )}
          </span>
        </button>
        {isOpen && hasChildren && (
          <ul className="relative space-y-0.5">
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-1 top-0 w-px bg-slate-200"
              style={{ left: depth * 16 + 12 }}
            />
            {subProjects.map((sp) => renderTreeProject(sp, depth + 1))}
            {subTasks.map((t) => renderTreeTask(t, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  const openTaskFromTree = (t: Task) => {
    const parentId = t.project_id ?? null;
    if (parentId !== currentProjectId) navigateTo(parentId);
    if (editingId !== null) cancelEdit();
    if (t.status === "done") setShowDone(true);
    setFocusTaskId(t.id);
  };

  const openTaskForEdit = (t: Task) => {
    const parentId = t.project_id ?? null;
    if (parentId !== currentProjectId) navigateTo(parentId);
    if (t.status === "done") setShowDone(true);
    startEdit(t);
    setFocusTaskId(t.id);
  };

  useEffect(() => {
    if (initialTaskId == null) return;
    const t = tasks.find((x) => x.id === initialTaskId);
    if (!t) return;
    openTaskForEdit(t);
    onInitialTaskHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTaskId, tasks]);

  const renderTreeTask = (t: Task, depth: number): ReactElement => (
    <li key={`t-${t.id}`} role="treeitem">
      <div
        className={`flex items-center gap-1 rounded px-1 py-1 text-sm hover:bg-slate-50 ${
          dragItem?.type === "task" && dragItem.id === t.id ? "opacity-40" : ""
        } ${focusTaskId === t.id ? "bg-slate-100 font-medium" : ""}`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        draggable
        onDragStart={(e) => handleDragStart(e, "task", t.id)}
        onDragEnd={handleDragEnd}
      >
        <span className="flex w-4 shrink-0 items-center justify-center">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: taskDotColor(t) }}
            title={STATUS_LABEL[t.status]}
          />
        </span>
        <button
          onClick={() => openTaskFromTree(t)}
          data-tree-node={`task:${t.id}`}
          className="flex-1 truncate text-left text-slate-500 hover:text-slate-900"
        >
          {t.title}
        </button>
      </div>
    </li>
  );

  // --- Task card ---

  const renderTaskCard = (t: Task) => {
    const bodyText = stripBulletLines(t.description);
    const subs = t.subtasks ?? [];
    const subDoneCount = subs.filter((s) => s.done).length;
    const isEditing = editingId === t.id;

    const isFocused = focusTaskId === t.id;

    const openTaskCtxMenu = (x: number, y: number) => {
      setTaskCtxMenu({ ...clampMenuPosition(x, y, TASK_MENU_W, TASK_MENU_H), taskId: t.id });
    };
    const longPress = createLongPressHandlers(longPressStore, `task:${t.id}`, openTaskCtxMenu);

    return (
      <li
        key={t.id}
        ref={(el) => {
          if (el) taskRefs.current.set(t.id, el);
          else taskRefs.current.delete(t.id);
        }}
        className={`relative flex items-start justify-between rounded-lg border bg-white p-3 shadow-sm transition-all ${
          isFocused
            ? "border-blue-400 ring-2 ring-blue-300"
            : "border-slate-200"
        } ${!isEditing ? "cursor-pointer" : ""}`}
        onClick={() => {
          if (!isEditing) startEdit(t);
        }}
        onContextMenu={(e) => {
          if (isEditing) return;
          e.preventDefault();
          e.stopPropagation();
          openTaskCtxMenu(e.clientX, e.clientY);
        }}
        onTouchStart={isEditing ? undefined : longPress.onTouchStart}
        onTouchMove={isEditing ? undefined : longPress.onTouchMove}
        onTouchEnd={isEditing ? undefined : longPress.onTouchEnd}
        onClickCapture={isEditing ? undefined : longPress.onClickCapture}
      >
        {editingId === t.id ? (
          <div className="flex-1">
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="タイトル"
              className="mb-2 w-full rounded border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
            />
            <div className="mb-2">
              <TaskDescriptionEditor
                value={editDescription}
                onChange={setEditDescription}
                placeholder="詳細（任意）。「・」「- 」「- [ ]」で始まる行はチェックリストになります。"
                rows={4}
              />
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                開始日
                <input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} className="rounded border border-slate-300 px-2 py-1 focus:border-slate-500 focus:outline-none" />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                期限
                <input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 focus:border-slate-500 focus:outline-none"
                />
                {editDueDate && (
                  <button
                    type="button"
                    onClick={() => setEditDueDate("")}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    クリア
                  </button>
                )}
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                移動先
                <select
                  value={editProjectId ?? ""}
                  onChange={(e) =>
                    setEditProjectId(
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                  className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
                >
                  <option value="">（ルート）</option>
                  {flatProjectOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => saveEdit(t)}
                disabled={!editTitle.trim()}
                className="rounded bg-slate-900 px-3 py-1 text-sm text-white hover:bg-slate-700 disabled:bg-slate-400"
              >
                保存
              </button>
              <button
                onClick={cancelEdit}
                className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-1 items-start gap-2">
              <input
                type="checkbox"
                checked={t.status === "done"}
                onChange={() => toggleDone(t)}
                onClick={(e) => e.stopPropagation()}
                disabled={subs.length > 0}
                className={`mt-1 h-4 w-4 accent-slate-900 ${subs.length > 0 ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                aria-label="完了マーク"
                title={
                  subs.length > 0
                    ? "サブタスクのチェック状態で自動反映"
                    : undefined
                }
              />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {subs.length > 0 ? (
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[t.status]}`}
                      title="サブタスクのチェック状態で自動反映"
                    >
                      {STATUS_LABEL[t.status]}
                    </span>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        cycleStatus(t);
                      }}
                      className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[t.status]}`}
                    >
                      {STATUS_LABEL[t.status]}
                    </button>
                  )}
                  <span
                    className={`font-medium ${
                      t.status === "done"
                        ? "text-slate-400 line-through"
                        : ""
                    }`}
                  >
                    {t.title}
                  </span>
                  {subs.length > 0 && (
                    <span className="text-xs text-slate-500">
                      {subDoneCount}/{subs.length}（
                      {Math.round((subDoneCount / subs.length) * 100)}%）
                    </span>
                  )}
                  {dueLabel(t.due_date, t.status)}
                  {t.start_date && <span className="text-xs text-sky-600">開始 {t.start_date.slice(0, 10)}</span>}
                </div>
                {bodyText && (
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">
                    <MdText text={bodyText} />
                  </p>
                )}
                {subs.length > 0 && (
                  <ProgressBar
                    value={subDoneCount}
                    max={subs.length}
                    className="mt-2"
                  />
                )}
                {subs.length > 0 && (
                  <ul
                    className="mt-2 space-y-1"
                    onClick={(e) => e.stopPropagation()}
                  >
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
            </div>
            <div className="ml-3 flex gap-1" onClick={(e) => e.stopPropagation()}>
              {t.status !== "done" && (
                <>
                  <button
                    onClick={() => moveTask(t.id, "up")}
                    className="rounded px-1 text-sm text-slate-400 hover:text-slate-700"
                    title="上に移動"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveTask(t.id, "down")}
                    className="rounded px-1 text-sm text-slate-400 hover:text-slate-700"
                    title="下に移動"
                  >
                    ▼
                  </button>
                </>
              )}
              <button
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  openTaskCtxMenu(rect.left, rect.bottom);
                }}
                title="メニュー"
                aria-label="メニュー"
                className="rounded px-1.5 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ⋮
              </button>
            </div>
          </>
        )}
      </li>
    );
  };

  // --- Main render ---

  const rootProjects = childProjectsMap.get(null) ?? [];
  const rootTasks = (tasksByProject.get(null) ?? []).filter(
    (t) => t.status !== "done",
  );
  const totalActive = tasks.filter((t) => t.status !== "done").length;

  const currentLabel =
    currentProjectId === null
      ? "ルート"
      : (projects.find((p) => p.id === currentProjectId)?.name ?? "タスク");

  const projectPath = (projectId: number | null): string => {
    if (projectId === null) return "🏠 ルート";
    const path = buildBreadcrumb(projects, projectId)
      .map((p) => p.name)
      .join(" / ");
    return `🏠 ルート / ${path}`;
  };

  const searchResults = useMemo<TreeSearchResult[]>(() => {
    const q = normalizeQuery(treeQuery);
    if (!q) return [];
    const out: TreeSearchResult[] = [];
    for (const p of projects) {
      if (matchesQuery(p.name, q)) {
        out.push({
          key: `p-${p.id}`,
          icon: "📁",
          label: p.name,
          path: projectPath(p.parent_id ?? null),
          onClick: () => navigateTo(p.id),
        });
      }
    }
    for (const t of tasks) {
      if (matchesQuery(t.title, q)) {
        out.push({
          key: `t-${t.id}`,
          icon: "📋",
          label: t.title,
          path: projectPath(t.project_id ?? null),
          onClick: () => openTaskFromTree(t),
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeQuery, projects, tasks]);

  const treeContent = (
    <div onKeyDown={handleTreeKeyDown}>
      <TreeSearch
        query={treeQuery}
        onQueryChange={setTreeQuery}
        placeholder="プロジェクト・タスクを検索"
      />
      {treeQuery ? (
        renderTreeSearchResults(searchResults)
      ) : (
        <>
          <SidebarShortcuts
            favorites={favoriteEntries}
            recents={recentEntries}
            storagePrefix="goatask:project-shortcuts"
          />
          <ul role="tree" className="space-y-0.5">
            <li role="treeitem">
              <button
                onClick={() => navigateTo(null)}
                data-tree-node="root"
                className={`w-full rounded px-2 py-1.5 text-left text-sm ${
                  currentProjectId === null
                    ? "bg-slate-200 font-bold text-slate-900"
                    : "hover:bg-slate-100"
                }`}
              >
                🏠 ルート
                {totalActive > 0 && (
                  <span className="ml-1 text-xs text-slate-400">
                    {totalActive}
                  </span>
                )}
              </button>
            </li>
            {rootProjects.map((p) => renderTreeProject(p, 0))}
            {rootTasks.map((t) => renderTreeTask(t, 0))}
          </ul>
        </>
      )}
    </div>
  );

  return (
    <div
      className={isMobile ? "h-full" : "flex h-full gap-4"}
      onDragOver={(e) => {
        if (dragItemRef.current) e.preventDefault();
      }}
    >
      {/* Sidebar (desktop) */}
      {!isMobile && (
        <aside
          className={`w-60 shrink-0 overflow-y-auto rounded-lg border bg-white p-2 transition-colors ${
            isDropTargetFor(null) && dragItem
              ? "border-blue-400 ring-2 ring-blue-400"
              : "border-slate-200"
          }`}
          onDragOver={(e) => handleFolderDragOver(e, null)}
          onDrop={(e) => handleFolderDrop(e, null)}
        >
          <div className="mb-2 px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              ナビゲーション
            </h2>
          </div>
          {treeContent}
        </aside>
      )}

      {/* Sidebar (mobile drawer) */}
      {isMobile && (
        <MobileDrawer
          open={treeOpen}
          onClose={() => setTreeOpen(false)}
          title="ナビゲーション"
        >
          {treeContent}
        </MobileDrawer>
      )}

      {/* Main content */}
      <div className={isMobile ? "h-full overflow-y-auto" : "flex-1 overflow-y-auto"}>
        {isMobile && (
          <button
            onClick={() => setTreeOpen(true)}
            className="mb-3 inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-100"
            aria-label="ナビゲーションを開く"
          >
            <span aria-hidden="true">☰</span>
            <span>{currentLabel}</span>
          </button>
        )}
        {/* Breadcrumb */}
        <nav className="mb-4 flex items-center gap-1.5 text-sm">
          <button
            onClick={() => navigateTo(null)}
            className={`rounded px-1.5 py-0.5 ${
              currentProjectId === null
                ? "font-bold text-slate-900"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            🏠 ルート
          </button>
          {breadcrumb.map((p) => (
            <Fragment key={p.id}>
              <span className="text-slate-300">/</span>
              <button
                onClick={() => navigateTo(p.id)}
                className={`rounded px-1.5 py-0.5 ${
                  p.id === currentProjectId
                    ? "font-bold text-slate-900"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                📁 {p.name}
              </button>
            </Fragment>
          ))}
        </nav>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">{currentLabel}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-slate-500">
              並び順
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="rounded border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none"
              >
                {TASK_SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => setShowNewTaskForm((v) => !v)}
              className="relative rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
            >
              {showNewTaskForm ? "× 閉じる" : "＋ タスク"}
              {!showNewTaskForm && hasNewDraftFlag && (
                <span
                  title="下書きあり"
                  className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-900"
                >
                  下書
                </span>
              )}
            </button>
            <button
              onClick={() => onCreateProjectIn(currentProjectId)}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              ＋ プロジェクト
            </button>
          </div>
        </div>

        {(error || queryErrorMsg) && (
          <div className="mb-4 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error ?? queryErrorMsg}
          </div>
        )}

        {/* Sub-project cards */}
        {directProjects.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-2">
            {directProjects.map((p) => {
              const count = recursiveTaskCount.get(p.id) ?? 0;
              const doneCount = recursiveDoneCount.get(p.id) ?? 0;
              const totalCount = count + doneCount;
              const subCount = (childProjectsMap.get(p.id) ?? []).length;
              const isDrop = isDropTargetFor(p.id);
              const longPress = createLongPressHandlers(longPressStore, `project:${p.id}`, (x, y) =>
                openProjectCtxMenu(x, y, p.id),
              );
              return (
                <div
                  key={p.id}
                  className={`group relative flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all ${
                    isDrop
                      ? "border-blue-400 bg-blue-50 ring-2 ring-blue-400"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  } ${dragItem?.type === "project" && dragItem.id === p.id ? "opacity-40" : ""}`}
                  onClick={() => navigateTo(p.id)}
                  onClickCapture={longPress.onClickCapture}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openProjectCtxMenu(e.clientX, e.clientY, p.id);
                  }}
                  onTouchStart={longPress.onTouchStart}
                  onTouchMove={longPress.onTouchMove}
                  onTouchEnd={longPress.onTouchEnd}
                  draggable
                  onDragStart={(e) => handleDragStart(e, "project", p.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleFolderDragOver(e, p.id)}
                  onDrop={(e) => handleFolderDrop(e, p.id)}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      openProjectCtxMenu(rect.left, rect.bottom, p.id);
                    }}
                    title="メニュー"
                    aria-label="メニュー"
                    className={`absolute right-1.5 top-1.5 rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 ${
                      isMobile ? "" : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    ⋮
                  </button>
                  <span className="text-2xl">📁</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="text-xs text-slate-500">
                      {totalCount > 0 && `${doneCount}/${totalCount}件完了`}
                      {totalCount > 0 && subCount > 0 && " · "}
                      {subCount > 0 && `${subCount}サブ`}
                      {totalCount === 0 && subCount === 0 && "空"}
                    </div>
                    {totalCount > 0 && (
                      <ProgressBar
                        value={doneCount}
                        max={totalCount}
                        className="mt-1.5"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* New task form */}
        {showNewTaskForm && (
        <form
          onSubmit={onSubmit}
          className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-lg font-semibold">新しいタスク</h2>
            <span className="text-xs text-slate-400">
              → {currentLabel} に追加
            </span>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="タイトル"
            className="mb-2 w-full rounded border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
          />
          <div className="mb-2">
            <TaskDescriptionEditor
              value={description}
              onChange={setDescription}
              placeholder="詳細（任意）。「・」「- 」「- [ ]」で始まる行はチェックリストになります。"
              rows={3}
            />
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              開始日（任意）
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded border border-slate-300 px-2 py-1 focus:border-slate-500 focus:outline-none" />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              期限（任意）
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1 focus:border-slate-500 focus:outline-none"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!title.trim()}
              className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 disabled:bg-slate-400"
            >
              追加
            </button>
            <button
              type="button"
              onClick={() => {
                clearDraft(newDraftKey(currentProjectId));
                setTitle("");
                setDescription("");
                setStartDate("");
                setDueDate("");
                setShowNewTaskForm(false);
              }}
              className="rounded border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-100"
            >
              キャンセル
            </button>
          </div>
        </form>
        )}

        {/* Task list */}
        <section
          className={`rounded-lg p-2 transition-colors ${
            dragItem && isDropTargetFor(currentProjectId)
              ? "bg-blue-50 ring-2 ring-blue-300"
              : ""
          }`}
          onDragOver={(e) => handleFolderDragOver(e, currentProjectId)}
          onDrop={(e) => handleFolderDrop(e, currentProjectId)}
        >
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">
              タスク一覧
              {activeTasks.length > 0 && (
                <span className="ml-2 text-sm font-normal text-slate-500">
                  {activeTasks.length}件
                  {activeTasks.length !== activeTasksAll.length && (
                    <span className="ml-1 text-slate-400">
                      / 全{activeTasksAll.length}件
                    </span>
                  )}
                </span>
              )}
            </h2>
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="text-slate-500">状態:</span>
              <button
                type="button"
                onClick={() =>
                  setFilter((f) => ({ ...f, todo: !f.todo }))
                }
                className={`rounded px-1.5 py-0.5 ${
                  filter.todo
                    ? "bg-slate-200 text-slate-700"
                    : "border border-slate-300 text-slate-400"
                }`}
              >
                未着手
              </button>
              <button
                type="button"
                onClick={() =>
                  setFilter((f) => ({ ...f, doing: !f.doing }))
                }
                className={`rounded px-1.5 py-0.5 ${
                  filter.doing
                    ? "bg-amber-200 text-amber-800"
                    : "border border-slate-300 text-slate-400"
                }`}
              >
                進行中
              </button>
              <span className="ml-2 text-slate-500">期限:</span>
              <select
                value={filter.due}
                onChange={(e) =>
                  setFilter((f) => ({
                    ...f,
                    due: e.target.value as TaskDueFilter,
                  }))
                }
                className="rounded border border-slate-300 px-1.5 py-0.5 focus:border-slate-500 focus:outline-none"
              >
                <option value="all">全部</option>
                <option value="with">期限あり</option>
                <option value="overdue">期限切れ</option>
                <option value="today">今日</option>
              </select>
              {doneTasks.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTidied((v) => !v)}
                  className="ml-2 rounded border border-slate-300 px-1.5 py-0.5 text-slate-600 hover:bg-slate-50"
                >
                  {tidied
                    ? `完了済みを戻す（${doneTasks.length}）`
                    : `完了済みを片付ける（${doneTasks.length}）`}
                </button>
              )}
            </div>
          </div>
          {activeTasks.length === 0 && directProjects.length === 0 ? (
            <p className="text-sm text-slate-500">
              このプロジェクトにはまだ項目がありません。
            </p>
          ) : activeTasks.length === 0 ? (
            <p className="text-sm text-slate-500">タスクはありません。</p>
          ) : (
            <ul className="space-y-2">
              {activeTasks.map((t) => renderTaskCard(t))}
            </ul>
          )}
          {tidied && doneTasks.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowDone((v) => !v)}
                className="mb-2 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
              >
                <span>{showDone ? "▾" : "▸"}</span>
                完了済み（{doneTasks.length}）
              </button>
              {showDone && (
                <ul className="space-y-2">
                  {doneTasks.map((t) => renderTaskCard(t))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>

      {undoState && (
        <UndoToast
          message={undoState.message}
          onUndo={restoreTask}
          onDismiss={() => setUndoState(null)}
        />
      )}
      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          className="fixed z-50 min-w-[180px] rounded border border-slate-200 bg-white py-1 text-sm shadow-lg"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
        >
          <button
            type="button"
            onClick={() => {
              const id = ctxMenu.projectId;
              setCtxMenu(null);
              onCreateProjectIn(id);
            }}
            className="block w-full px-3 py-1.5 text-left hover:bg-slate-100"
          >
            ＋ サブプロジェクト追加
          </button>
          <button
            type="button"
            onClick={() => {
              favorites.toggle(ctxMenu.projectId);
              setCtxMenu(null);
            }}
            className="block w-full px-3 py-1.5 text-left hover:bg-slate-100"
          >
            {favorites.has(ctxMenu.projectId)
              ? "★ お気に入り解除"
              : "☆ お気に入り追加"}
          </button>
          <button
            type="button"
            onClick={() => {
              const p = projects.find((x) => x.id === ctxMenu.projectId);
              setCtxMenu(null);
              if (p) onRenameProject(p);
            }}
            className="block w-full px-3 py-1.5 text-left hover:bg-slate-100"
          >
            ✎ リネーム
          </button>
          <button
            type="button"
            onClick={() => {
              const p = projects.find((x) => x.id === ctxMenu.projectId);
              setCtxMenu(null);
              if (p) onDeleteProject(p);
            }}
            className="block w-full px-3 py-1.5 text-left text-rose-600 hover:bg-rose-50"
          >
            🗑 削除
          </button>
        </div>
      )}
      {taskCtxMenu && (
        <div
          ref={taskCtxMenuRef}
          className="fixed z-50 min-w-[140px] rounded border border-slate-200 bg-white py-1 text-sm shadow-lg"
          style={{ top: taskCtxMenu.y, left: taskCtxMenu.x }}
        >
          <button
            type="button"
            onClick={() => {
              const t = tasks.find((x) => x.id === taskCtxMenu.taskId);
              setTaskCtxMenu(null);
              if (t) startEdit(t);
            }}
            className="block w-full px-3 py-1.5 text-left hover:bg-slate-100"
          >
            ✎ 編集
          </button>
          <button
            type="button"
            onClick={() => {
              const t = tasks.find((x) => x.id === taskCtxMenu.taskId);
              setTaskCtxMenu(null);
              if (t) onDeleteTask(t);
            }}
            className="block w-full px-3 py-1.5 text-left text-rose-600 hover:bg-rose-50"
          >
            🗑 削除
          </button>
        </div>
      )}
    </div>
  );
}
