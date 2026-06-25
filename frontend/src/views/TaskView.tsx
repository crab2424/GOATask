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
  buildBreadcrumb,
  buildChildMap,
  buildItemsByParent,
  expandAncestors,
  flatTreeOptions,
  isDescendant,
} from "../lib/directoryTree";
import { useHoverExpand } from "../lib/useHoverExpand";

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

function stripBulletLines(description: string): string {
  return description
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("・") && !t.startsWith("- ");
    })
    .join("\n")
    .trim();
}

type DragItem = { type: "task" | "project"; id: number } | null;
type DropTarget =
  | { kind: "folder"; projectId: number | null }
  | { kind: "reorder"; taskId: number; before: boolean }
  | null;

export function TaskView() {
  const queryClient = useQueryClient();
  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: listTasks });
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const tasks = tasksQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const isMobile = useIsMobile();
  const [treeOpen, setTreeOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem("goatask-project-expanded");
      return saved
        ? new Set(JSON.parse(saved) as number[])
        : new Set<number>();
    } catch {
      return new Set<number>();
    }
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editProjectId, setEditProjectId] = useState<number | null>(null);

  const [showDone, setShowDone] = useState(false);
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
    ]);
    setError(null);
  };

  useEffect(() => {
    setCurrentProjectId((cur) =>
      cur !== null && !projects.some((proj) => proj.id === cur) ? null : cur,
    );
  }, [projects]);

  const queryError = tasksQuery.error ?? projectsQuery.error;
  const queryErrorMsg = queryError
    ? queryError instanceof Error
      ? queryError.message
      : String(queryError)
    : null;

  useEffect(() => {
    localStorage.setItem(
      "goatask-project-expanded",
      JSON.stringify([...expanded]),
    );
  }, [expanded]);

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

  const directProjects = childProjectsMap.get(currentProjectId) ?? [];
  const directTasks = tasksByProject.get(currentProjectId) ?? [];
  const activeTasks = directTasks.filter((t) => t.status !== "done");
  const doneTasks = directTasks.filter((t) => t.status === "done");

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

  const reorderIndicatorFor = (taskId: number): "before" | "after" | null => {
    if (!dropTarget || dropTarget.kind !== "reorder") return null;
    if (dropTarget.taskId !== taskId) return null;
    return dropTarget.before ? "before" : "after";
  };

  const canReorderTask = (overTaskId: number): boolean => {
    const item = dragItemRef.current;
    if (!item || item.type !== "task") return false;
    if (item.id === overTaskId) return false;
    const dragged = tasks.find((t) => t.id === item.id);
    const over = tasks.find((t) => t.id === overTaskId);
    if (!dragged || !over) return false;
    return (dragged.project_id ?? null) === (over.project_id ?? null);
  };

  // --- Navigation ---

  const navigateTo = (id: number | null) => {
    setCurrentProjectId(id);
    if (id !== null) {
      setExpanded((prev) => expandAncestors(projects, prev, id));
    }
    setTreeOpen(false);
  };

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

  const handleTaskReorderDragOver = (e: ReactDragEvent, overTaskId: number) => {
    if (!canReorderTask(overTaskId)) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    setDropTarget((prev) => {
      if (
        prev &&
        prev.kind === "reorder" &&
        prev.taskId === overTaskId &&
        prev.before === before
      ) {
        return prev;
      }
      return { kind: "reorder", taskId: overTaskId, before };
    });
  };

  const handleTaskReorderDrop = async (
    e: ReactDragEvent,
    overTaskId: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const item = dragItemRef.current;
    const target = dropTarget;
    dragItemRef.current = null;
    setDragItem(null);
    setDropTarget(null);
    hoverExpand.clear();
    if (!item || item.type !== "task") return;
    if (!target || target.kind !== "reorder" || target.taskId !== overTaskId)
      return;
    if (!canReorderTask(overTaskId)) return;

    const draggedId = item.id;
    const active = activeTasks.filter((t) => t.id !== draggedId);
    const overIdx = active.findIndex((t) => t.id === overTaskId);
    if (overIdx < 0) return;
    const insertAt = target.before ? overIdx : overIdx + 1;
    const dragged = activeTasks.find((t) => t.id === draggedId);
    if (!dragged) return;
    active.splice(insertAt, 0, dragged);
    const allIds = [...active, ...doneTasks].map((t) => t.id);
    try {
      await reorderTasks(allIds);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // --- Task CRUD ---

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await createTask({
        title: title.trim(),
        description: description.trim(),
        due_date: dateInputToIso(dueDate),
        project_id: currentProjectId,
      });
      setTitle("");
      setDescription("");
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
    const subs = t.subtasks ?? [];
    const msg = [
      `タスク「${t.title}」を削除しますか？`,
      "",
      "【影響範囲】",
      subs.length > 0 ? `・サブタスク ${subs.length}件も削除されます` : null,
      "・この操作は取り消せません",
    ]
      .filter(Boolean)
      .join("\n");
    if (!confirm(msg)) return;
    await deleteTask(t.id);
    await reload();
  };

  const moveTask = async (taskId: number, direction: "up" | "down") => {
    const idx = activeTasks.findIndex((t) => t.id === taskId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= activeTasks.length) return;
    const reordered = [...activeTasks];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    const allIds = [...reordered, ...doneTasks].map((t) => t.id);
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
    setEditDueDate(isoToDateInput(t.due_date));
    setEditProjectId(t.project_id ?? null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
    setEditDueDate("");
    setEditProjectId(null);
  };

  const saveEdit = async (t: Task) => {
    if (!editTitle.trim()) return;
    try {
      await updateTask(t.id, {
        ...t,
        title: editTitle.trim(),
        description: editDescription.trim(),
        due_date: dateInputToIso(editDueDate),
        project_id: editProjectId,
      });
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

    return (
      <li
        key={`p-${p.id}`}
        className={`rounded ${isDrop ? "bg-blue-50 ring-2 ring-blue-400" : ""}`}
        onDragOver={(e) => handleFolderDragOver(e, p.id)}
        onDragLeave={(e) => handleFolderDragLeave(e, p.id)}
        onDrop={(e) => handleFolderDrop(e, p.id)}
      >
        <button
          type="button"
          draggable
          onClick={() => {
            setCurrentProjectId(p.id);
            setExpanded((prev) => {
              const next = expandAncestors(projects, prev, p.id);
              if (hasChildren && prev.has(p.id)) next.delete(p.id);
              return next;
            });
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setCtxMenu({ x: e.clientX, y: e.clientY, projectId: p.id });
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
            {hasChildren && (
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
            )}
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

  const renderTreeTask = (t: Task, depth: number): ReactElement => (
    <li key={`t-${t.id}`}>
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
    const isDragging = dragItem?.type === "task" && dragItem.id === t.id;
    const indicator = reorderIndicatorFor(t.id);
    const isEditing = editingId === t.id;

    const isFocused = focusTaskId === t.id;

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
        } ${isDragging ? "opacity-40" : ""}`}
        draggable={!isEditing}
        onDragStart={(e) => {
          if (isEditing) {
            e.preventDefault();
            return;
          }
          handleDragStart(e, "task", t.id);
        }}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => {
          if (isEditing) {
            e.stopPropagation();
            return;
          }
          handleTaskReorderDragOver(e, t.id);
        }}
        onDrop={(e) => {
          if (isEditing) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          handleTaskReorderDrop(e, t.id);
        }}
      >
        {indicator === "before" && (
          <span className="pointer-events-none absolute -top-1 left-0 right-0 h-0.5 rounded-full bg-blue-500" />
        )}
        {indicator === "after" && (
          <span className="pointer-events-none absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-blue-500" />
        )}
        {editingId === t.id ? (
          <div className="flex-1">
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="タイトル"
              className="mb-2 w-full rounded border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
            />
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="詳細（任意）。「・」や「- 」で始まる行はチェックリストになります。"
              rows={4}
              className="mb-2 w-full rounded border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
            />
            <div className="mb-2 flex flex-wrap items-center gap-3">
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
                      onClick={() => cycleStatus(t)}
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
                      {subDoneCount}/{subs.length}
                    </span>
                  )}
                  {dueLabel(t.due_date, t.status)}
                </div>
                {bodyText && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                    {bodyText}
                  </p>
                )}
                {subs.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {subs.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-start gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={s.done}
                          onChange={() => onToggleSubtask(t.id, s)}
                          className="mt-0.5 h-4 w-4 cursor-pointer accent-slate-900"
                        />
                        <span
                          className={
                            s.done
                              ? "text-slate-400 line-through"
                              : "text-slate-700"
                          }
                        >
                          {s.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="ml-3 flex flex-col items-end gap-1">
              {t.status !== "done" && (
                <div className="flex gap-1">
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
                </div>
              )}
              <button
                onClick={() => startEdit(t)}
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                編集
              </button>
              <button
                onClick={() => onDeleteTask(t)}
                className="text-sm text-rose-600 hover:text-rose-800"
              >
                削除
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

  const treeContent = (
    <ul className="space-y-0.5">
      <li>
        <button
          onClick={() => navigateTo(null)}
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
      {currentProjectId === null &&
        rootTasks.map((t) => renderTreeTask(t, 0))}
    </ul>
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

        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">{currentLabel}</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setShowNewTaskForm((v) => !v)}
              className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
            >
              {showNewTaskForm ? "× 閉じる" : "＋ タスク"}
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
              const subCount = (childProjectsMap.get(p.id) ?? []).length;
              const isDrop = isDropTargetFor(p.id);
              return (
                <div
                  key={p.id}
                  className={`group flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all ${
                    isDrop
                      ? "border-blue-400 bg-blue-50 ring-2 ring-blue-400"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  } ${dragItem?.type === "project" && dragItem.id === p.id ? "opacity-40" : ""}`}
                  onClick={() => navigateTo(p.id)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, "project", p.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleFolderDragOver(e, p.id)}
                  onDrop={(e) => handleFolderDrop(e, p.id)}
                >
                  <span className="text-2xl">📁</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="text-xs text-slate-500">
                      {count > 0 && `${count}件`}
                      {count > 0 && subCount > 0 && " · "}
                      {subCount > 0 && `${subCount}サブ`}
                      {count === 0 && subCount === 0 && "空"}
                    </div>
                  </div>
                  <div className="hidden gap-1 group-hover:flex">
                    <button
                      onClick={(e) => onRenameProject(p, e)}
                      title="リネーム"
                      className="rounded p-1 text-xs text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                    >
                      ✎
                    </button>
                    <button
                      onClick={(e) => onDeleteProject(p, e)}
                      title="削除"
                      className="rounded p-1 text-xs text-rose-400 hover:bg-rose-100 hover:text-rose-700"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Drag hint */}
        {dragItem && (
          <div className="mb-4 rounded border border-dashed border-blue-300 bg-blue-50 px-3 py-2 text-center text-sm text-blue-600">
            {dragItem.type === "task"
              ? "📋 タスクをドラッグ中 — フォルダにドロップで移動 / 一覧内で並び替え"
              : "📁 プロジェクトをドラッグ中 — フォルダにドロップで階層変更（500ms ホバーで自動展開）"}
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
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="詳細（任意）。「・」や「- 」で始まる行はチェックリストになります。"
            rows={3}
            className="mb-2 w-full rounded border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
          />
          <div className="mb-2 flex items-center gap-3">
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
                setTitle("");
                setDescription("");
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
          <h2 className="mb-3 text-lg font-semibold">
            タスク一覧
            {activeTasks.length > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-500">
                {activeTasks.length}件
              </span>
            )}
          </h2>
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
          {doneTasks.length > 0 && (
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
    </div>
  );
}
