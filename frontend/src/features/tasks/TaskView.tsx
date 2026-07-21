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
} from "../../api/tasks";
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject,
  type Project,
} from "../../api/projects";
import { useIsMobile } from "../../shared/lib/useIsMobile";
import { LoadingIndicator } from "../../shared/components/LoadingIndicator";
import { useDialogs } from "../../shared/components/DialogProvider";
import { CollectionShell } from "../../shared/components/CollectionShell";
import { TreeSearch } from "../../shared/components/TreeSearch";
import {
  matchesQuery,
  normalizeQuery,
  renderTreeSearchResults,
  type TreeSearchResult,
} from "../../shared/components/treeSearchUtils";
import {
  TASK_SORT_OPTIONS,
  loadSortMode,
  sortByMode,
  type SortMode,
} from "../../shared/lib/sortDirectory";
import { useFavorites, useRecent } from "../../shared/lib/folderShortcuts";
import {
  SidebarShortcuts,
  type ShortcutEntry,
} from "../../shared/components/SidebarShortcuts";
import { UndoToast } from "../../shared/components/UndoToast";
import { DirectoryTreeRow } from "../../shared/components/DirectoryTreeRow";
import { handleTreeKeyDown } from "../../shared/lib/treeKeyboard";
import {
  buildBreadcrumb,
  buildChildMap,
  buildItemsByParent,
  expandAncestors,
  flatTreeOptions,
  isDescendant,
} from "../../shared/lib/directoryTree";
import { useHoverExpand } from "../../shared/lib/useHoverExpand";
import { ContextMenu, ContextMenuItem } from "../../shared/components/ContextMenu";
import { useContextMenu } from "../../shared/components/useContextMenu";
import { MdText } from "../../shared/lib/mdInline";
import { stripBulletLines } from "./utils/taskText";
import { TaskDescriptionEditor } from "./components/TaskDescriptionEditor";
import {
  parseProjectMarkdown,
  projectToMarkdown,
} from "./utils/projectText";
import { CardReorderControls } from "../../shared/components/CardReorderControls";
import {
  animateCardReorder,
  mergeVisibleOrder,
  reorderItemsInSlots,
  reorderIds,
  useTouchCardReorder,
} from "../../shared/lib/cardReorder";
import {
  clearDraft,
  editDraftKey,
  hasDraft,
  loadDraft,
  newDraftKey,
  saveDraft,
} from "./utils/taskDraft";

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
type DropTarget =
  | { kind: "folder"; projectId: number | null }
  | { kind: "reorder"; taskId: number; before: boolean }
  | null;

interface TaskViewProps {
  initialTaskId?: number | null;
  onInitialTaskHandled?: () => void;
}

export function TaskView({ initialTaskId, onInitialTaskHandled }: TaskViewProps = {}) {
  const queryClient = useQueryClient();
  const { confirmDialog, promptDialog, choiceDialog } = useDialogs();
  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: listTasks });
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
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
  const editPanelRef = useRef<HTMLDivElement | null>(null);

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
  const projectImportRef = useRef<HTMLInputElement | null>(null);
  const [projectTransferBusy, setProjectTransferBusy] = useState(false);

  const [dragItem, setDragItem] = useState<DragItem>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const dragItemRef = useRef<DragItem>(null);
  // Mirror of dropTarget for reading inside the drop event: state updates from
  // the last dragover may not be committed by the time drop fires in prod builds.
  const dropTargetRef = useRef<DropTarget>(null);
  const applyDropTarget = (next: DropTarget) => {
    dropTargetRef.current = next;
    setDropTarget(next);
  };

  const [focusTaskId, setFocusTaskId] = useState<number | null>(null);
  const taskRefs = useRef<Map<number, HTMLLIElement>>(new Map());

  const projectMenu = useContextMenu<{ projectId: number }>(
    PROJECT_MENU_W,
    PROJECT_MENU_H,
  );
  const rootMenu = useContextMenu<{ parentId: number | null }>(190, 90);
  const taskMenu = useContextMenu<{ taskId: number }>(TASK_MENU_W, TASK_MENU_H);
  const ctxMenu = projectMenu.menu;
  const taskCtxMenu = taskMenu.menu;

  const openProjectCtxMenu = (x: number, y: number, projectId: number) => {
    taskMenu.close();
    projectMenu.open(x, y, { projectId });
  };
  const toggleProjectCtxMenu = (x: number, y: number, projectId: number) => {
    taskMenu.close();
    projectMenu.toggle(x, y, { projectId }, (curr) => curr.projectId === projectId);
  };
  const openRootCtxMenu = (x: number, y: number, parentId: number | null) => {
    projectMenu.close();
    taskMenu.close();
    rootMenu.open(x, y, { parentId });
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
    // Prune the persisted selection if the project was removed elsewhere.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const hasNewDraftFlag = useMemo(
    () => hasDraft(newDraftKey(currentProjectId)),
    // Re-check whenever the fields the draft mirrors change, so the badge
    // updates as the user types or opens/closes the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentProjectId, showNewTaskForm, title, description, startDate, dueDate],
  );

  /* eslint-disable react-hooks/set-state-in-effect */
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
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!showNewTaskForm) return;
    saveDraft(newDraftKey(currentProjectId), {
      title,
      description,
      start_date: startDate,
      due_date: dueDate,
    });
  }, [showNewTaskForm, currentProjectId, title, description, startDate, dueDate]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (editingId === null) return;
    const d = loadDraft(editDraftKey(editingId));
    if (d) {
      setEditTitle(d.title);
      setEditDescription(d.description);
      setEditStartDate(d.start_date);
      setEditDueDate(d.due_date);
    }
  }, [editingId]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
    if (editingId === null) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!editPanelRef.current?.contains(target)) cancelEdit();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
    // cancelEdit only changes local edit state; the active editing id controls
    // registration and avoids capturing a stale task id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

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
  }, [projects, childProjectsMap, tasksByProject]);

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
  }, [projects, childProjectsMap, tasksByProject]);

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
  }, [projects, childProjectsMap, tasksByProject]);

  const directProjectsRaw = useMemo(
    () => childProjectsMap.get(currentProjectId) ?? [],
    [childProjectsMap, currentProjectId],
  );
  const directTasksRaw = useMemo(
    () => tasksByProject.get(currentProjectId) ?? [],
    [tasksByProject, currentProjectId],
  );
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

  const displayedTasks = tidied ? [...activeTasks, ...doneTasks] : activeTasks;

  const persistTaskOrder = async (visibleIds: number[]) => {
    const allIds = directTasksRaw.map((task) => task.id);
    const orderedIds = mergeVisibleOrder(allIds, visibleIds);
    const previous = queryClient.getQueryData<Task[]>(["tasks"]);
    animateCardReorder(() => {
      queryClient.setQueryData<Task[]>(["tasks"], (current) =>
        current ? reorderItemsInSlots(current, orderedIds) : current,
      );
    });
    try {
      await reorderTasks(orderedIds);
      setSortMode("manual");
      await reload();
    } catch (error) {
      if (previous) {
        animateCardReorder(
          () => queryClient.setQueryData(["tasks"], previous),
          true,
        );
      }
      throw error;
    }
  };

  const touchTaskReorder = useTouchCardReorder(
    editingId === null,
    async (draggedId, target) => {
      if (!target) return;
      const ids = reorderIds(
        displayedTasks.map((task) => task.id),
        draggedId,
        target.id,
        target.before,
      );
      try {
        await persistTaskOrder(ids);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
  );

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

  const canReorderTask = (overTaskId: number) => {
    const item = dragItemRef.current;
    if (!item || item.type !== "task" || item.id === overTaskId) return false;
    return displayedTasks.some((task) => task.id === item.id) &&
      displayedTasks.some((task) => task.id === overTaskId);
  };

  const handleTaskReorderDragOver = (e: ReactDragEvent, overTaskId: number) => {
    if (!canReorderTask(overTaskId)) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    applyDropTarget({
      kind: "reorder",
      taskId: overTaskId,
      before: e.clientY < rect.top + rect.height / 2,
    });
  };

  const handleTaskReorderDrop = async (e: ReactDragEvent, overTaskId: number) => {
    e.preventDefault();
    e.stopPropagation();
    const item = dragItemRef.current;
    const target = dropTargetRef.current;
    handleDragEnd();
    if (!item || item.type !== "task" || target?.kind !== "reorder") return;
    try {
      await persistTaskOrder(
        reorderIds(
          displayedTasks.map((task) => task.id),
          item.id,
          overTaskId,
          target.before,
        ),
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };

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
    applyDropTarget(null);
    hoverExpand.clear();
  };

  const handleFolderDragOver = (
    e: ReactDragEvent,
    targetProjectId: number | null,
  ) => {
    if (!dragItemRef.current) return;
    e.stopPropagation();
    if (!canDrop(targetProjectId)) {
      if (dropTargetRef.current !== null) applyDropTarget(null);
      hoverExpand.clear();
      return;
    }
    e.preventDefault();
    applyDropTarget({ kind: "folder", projectId: targetProjectId });
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
    applyDropTarget(null);
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
    const ids = displayedTasks.map((task) => task.id);
    const idx = ids.indexOf(taskId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= ids.length) return;
    [ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]];
    try {
      await persistTaskOrder(ids);
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
    const name = await promptDialog({ title: "新しいプロジェクト", placeholder: "プロジェクト名", confirmLabel: "作成" });
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
    const name = await promptDialog({ title: "プロジェクト名を変更", defaultValue: p.name, confirmLabel: "変更" });
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
    const moveTo = await choiceDialog({
      title: `プロジェクト「${p.name}」を削除しますか？`,
      message: `${msg}\n\n直下のタスクの移動先を選択してください。`,
      options: [
        { value: "parent", label: `親プロジェクト（${parentLabel}）へ移動` },
        { value: "unassigned", label: "未分類へ移動" },
      ],
    });
    if (!moveTo) return;
    if (!(await confirmDialog({ title: `プロジェクト「${p.name}」を削除しますか？`, message: "この操作は元に戻せません。", confirmLabel: "削除", danger: true }))) return;
    try {
      if (currentProjectId === p.id) {
        setCurrentProjectId(p.parent_id ?? null);
      }
      await deleteProject(p.id, moveTo as "parent" | "unassigned");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const downloadProjectText = () => {
    if (currentProjectId === null) return;
    const project = projects.find((p) => p.id === currentProjectId);
    if (!project) return;
    const text = projectToMarkdown(project, projects, tasks);
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `goatask-project-${project.name.replace(/[^\p{L}\p{N}_-]+/gu, "-") || project.id}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const importProjectText = async (file: File | null) => {
    if (!file || currentProjectId === null) return;
    setProjectTransferBusy(true);
    setError(null);
    try {
      const parsed = parseProjectMarkdown(await file.text());
      const target = projects.find((p) => p.id === currentProjectId);
      if (!target || !parsed.project) throw new Error("対象プロジェクトが見つかりません");

      // The first heading is always imported into the currently open project.
      const projectIds = new Map<number, number>();
      const first = parsed.projects[0];
      if (first?.id) projectIds.set(first.id, target.id);
      await updateProject(target.id, { name: parsed.project.name, parent_id: target.parent_id ?? null });

      for (const source of parsed.projects.slice(1)) {
        let parentId = target.id;
        if (source.parentId && projectIds.has(source.parentId)) parentId = projectIds.get(source.parentId)!;
        if (source.id) {
          const existing = projects.find((p) => p.id === source.id);
          if (existing) {
            projectIds.set(source.id, existing.id);
            await updateProject(existing.id, { name: source.name, parent_id: parentId });
            continue;
          }
        }
        const created = await createProject({ name: source.name, parent_id: parentId });
        if (source.id) projectIds.set(source.id, created.id);
      }

      for (const source of parsed.tasks) {
        const projectId = source.projectId ? (projectIds.get(source.projectId) ?? target.id) : target.id;
        const existing = source.id ? tasks.find((t) => t.id === source.id) : undefined;
        if (existing) {
          await updateTask(existing.id, {
            ...existing,
            title: source.title,
            description: source.description,
            status: source.status,
            start_date: source.start_date,
            due_date: source.due_date,
            project_id: projectId,
          });
        } else {
          await createTask({
            title: source.title,
            description: source.description,
            status: source.status,
            start_date: source.start_date,
            due_date: source.due_date,
            project_id: projectId,
          });
        }
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "プロジェクト文章のインポートに失敗しました");
    } finally {
      setProjectTransferBusy(false);
      if (projectImportRef.current) projectImportRef.current.value = "";
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
      <DirectoryTreeRow
        key={`p-${p.id}`}
        depth={depth}
        isOpen={isOpen}
        hasChildren={hasChildren}
        isCurrent={isCurrent}
        isDropTarget={isDrop}
        isDragging={dragItem?.type === "project" && dragItem.id === p.id}
        label={p.name}
        count={count}
        dataTreeNode={`project:${p.id}`}
        isMobile={isMobile}
        onClick={() => {
          setCurrentProjectId(p.id);
          setExpanded((prev) => {
            const next = expandAncestors(projects, prev, p.id);
            if (prev.has(p.id)) next.delete(p.id);
            return next;
          });
        }}
        onToggleExpand={toggleProjectExpand}
        onContextMenu={(x, y) => openProjectCtxMenu(x, y, p.id)}
        onMenuToggle={(x, y) => toggleProjectCtxMenu(x, y, p.id)}
        onDragStart={(e) => handleDragStart(e, "project", p.id)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleFolderDragOver(e, p.id)}
        onDragLeave={(e) => handleFolderDragLeave(e, p.id)}
        onDrop={(e) => handleFolderDrop(e, p.id)}
      >
        {subProjects.map((sp) => renderTreeProject(sp, depth + 1))}
        {subTasks.map((t) => renderTreeTask(t, depth + 1))}
      </DirectoryTreeRow>
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    const visibleIndex = displayedTasks.findIndex((task) => task.id === t.id);
    const reorderEnabled = !isEditing;
    const nativeIndicator =
      dropTarget?.kind === "reorder" && dropTarget.taskId === t.id
        ? dropTarget.before
          ? "before"
          : "after"
        : null;
    const touchIndicator =
      touchTaskReorder.target?.id === t.id
        ? touchTaskReorder.target.before
          ? "before"
          : "after"
        : null;
    const indicator = touchIndicator ?? nativeIndicator;

    const openTaskCtxMenu = (x: number, y: number) => {
      projectMenu.close();
      taskMenu.open(x, y, { taskId: t.id });
    };

    return (
      <li
        key={t.id}
        ref={(el) => {
          if (el) taskRefs.current.set(t.id, el);
          else taskRefs.current.delete(t.id);
        }}
        data-reorder-card={t.id}
        className={`relative flex items-start justify-between rounded-lg border bg-white p-3 shadow-sm transition-[transform,opacity,border-color,box-shadow,background-color] ease-out hover:bg-slate-50 hover:shadow-md ${
          isFocused
            ? "border-blue-400 ring-2 ring-blue-300"
            : "border-slate-200 hover:border-slate-300"
        } ${dragItem?.type === "task" || touchTaskReorder.activeId !== null ? "duration-200" : "duration-75"} ${
          indicator === "before"
            ? "translate-y-1.5"
            : indicator === "after"
              ? "-translate-y-1.5"
              : "translate-y-0"
        } ${
          (dragItem?.type === "task" && dragItem.id === t.id) ||
          touchTaskReorder.activeId === t.id
            ? "scale-[0.99] opacity-40"
            : "scale-100"
        } ${!isEditing ? "cursor-pointer" : ""}`}
        draggable={reorderEnabled}
        onDragStart={(e) => handleDragStart(e, "task", t.id)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleTaskReorderDragOver(e, t.id)}
        onDrop={(e) => handleTaskReorderDrop(e, t.id)}
        {...touchTaskReorder.bind(t.id)}
        onClick={() => {
          if (isEditing) return;
          const dismissed = taskMenu.closeOnCardClick() || projectMenu.closeOnCardClick();
          if (!dismissed) startEdit(t);
        }}
        onContextMenu={(e) => {
          if (isEditing) return;
          e.preventDefault();
          e.stopPropagation();
          openTaskCtxMenu(e.clientX, e.clientY);
        }}
      >
        {indicator === "before" && (
          <span className="pointer-events-none absolute -top-1 left-0 right-0 h-0.5 rounded-full bg-blue-500" />
        )}
        {indicator === "after" && (
          <span className="pointer-events-none absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-blue-500" />
        )}
        {editingId === t.id ? (
          <div ref={editPanelRef} className="flex-1">
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
            <div data-reorder-ignore className="ml-3 flex gap-1" onClick={(e) => e.stopPropagation()}>
              <CardReorderControls
                canMoveUp={reorderEnabled && visibleIndex > 0}
                canMoveDown={reorderEnabled && visibleIndex < displayedTasks.length - 1}
                onMoveUp={() => void moveTask(t.id, "up")}
                onMoveDown={() => void moveTask(t.id, "down")}
              />
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  projectMenu.close();
                  const rect = e.currentTarget.getBoundingClientRect();
                  taskMenu.toggle(
                    rect.left,
                    rect.bottom,
                    { taskId: t.id },
                    (curr) => curr.taskId === t.id,
                  );
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
    <div
      className="min-h-full"
      onKeyDown={handleTreeKeyDown}
      onContextMenu={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        openRootCtxMenu(e.clientX, e.clientY, currentProjectId);
      }}
    >
      <TreeSearch
        query={treeQuery}
        onQueryChange={setTreeQuery}
        placeholder="タスクを検索"
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
                onContextMenu={(e) => {
                  e.preventDefault();
                  openRootCtxMenu(e.clientX, e.clientY, null);
                }}
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

  if (tasksQuery.isLoading || projectsQuery.isLoading) {
    return <LoadingIndicator />;
  }

  return (
    <CollectionShell
      isMobile={isMobile}
      treeContent={treeContent}
      treeOpen={treeOpen}
      onTreeOpenChange={setTreeOpen}
      mobileToggleLabel={currentLabel}
      sidebarWidthClass="w-60"
      sidebarClassName={
        isDropTargetFor(null) && dragItem
          ? "border-blue-400 ring-2 ring-blue-400"
          : "border-slate-200"
      }
      sidebarProps={{
        onDragOver: (e) => handleFolderDragOver(e, null),
        onDrop: (e) => handleFolderDrop(e, null),
      }}
      wrapperProps={{
        onDragOver: (e) => {
          if (dragItemRef.current) e.preventDefault();
        },
      }}
    >
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
            {currentProjectId !== null && (
              <>
                <input
                  ref={projectImportRef}
                  type="file"
                  accept="text/markdown,.md,text/plain,.txt"
                  className="hidden"
                  onChange={(e) => void importProjectText(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={downloadProjectText}
                  disabled={projectTransferBusy}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50"
                  title="このプロジェクトと配下のタスクをMarkdownで保存"
                >
                  ↓ 文章出力
                </button>
                <button
                  type="button"
                  onClick={() => projectImportRef.current?.click()}
                  disabled={projectTransferBusy}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50"
                  title="Markdownを読み込み、このプロジェクトを更新"
                >
                  {projectTransferBusy ? "読み込み中..." : "↑ 文章から読込"}
                </button>
              </>
            )}
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
              return (
                <div
                  key={p.id}
                  className={`group relative flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all ${
                    isDrop
                      ? "border-blue-400 bg-blue-50 ring-2 ring-blue-400"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  } ${dragItem?.type === "project" && dragItem.id === p.id ? "opacity-40" : ""}`}
                  onClick={() => navigateTo(p.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openProjectCtxMenu(e.clientX, e.clientY, p.id);
                  }}
                  draggable
                  onDragStart={(e) => handleDragStart(e, "project", p.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleFolderDragOver(e, p.id)}
                  onDrop={(e) => handleFolderDrop(e, p.id)}
                >
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      taskMenu.close();
                      const rect = e.currentTarget.getBoundingClientRect();
                      projectMenu.toggle(
                        rect.left,
                        rect.bottom,
                        { projectId: p.id },
                        (curr) => curr.projectId === p.id,
                      );
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

      {undoState && (
        <UndoToast
          message={undoState.message}
          onUndo={restoreTask}
          onDismiss={() => setUndoState(null)}
        />
      )}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          menuRef={projectMenu.ref}
          minWidth={180}
        >
          <ContextMenuItem
            onClick={() => {
              const id = ctxMenu.projectId;
              projectMenu.close();
              onCreateProjectIn(id);
            }}
          >
            ＋ サブプロジェクト追加
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              favorites.toggle(ctxMenu.projectId);
              projectMenu.close();
            }}
          >
            {favorites.has(ctxMenu.projectId)
              ? "★ お気に入り解除"
              : "☆ お気に入り追加"}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              const p = projects.find((x) => x.id === ctxMenu.projectId);
              projectMenu.close();
              if (p) onRenameProject(p);
            }}
          >
            ✎ リネーム
          </ContextMenuItem>
          <ContextMenuItem
            danger
            onClick={() => {
              const p = projects.find((x) => x.id === ctxMenu.projectId);
              projectMenu.close();
              if (p) onDeleteProject(p);
            }}
          >
            🗑 削除
          </ContextMenuItem>
        </ContextMenu>
      )}
      {rootMenu.menu && (
        <ContextMenu x={rootMenu.menu.x} y={rootMenu.menu.y} menuRef={rootMenu.ref}>
          <ContextMenuItem
            onClick={() => {
              const parentId = rootMenu.menu?.parentId ?? null;
              rootMenu.close();
              setCurrentProjectId(parentId);
              setShowNewTaskForm(true);
            }}
          >
            ＋ タスク作成
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              const parentId = rootMenu.menu?.parentId ?? null;
              rootMenu.close();
              onCreateProjectIn(parentId);
            }}
          >
            ＋ プロジェクト作成
          </ContextMenuItem>
        </ContextMenu>
      )}
      {taskCtxMenu && (
        <ContextMenu x={taskCtxMenu.x} y={taskCtxMenu.y} menuRef={taskMenu.ref}>
          <ContextMenuItem
            onClick={() => {
              const t = tasks.find((x) => x.id === taskCtxMenu.taskId);
              taskMenu.close();
              if (t) startEdit(t);
            }}
          >
            ✎ 編集
          </ContextMenuItem>
          <ContextMenuItem
            danger
            onClick={() => {
              const t = tasks.find((x) => x.id === taskCtxMenu.taskId);
              taskMenu.close();
              if (t) onDeleteTask(t);
            }}
          >
            🗑 削除
          </ContextMenuItem>
        </ContextMenu>
      )}
    </CollectionShell>
  );
}
