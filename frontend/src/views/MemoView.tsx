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
  createMemo,
  deleteMemo,
  listMemos,
  reorderMemos,
  updateMemo,
  type Memo,
} from "../api/memos";
import {
  createFolder,
  deleteFolder,
  listFolders,
  updateFolder,
  type Folder,
} from "../api/folders";
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
  MEMO_SORT_OPTIONS,
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
import { EXPORT_FORMATS, exportMemo } from "../lib/exportMemo";
import { PRESET_COLORS, isValidColor } from "../lib/memoColor";
import {
  FONT_SIZES,
  DEFAULT_FONT_SIZE,
  fontSizePx,
  normalizeFontSize,
  type FontSize,
} from "../lib/memoFontSize";
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

const MEMO_DEFAULT_DOT_COLOR = "#cbd5e1"; // slate-300, 暫定色
const FOLDER_EXPANDED_KEY = "goatask-folder-expanded";
const CURRENT_FOLDER_KEY = "goatask-current-folder";
const MEMO_SORT_KEY = "goatask:memo-sort";
const MEMO_COLOR_FILTER_KEY = "goatask:memo-color-filter";
type MemoColorFilter = string; // "" = all, "none" = no color, otherwise hex

// Context-menu dimensions used to clamp popups on screen (see clampMenuPosition).
const FOLDER_MENU_W = 190;
const FOLDER_MENU_H = 160;
const MEMO_MENU_W = 150;
const MEMO_MENU_H = 90;

function memoDotColor(m: Memo): string {
  return isValidColor(m.color) ? m.color : MEMO_DEFAULT_DOT_COLOR;
}

type DragItem = { type: "memo" | "folder"; id: number } | null;
type DropTarget =
  | { kind: "folder"; folderId: number | null }
  | { kind: "reorder"; memoId: number; before: boolean }
  | null;

export function MemoView() {
  const queryClient = useQueryClient();
  const memosQuery = useQuery({ queryKey: ["memos"], queryFn: listMemos });
  const foldersQuery = useQuery({ queryKey: ["folders"], queryFn: listFolders });
  const memos = memosQuery.data ?? [];
  const folders = foldersQuery.data ?? [];
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem(CURRENT_FOLDER_KEY);
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
    loadSortMode(MEMO_SORT_KEY, "manual"),
  );
  useEffect(() => {
    localStorage.setItem(MEMO_SORT_KEY, sortMode);
  }, [sortMode]);
  const [colorFilter, setColorFilter] = useState<MemoColorFilter>(
    () => localStorage.getItem(MEMO_COLOR_FILTER_KEY) ?? "",
  );
  useEffect(() => {
    localStorage.setItem(MEMO_COLOR_FILTER_KEY, colorFilter);
  }, [colorFilter]);
  const favorites = useFavorites("goatask:memo-favorites");
  const recent = useRecent("goatask:memo-recent");
  const [undoState, setUndoState] = useState<{
    message: string;
    snapshot: Memo;
  } | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem(FOLDER_EXPANDED_KEY);
      return saved
        ? new Set(JSON.parse(saved) as number[])
        : new Set<number>();
    } catch {
      return new Set<number>();
    }
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [color, setColor] = useState<string>("");
  const [fontSize, setFontSize] = useState<FontSize>(DEFAULT_FONT_SIZE);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFlipUp, setExportFlipUp] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const colorRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [dragItem, setDragItem] = useState<DragItem>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const dragItemRef = useRef<DragItem>(null);

  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    folderId: number;
  } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement | null>(null);

  const [memoCtxMenu, setMemoCtxMenu] = useState<{
    x: number;
    y: number;
    memoId: number;
  } | null>(null);
  const memoCtxMenuRef = useRef<HTMLDivElement | null>(null);

  const longPressStore = useRef(createLongPressStore()).current;

  const openFolderCtxMenu = (x: number, y: number, folderId: number) => {
    setMemoCtxMenu(null);
    setCtxMenu({ ...clampMenuPosition(x, y, FOLDER_MENU_W, FOLDER_MENU_H), folderId });
  };
  const openMemoCtxMenu = (x: number, y: number, memoId: number) => {
    setCtxMenu(null);
    setMemoCtxMenu({ ...clampMenuPosition(x, y, MEMO_MENU_W, MEMO_MENU_H), memoId });
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

  useEffect(() => {
    if (!exportOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [exportOpen]);

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
    if (!memoCtxMenu) return;
    const onDown = (e: MouseEvent) => {
      if (!memoCtxMenuRef.current?.contains(e.target as Node))
        setMemoCtxMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMemoCtxMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [memoCtxMenu]);

  useEffect(() => {
    if (!colorOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!colorRef.current?.contains(e.target as Node)) setColorOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [colorOpen]);

  const reload = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["memos"] }),
      queryClient.invalidateQueries({ queryKey: ["folders"] }),
    ]);
    setError(null);
  };

  useEffect(() => {
    if (!foldersQuery.isSuccess) return;
    setCurrentFolderId((cur) =>
      cur !== null && !folders.some((folder) => folder.id === cur) ? null : cur,
    );
  }, [folders, foldersQuery.isSuccess]);

  const queryError = memosQuery.error ?? foldersQuery.error;
  const queryErrorMsg = queryError
    ? queryError instanceof Error
      ? queryError.message
      : String(queryError)
    : null;

  useEffect(() => {
    localStorage.setItem(
      FOLDER_EXPANDED_KEY,
      JSON.stringify([...expanded]),
    );
  }, [expanded]);

  useEffect(() => {
    localStorage.setItem(
      CURRENT_FOLDER_KEY,
      currentFolderId === null ? "root" : String(currentFolderId),
    );
  }, [currentFolderId]);

  const selected = memos.find((m) => m.id === selectedId) ?? null;

  const childFolders = useMemo(() => buildChildMap(folders), [folders]);
  const memosByFolder = useMemo(
    () => buildItemsByParent(memos, (m) => m.folder_id ?? null),
    [memos],
  );
  const flatFolderOptions = useMemo(
    () => flatTreeOptions(childFolders),
    [childFolders],
  );

  const recursiveMemoCount = useMemo(() => {
    const map = new Map<number | null, number>();
    const calc = (id: number | null): number => {
      if (map.has(id)) return map.get(id)!;
      const direct = (memosByFolder.get(id) ?? []).length;
      const children = childFolders.get(id) ?? [];
      let total = direct;
      for (const c of children) total += calc(c.id);
      map.set(id, total);
      return total;
    };
    folders.forEach((f) => calc(f.id));
    calc(null);
    return map;
  }, [folders, memos, childFolders, memosByFolder]);

  const breadcrumb = useMemo(
    () => buildBreadcrumb(folders, currentFolderId),
    [currentFolderId, folders],
  );

  const directFoldersRaw = childFolders.get(currentFolderId) ?? [];
  const directMemosRaw = memosByFolder.get(currentFolderId) ?? [];
  const directFolders = useMemo(
    () => sortByMode(directFoldersRaw, sortMode, (f) => f.name),
    [directFoldersRaw, sortMode],
  );
  const directMemos = useMemo(() => {
    let arr = directMemosRaw;
    if (colorFilter === "none") {
      arr = arr.filter((m) => !isValidColor(m.color));
    } else if (colorFilter) {
      arr = arr.filter((m) => m.color === colorFilter);
    }
    return sortByMode(arr, sortMode, (m) => m.title);
  }, [directMemosRaw, sortMode, colorFilter]);

  // --- DnD ---

  const canDrop = (targetFolderId: number | null): boolean => {
    const item = dragItemRef.current;
    if (!item) return false;
    if (item.type === "memo") {
      const memo = memos.find((m) => m.id === item.id);
      return !!memo && (memo.folder_id ?? null) !== targetFolderId;
    }
    if (item.type === "folder") {
      if (targetFolderId === item.id) return false;
      if (
        targetFolderId !== null &&
        isDescendant(folders, item.id, targetFolderId)
      )
        return false;
      const f = folders.find((folder) => folder.id === item.id);
      if (f && (f.parent_id ?? null) === targetFolderId) return false;
      return true;
    }
    return false;
  };

  const canReorderMemo = (overMemoId: number): boolean => {
    const item = dragItemRef.current;
    if (!item || item.type !== "memo") return false;
    if (item.id === overMemoId) return false;
    const dragged = memos.find((m) => m.id === item.id);
    const over = memos.find((m) => m.id === overMemoId);
    if (!dragged || !over) return false;
    return (dragged.folder_id ?? null) === (over.folder_id ?? null);
  };

  const isDropTargetFor = (folderId: number | null) =>
    dropTarget !== null &&
    dropTarget.kind === "folder" &&
    dropTarget.folderId === folderId;

  const reorderIndicatorFor = (memoId: number): "before" | "after" | null => {
    if (!dropTarget || dropTarget.kind !== "reorder") return null;
    if (dropTarget.memoId !== memoId) return null;
    return dropTarget.before ? "before" : "after";
  };

  const handleDragStart = (
    e: ReactDragEvent,
    type: "memo" | "folder",
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
    targetFolderId: number | null,
  ) => {
    if (!dragItemRef.current) return;
    e.stopPropagation();
    if (!canDrop(targetFolderId)) {
      setDropTarget((prev) => (prev === null ? prev : null));
      hoverExpand.clear();
      return;
    }
    e.preventDefault();
    setDropTarget({ kind: "folder", folderId: targetFolderId });
    if (targetFolderId !== null) hoverExpand.schedule(targetFolderId);
    else hoverExpand.clear();
  };

  const handleFolderDragLeave = (
    e: ReactDragEvent,
    targetFolderId: number | null,
  ) => {
    e.stopPropagation();
    if (
      targetFolderId !== null &&
      hoverExpand.currentId() === targetFolderId
    ) {
      hoverExpand.clear();
    }
  };

  const handleFolderDrop = async (
    e: ReactDragEvent,
    targetFolderId: number | null,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    hoverExpand.clear();
    const item = dragItemRef.current;
    if (!item) return;
    try {
      if (item.type === "memo") {
        await updateMemo(item.id, { folder_id: targetFolderId });
        if (selectedId === item.id) setFolderId(targetFolderId);
      } else if (item.type === "folder") {
        await updateFolder(item.id, { parent_id: targetFolderId });
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    dragItemRef.current = null;
    setDragItem(null);
    setDropTarget(null);
  };

  const handleMemoReorderDragOver = (
    e: ReactDragEvent,
    overMemoId: number,
  ) => {
    if (!canReorderMemo(overMemoId)) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    setDropTarget((prev) => {
      if (
        prev &&
        prev.kind === "reorder" &&
        prev.memoId === overMemoId &&
        prev.before === before
      ) {
        return prev;
      }
      return { kind: "reorder", memoId: overMemoId, before };
    });
  };

  const handleMemoReorderDrop = async (
    e: ReactDragEvent,
    overMemoId: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const item = dragItemRef.current;
    const target = dropTarget;
    dragItemRef.current = null;
    setDragItem(null);
    setDropTarget(null);
    hoverExpand.clear();
    if (!item || item.type !== "memo") return;
    if (!target || target.kind !== "reorder" || target.memoId !== overMemoId)
      return;
    if (!canReorderMemo(overMemoId)) return;

    const draggedId = item.id;
    const siblings = directMemos.filter((m) => m.id !== draggedId);
    const overIdx = siblings.findIndex((m) => m.id === overMemoId);
    if (overIdx < 0) return;
    const insertAt = target.before ? overIdx : overIdx + 1;
    const dragged = directMemos.find((m) => m.id === draggedId);
    if (!dragged) return;
    siblings.splice(insertAt, 0, dragged);
    try {
      await reorderMemos(siblings.map((m) => m.id));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // --- Navigation ---

  const navigateTo = (id: number | null) => {
    setCurrentFolderId(id);
    setSelectedId(null);
    if (id !== null) {
      setExpanded((prev) => expandAncestors(folders, prev, id));
      recent.push(id);
    }
    setTreeOpen(false);
  };

  useEffect(() => {
    if (!foldersQuery.isSuccess) return;
    recent.prune(new Set(folders.map((f) => f.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foldersQuery.isSuccess, folders]);

  const buildShortcutEntry = (id: number): ShortcutEntry | null => {
    const f = folders.find((x) => x.id === id);
    if (!f) return null;
    return {
      id,
      name: f.name,
      isCurrent: currentFolderId === id,
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

  // --- Memo / Folder actions ---

  const startNew = (presetFolder: number | null) => {
    setSelectedId(null);
    setTitle("");
    setContent("");
    setFolderId(presetFolder);
    setColor("");
    setFontSize(DEFAULT_FONT_SIZE);
  };

  const selectMemo = (m: Memo) => {
    setSelectedId(m.id);
    setTitle(m.title);
    setContent(m.content);
    setFolderId(m.folder_id ?? null);
    setColor(m.color ?? "");
    setFontSize(normalizeFontSize(m.font_size));
  };

  const backToList = () => {
    setSelectedId(null);
    setTitle("");
    setContent("");
    setColor("");
    setFontSize(DEFAULT_FONT_SIZE);
    setShowEditor(false);
  };

  const [showEditor, setShowEditor] = useState(false);

  const openNewMemoForm = () => {
    startNew(currentFolderId);
    setShowEditor(true);
  };

  const openExistingMemo = (m: Memo) => {
    selectMemo(m);
    setShowEditor(true);
  };

  useEffect(() => {
    setShowEditor(selectedId !== null);
  }, [selectedId]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      if (selected) {
        const updated = await updateMemo(selected.id, {
          title: title.trim(),
          content,
          folder_id: folderId,
          color,
          font_size: fontSize,
        });
        await reload();
        setSelectedId(updated.id);
      } else {
        const created = await createMemo({
          title: title.trim(),
          content,
          folder_id: folderId,
          color,
          font_size: fontSize,
        });
        await reload();
        setSelectedId(created.id);
        setFolderId(created.folder_id ?? null);
        setColor(created.color ?? "");
        setFontSize(normalizeFontSize(created.font_size));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const performMemoDelete = async (m: Memo) => {
    try {
      await deleteMemo(m.id);
      if (selectedId === m.id) backToList();
      await reload();
      setUndoState({ message: `「${m.title}」を削除しました`, snapshot: m });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onDelete = async () => {
    if (!selected) return;
    await performMemoDelete(selected);
  };

  const onDeleteMemoFromList = async (m: Memo) => {
    await performMemoDelete(m);
  };

  const restoreMemo = async () => {
    if (!undoState) return;
    const m = undoState.snapshot;
    setUndoState(null);
    try {
      await createMemo({
        title: m.title,
        content: m.content,
        folder_id: m.folder_id ?? null,
        color: m.color,
        font_size: m.font_size,
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onCreateFolder = async (
    parent: number | null,
    e?: React.MouseEvent,
  ) => {
    e?.stopPropagation();
    const name = prompt("フォルダ名");
    if (!name?.trim()) return;
    try {
      const f = await createFolder({ name: name.trim(), parent_id: parent });
      if (parent !== null) {
        setExpanded((prev) => new Set(prev).add(parent));
      }
      setExpanded((prev) => new Set(prev).add(f.id));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onRenameFolder = async (f: Folder, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const name = prompt("新しいフォルダ名", f.name);
    if (!name?.trim() || name.trim() === f.name) return;
    try {
      await updateFolder(f.id, {
        name: name.trim(),
        parent_id: f.parent_id ?? null,
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onDeleteFolder = async (f: Folder, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const subFolders = childFolders.get(f.id) ?? [];
    const subMemos = memosByFolder.get(f.id) ?? [];
    const parentLabel = f.parent_id ? "親フォルダ" : "ルート";
    const msg = [
      `フォルダ「${f.name}」を削除しますか？`,
      "",
      "【影響範囲】",
      subFolders.length > 0
        ? `・サブフォルダ ${subFolders.length}件 → ${parentLabel}に繰り上がり`
        : null,
      subMemos.length > 0
        ? `・メモ ${subMemos.length}件 → ${parentLabel}に移動`
        : null,
      subFolders.length === 0 && subMemos.length === 0
        ? "・影響なし（空のフォルダ）"
        : null,
    ]
      .filter(Boolean)
      .join("\n");
    if (!confirm(msg)) return;
    try {
      if (currentFolderId === f.id) setCurrentFolderId(f.parent_id ?? null);
      await deleteFolder(f.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // --- Tree rendering ---

  const renderTreeMemo = (m: Memo, depth: number): ReactElement => {
    const isDragging = dragItem?.type === "memo" && dragItem.id === m.id;
    const longPress = createLongPressHandlers(longPressStore, `tree-memo:${m.id}`, (x, y) =>
      openMemoCtxMenu(x, y, m.id),
    );
    return (
      <li key={`m-${m.id}`} role="treeitem">
        <div
          className={`group flex items-center gap-1 rounded px-1 py-1 text-sm hover:bg-slate-50 ${
            isDragging ? "opacity-40" : ""
          } ${m.id === selectedId ? "bg-slate-200 font-medium" : ""}`}
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
          draggable
          onDragStart={(e) => {
            longPress.cancel();
            handleDragStart(e, "memo", m.id);
          }}
          onDragEnd={handleDragEnd}
          onContextMenu={(e) => {
            e.preventDefault();
            openMemoCtxMenu(e.clientX, e.clientY, m.id);
          }}
          onTouchStart={longPress.onTouchStart}
          onTouchMove={longPress.onTouchMove}
          onTouchEnd={longPress.onTouchEnd}
          onMouseDown={longPress.onMouseDown}
          onMouseMove={longPress.onMouseMove}
          onMouseUp={longPress.onMouseUp}
          onMouseLeave={longPress.onMouseLeave}
          onClickCapture={longPress.onClickCapture}
        >
          <span className="flex w-4 shrink-0 items-center justify-center">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: memoDotColor(m) }}
            />
          </span>
          <button
            onClick={() => openExistingMemo(m)}
            className="min-w-0 flex-1 truncate text-left text-slate-600"
            data-tree-node={`memo:${m.id}`}
          >
            {m.title}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              openMemoCtxMenu(rect.left, rect.bottom, m.id);
            }}
            title="メニュー"
            aria-label="メニュー"
            className={`shrink-0 rounded px-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 ${
              isMobile ? "" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            ⋮
          </button>
        </div>
      </li>
    );
  };

  const renderTreeFolder = (f: Folder, depth: number): ReactElement => {
    const isOpen = expanded.has(f.id);
    const subFolders = childFolders.get(f.id) ?? [];
    const subMemos = memosByFolder.get(f.id) ?? [];
    const hasChildren = subFolders.length > 0 || subMemos.length > 0;
    const isCurrent = currentFolderId === f.id;
    const count = recursiveMemoCount.get(f.id) ?? 0;
    const isDrop = isDropTargetFor(f.id);
    const isDragging = dragItem?.type === "folder" && dragItem.id === f.id;

    const toggleFolderExpand = () => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(f.id)) next.delete(f.id);
        else next.add(f.id);
        return next;
      });
    };
    const longPress = createLongPressHandlers(longPressStore, `tree-folder:${f.id}`, (x, y) =>
      openFolderCtxMenu(x, y, f.id),
    );
    return (
      <li
        key={`f-${f.id}`}
        role="treeitem"
        aria-expanded={isOpen}
        className={`rounded ${isDrop ? "bg-blue-50 ring-2 ring-blue-400" : ""}`}
        onDragOver={(e) => handleFolderDragOver(e, f.id)}
        onDragLeave={(e) => handleFolderDragLeave(e, f.id)}
        onDrop={(e) => handleFolderDrop(e, f.id)}
      >
        <div
          className={`group flex items-center rounded ${
            isCurrent ? "bg-slate-200 font-bold text-slate-900" : "hover:bg-slate-100"
          } ${isDragging ? "opacity-40" : ""}`}
        >
          <button
            type="button"
            draggable
            data-tree-node={`folder:${f.id}`}
            onClick={() => {
              setCurrentFolderId(f.id);
              setSelectedId(null);
              setExpanded((prev) => {
                const next = expandAncestors(folders, prev, f.id);
                if (prev.has(f.id)) next.delete(f.id);
                return next;
              });
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                e.stopPropagation();
                if (!isOpen) toggleFolderExpand();
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                e.stopPropagation();
                if (isOpen) toggleFolderExpand();
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              openFolderCtxMenu(e.clientX, e.clientY, f.id);
            }}
            onDragStart={(e) => {
              longPress.cancel();
              handleDragStart(e, "folder", f.id);
            }}
            onDragEnd={handleDragEnd}
            onTouchStart={longPress.onTouchStart}
            onTouchMove={longPress.onTouchMove}
            onTouchEnd={longPress.onTouchEnd}
            onMouseDown={longPress.onMouseDown}
            onMouseMove={longPress.onMouseMove}
            onMouseUp={longPress.onMouseUp}
            onMouseLeave={longPress.onMouseLeave}
            onClickCapture={longPress.onClickCapture}
            className="flex min-w-0 flex-1 items-center gap-1 px-1 py-1 text-left text-sm"
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
              {f.name}
              {count > 0 && (
                <span className="ml-1 text-xs text-slate-400">{count}</span>
              )}
            </span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              openFolderCtxMenu(rect.left, rect.bottom, f.id);
            }}
            title="メニュー"
            aria-label="メニュー"
            className={`shrink-0 rounded px-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 ${
              isMobile ? "" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            ⋮
          </button>
        </div>
        {isOpen && hasChildren && (
          <ul className="relative space-y-0.5">
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-1 top-0 w-px bg-slate-200"
              style={{ left: depth * 16 + 12 }}
            />
            {subFolders.map((sf) => renderTreeFolder(sf, depth + 1))}
            {subMemos.map((sm) => renderTreeMemo(sm, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  // --- Memo card (main pane) ---

  const renderMemoCard = (m: Memo) => {
    const memoColor = isValidColor(m.color) ? m.color : null;
    const isDragging = dragItem?.type === "memo" && dragItem.id === m.id;
    const indicator = reorderIndicatorFor(m.id);
    const preview = m.content.split("\n").find((l) => l.trim()) ?? "";
    const longPress = createLongPressHandlers(longPressStore, `card-memo:${m.id}`, (x, y) =>
      openMemoCtxMenu(x, y, m.id),
    );

    return (
      <li
        key={m.id}
        className={`group relative rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-opacity hover:border-slate-300 hover:bg-slate-50 ${
          isDragging ? "opacity-40" : ""
        }`}
        style={{
          borderLeft: memoColor ? `4px solid ${memoColor}` : undefined,
        }}
        draggable
        onDragStart={(e) => {
          longPress.cancel();
          handleDragStart(e, "memo", m.id);
        }}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleMemoReorderDragOver(e, m.id)}
        onDrop={(e) => handleMemoReorderDrop(e, m.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          openMemoCtxMenu(e.clientX, e.clientY, m.id);
        }}
        onTouchStart={longPress.onTouchStart}
        onTouchMove={longPress.onTouchMove}
        onTouchEnd={longPress.onTouchEnd}
        onMouseDown={longPress.onMouseDown}
        onMouseMove={longPress.onMouseMove}
        onMouseUp={longPress.onMouseUp}
        onMouseLeave={longPress.onMouseLeave}
        onClickCapture={longPress.onClickCapture}
      >
        {indicator === "before" && (
          <span className="pointer-events-none absolute -top-1 left-0 right-0 h-0.5 rounded-full bg-blue-500" />
        )}
        {indicator === "after" && (
          <span className="pointer-events-none absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-blue-500" />
        )}
        <div className="flex items-start gap-3">
          <button
            onClick={() => openExistingMemo(m)}
            className="min-w-0 flex-1 text-left"
          >
            <div className="flex items-center gap-2">
              <span>📄</span>
              <span className="truncate font-medium">{m.title}</span>
            </div>
            {preview && (
              <p className="mt-1 truncate text-sm text-slate-500">{preview}</p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              {new Date(m.updated_at).toLocaleString()}
            </p>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              openMemoCtxMenu(rect.left, rect.bottom, m.id);
            }}
            title="メニュー"
            aria-label="メニュー"
            className={`shrink-0 rounded px-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 ${
              isMobile ? "" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            ⋮
          </button>
        </div>
      </li>
    );
  };

  // --- Main render ---

  const rootFolders = childFolders.get(null) ?? [];
  const rootMemos = (memosByFolder.get(null) ?? []).slice();
  const totalMemos = memos.length;

  const currentLabel =
    currentFolderId === null
      ? "ルート"
      : (folders.find((f) => f.id === currentFolderId)?.name ?? "フォルダ");

  const folderPath = (folderId: number | null): string => {
    if (folderId === null) return "🏠 ルート";
    const path = buildBreadcrumb(folders, folderId)
      .map((f) => f.name)
      .join(" / ");
    return `🏠 ルート / ${path}`;
  };

  const searchResults = useMemo<TreeSearchResult[]>(() => {
    const q = normalizeQuery(treeQuery);
    if (!q) return [];
    const out: TreeSearchResult[] = [];
    for (const f of folders) {
      if (matchesQuery(f.name, q)) {
        out.push({
          key: `f-${f.id}`,
          icon: "📁",
          label: f.name,
          path: folderPath(f.parent_id ?? null),
          onClick: () => navigateTo(f.id),
        });
      }
    }
    for (const m of memos) {
      if (matchesQuery(m.title, q)) {
        out.push({
          key: `m-${m.id}`,
          icon: "📄",
          label: m.title,
          path: folderPath(m.folder_id ?? null),
          onClick: () => {
            navigateTo(m.folder_id ?? null);
            openExistingMemo(m);
          },
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeQuery, folders, memos]);

  const treeContent = (
    <div onKeyDown={handleTreeKeyDown}>
      <TreeSearch
        query={treeQuery}
        onQueryChange={setTreeQuery}
        placeholder="フォルダ・メモを検索"
      />
      {treeQuery ? (
        renderTreeSearchResults(searchResults)
      ) : (
        <>
          <SidebarShortcuts
            favorites={favoriteEntries}
            recents={recentEntries}
            storagePrefix="goatask:memo-shortcuts"
          />
          <ul role="tree" className="space-y-0.5">
            <li role="treeitem">
              <button
                onClick={() => navigateTo(null)}
                data-tree-node="root"
                className={`w-full rounded px-2 py-1.5 text-left text-sm ${
                  currentFolderId === null
                    ? "bg-slate-200 font-bold text-slate-900"
                    : "hover:bg-slate-100"
                }`}
              >
                🏠 ルート
                {totalMemos > 0 && (
                  <span className="ml-1 text-xs text-slate-400">
                    {totalMemos}
                  </span>
                )}
              </button>
            </li>
            {rootFolders.map((f) => renderTreeFolder(f, 0))}
            {rootMemos.map((m) => renderTreeMemo(m, 0))}
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
          className={`w-64 shrink-0 overflow-y-auto rounded-lg border bg-white p-2 transition-colors ${
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

      {/* Main */}
      <div className={isMobile ? "h-full min-w-0 overflow-y-auto" : "min-w-0 flex-1 overflow-y-auto"}>
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
        <nav className="mb-3 flex items-center gap-1.5 text-sm">
          <button
            onClick={() => navigateTo(null)}
            className={`rounded px-1.5 py-0.5 ${
              currentFolderId === null
                ? "font-bold text-slate-900"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            🏠 ルート
          </button>
          {breadcrumb.map((f) => (
            <Fragment key={f.id}>
              <span className="text-slate-300">/</span>
              <button
                onClick={() => navigateTo(f.id)}
                className={`rounded px-1.5 py-0.5 ${
                  f.id === currentFolderId
                    ? "font-bold text-slate-900"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                📁 {f.name}
              </button>
            </Fragment>
          ))}
        </nav>

        {(error || queryErrorMsg) && (
          <div className="mb-4 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error ?? queryErrorMsg}
          </div>
        )}

        {showEditor ? (
          <>
            <div className="mb-3 flex items-center justify-between">
              <button
                onClick={backToList}
                className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100"
              >
                ← 一覧に戻る
              </button>
              <h1 className="text-xl font-bold">
                {selected ? "メモを編集" : "新しいメモ"}
              </h1>
            </div>
            {renderEditor(
              {
                title,
                content,
                folderId,
                color,
                fontSize,
                exportOpen,
                exportFlipUp,
                colorOpen,
                exportRef,
                colorRef,
                flatFolderOptions,
                selected,
              },
              {
                setTitle,
                setContent,
                setFolderId,
                setColor,
                setFontSize,
                setExportOpen,
                setExportFlipUp,
                setColorOpen,
                onSubmit,
                onDelete,
              },
            )}
          </>
        ) : (
          <>
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
                    {MEMO_SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={openNewMemoForm}
                  className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
                >
                  ＋ メモ
                </button>
                <button
                  onClick={() => onCreateFolder(currentFolderId)}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
                >
                  ＋ フォルダ
                </button>
              </div>
            </div>

            {/* Sub-folder cards */}
            {directFolders.length > 0 && (
              <div className="mb-6 grid grid-cols-2 gap-2">
                {directFolders.map((f) => {
                  const count = recursiveMemoCount.get(f.id) ?? 0;
                  const subCount = (childFolders.get(f.id) ?? []).length;
                  const isDrop = isDropTargetFor(f.id);
                  const longPress = createLongPressHandlers(
                    longPressStore,
                    `card-folder:${f.id}`,
                    (x, y) => openFolderCtxMenu(x, y, f.id),
                  );
                  return (
                    <div
                      key={f.id}
                      className={`group relative flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all ${
                        isDrop
                          ? "border-blue-400 bg-blue-50 ring-2 ring-blue-400"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      } ${dragItem?.type === "folder" && dragItem.id === f.id ? "opacity-40" : ""}`}
                      onClick={() => navigateTo(f.id)}
                      onClickCapture={longPress.onClickCapture}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        openFolderCtxMenu(e.clientX, e.clientY, f.id);
                      }}
                      onTouchStart={longPress.onTouchStart}
                      onTouchMove={longPress.onTouchMove}
                      onTouchEnd={longPress.onTouchEnd}
                      onMouseDown={longPress.onMouseDown}
                      onMouseMove={longPress.onMouseMove}
                      onMouseUp={longPress.onMouseUp}
                      onMouseLeave={longPress.onMouseLeave}
                      draggable
                      onDragStart={(e) => {
                        longPress.cancel();
                        handleDragStart(e, "folder", f.id);
                      }}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleFolderDragOver(e, f.id)}
                      onDragLeave={(e) => handleFolderDragLeave(e, f.id)}
                      onDrop={(e) => handleFolderDrop(e, f.id)}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          openFolderCtxMenu(rect.left, rect.bottom, f.id);
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
                        <div className="truncate font-medium">{f.name}</div>
                        <div className="text-xs text-slate-500">
                          {count > 0 && `${count}件`}
                          {count > 0 && subCount > 0 && " · "}
                          {subCount > 0 && `${subCount}サブ`}
                          {count === 0 && subCount === 0 && "空"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Memo list */}
            <section
              className={`rounded-lg p-2 transition-colors ${
                dragItem && isDropTargetFor(currentFolderId)
                  ? "bg-blue-50 ring-2 ring-blue-300"
                  : ""
              }`}
              onDragOver={(e) => handleFolderDragOver(e, currentFolderId)}
              onDrop={(e) => handleFolderDrop(e, currentFolderId)}
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">
                  メモ一覧
                  {directMemos.length > 0 && (
                    <span className="ml-2 text-sm font-normal text-slate-500">
                      {directMemos.length}件
                    </span>
                  )}
                </h2>
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-xs text-slate-500">色:</span>
                  <button
                    type="button"
                    onClick={() => setColorFilter("")}
                    title="すべて表示"
                    className={`rounded border px-1.5 py-0.5 text-xs ${
                      colorFilter === ""
                        ? "border-slate-900 bg-slate-100 font-medium"
                        : "border-slate-300 text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    全
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setColorFilter(colorFilter === "none" ? "" : "none")
                    }
                    title="色なし"
                    className={`flex h-5 w-5 items-center justify-center rounded border text-xs ${
                      colorFilter === "none"
                        ? "border-slate-900 ring-1 ring-slate-900"
                        : "border-slate-300 text-slate-400 hover:bg-slate-100"
                    }`}
                  >
                    ×
                  </button>
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      title={c.label}
                      onClick={() =>
                        setColorFilter(
                          colorFilter === c.value ? "" : c.value,
                        )
                      }
                      style={{ backgroundColor: c.value }}
                      className={`h-5 w-5 rounded border ${
                        colorFilter === c.value
                          ? "border-slate-900 ring-1 ring-slate-900"
                          : "border-slate-300"
                      }`}
                    />
                  ))}
                </div>
              </div>
              {directMemos.length === 0 && directFolders.length === 0 ? (
                <p className="text-sm text-slate-500">
                  このフォルダにはまだ項目がありません。
                </p>
              ) : directMemos.length === 0 ? (
                <p className="text-sm text-slate-500">メモはありません。</p>
              ) : (
                <ul className="space-y-2">
                  {directMemos.map((m) => renderMemoCard(m))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      {undoState && (
        <UndoToast
          message={undoState.message}
          onUndo={restoreMemo}
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
              const id = ctxMenu.folderId;
              setCtxMenu(null);
              onCreateFolder(id);
            }}
            className="block w-full px-3 py-1.5 text-left hover:bg-slate-100"
          >
            ＋ サブフォルダ追加
          </button>
          <button
            type="button"
            onClick={() => {
              favorites.toggle(ctxMenu.folderId);
              setCtxMenu(null);
            }}
            className="block w-full px-3 py-1.5 text-left hover:bg-slate-100"
          >
            {favorites.has(ctxMenu.folderId)
              ? "★ お気に入り解除"
              : "☆ お気に入り追加"}
          </button>
          <button
            type="button"
            onClick={() => {
              const f = folders.find((x) => x.id === ctxMenu.folderId);
              setCtxMenu(null);
              if (f) onRenameFolder(f);
            }}
            className="block w-full px-3 py-1.5 text-left hover:bg-slate-100"
          >
            ✎ リネーム
          </button>
          <button
            type="button"
            onClick={() => {
              const f = folders.find((x) => x.id === ctxMenu.folderId);
              setCtxMenu(null);
              if (f) onDeleteFolder(f);
            }}
            className="block w-full px-3 py-1.5 text-left text-rose-600 hover:bg-rose-50"
          >
            🗑 削除
          </button>
        </div>
      )}
      {memoCtxMenu && (
        <div
          ref={memoCtxMenuRef}
          className="fixed z-50 min-w-[140px] rounded border border-slate-200 bg-white py-1 text-sm shadow-lg"
          style={{ top: memoCtxMenu.y, left: memoCtxMenu.x }}
        >
          <button
            type="button"
            onClick={() => {
              const m = memos.find((x) => x.id === memoCtxMenu.memoId);
              setMemoCtxMenu(null);
              if (m) openExistingMemo(m);
            }}
            className="block w-full px-3 py-1.5 text-left hover:bg-slate-100"
          >
            ✎ 編集
          </button>
          <button
            type="button"
            onClick={() => {
              const m = memos.find((x) => x.id === memoCtxMenu.memoId);
              setMemoCtxMenu(null);
              if (m) onDeleteMemoFromList(m);
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

// --- Editor render (extracted to keep MemoView body readable) ---

interface EditorState {
  title: string;
  content: string;
  folderId: number | null;
  color: string;
  fontSize: FontSize;
  exportOpen: boolean;
  exportFlipUp: boolean;
  colorOpen: boolean;
  exportRef: React.RefObject<HTMLDivElement | null>;
  colorRef: React.RefObject<HTMLDivElement | null>;
  flatFolderOptions: { id: number; label: string }[];
  selected: Memo | null;
}

interface EditorActions {
  setTitle: (v: string) => void;
  setContent: (v: string) => void;
  setFolderId: (v: number | null) => void;
  setColor: (v: string) => void;
  setFontSize: (v: FontSize) => void;
  setExportOpen: (v: boolean) => void;
  setExportFlipUp: (v: boolean) => void;
  setColorOpen: (v: boolean) => void;
  onSubmit: (e: FormEvent) => void;
  onDelete: () => void;
}

function renderEditor(s: EditorState, a: EditorActions) {
  return (
    <form
      onSubmit={a.onSubmit}
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="text-sm text-slate-600">フォルダ:</label>
        <select
          value={s.folderId ?? ""}
          onChange={(e) =>
            a.setFolderId(e.target.value === "" ? null : Number(e.target.value))
          }
          className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="">（ルート）</option>
          {s.flatFolderOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>

        <label className="ml-2 text-sm text-slate-600">サイズ:</label>
        <select
          value={s.fontSize}
          onChange={(e) => a.setFontSize(e.target.value as FontSize)}
          className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
        >
          {FONT_SIZES.map((sz) => (
            <option key={sz.value} value={sz.value}>
              {sz.label}
            </option>
          ))}
        </select>

        <div ref={s.colorRef} className="relative ml-2">
          <button
            type="button"
            onClick={() => a.setColorOpen(!s.colorOpen)}
            className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100"
            title="色を選ぶ"
          >
            <span
              className="inline-block h-4 w-4 rounded border border-slate-300"
              style={{
                backgroundColor: isValidColor(s.color)
                  ? s.color
                  : "transparent",
                backgroundImage: isValidColor(s.color)
                  ? undefined
                  : "linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%), linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%)",
                backgroundSize: "8px 8px",
                backgroundPosition: "0 0, 4px 4px",
              }}
            />
            色 ▾
          </button>
          {s.colorOpen && (
            <div className="absolute left-0 z-10 mt-1 w-56 rounded border border-slate-200 bg-white p-2 shadow-lg">
              <div className="mb-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => {
                    a.setColor("");
                    a.setColorOpen(false);
                  }}
                  title="色なし"
                  className={`h-6 w-6 rounded border ${
                    s.color === ""
                      ? "border-slate-900 ring-1 ring-slate-900"
                      : "border-slate-300"
                  } flex items-center justify-center text-xs text-slate-500`}
                >
                  ×
                </button>
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => {
                      a.setColor(c.value);
                      a.setColorOpen(false);
                    }}
                    title={c.label}
                    style={{ backgroundColor: c.value }}
                    className={`h-6 w-6 rounded border ${
                      s.color === c.value
                        ? "border-slate-900 ring-1 ring-slate-900"
                        : "border-slate-300"
                    }`}
                  />
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                カスタム:
                <input
                  type="color"
                  value={isValidColor(s.color) ? s.color : "#cccccc"}
                  onChange={(e) => a.setColor(e.target.value)}
                  className="h-6 w-10 cursor-pointer rounded border border-slate-300 p-0"
                />
              </label>
            </div>
          )}
        </div>
      </div>
      <input
        value={s.title}
        onChange={(e) => a.setTitle(e.target.value)}
        placeholder="タイトル"
        style={{
          borderLeft: isValidColor(s.color)
            ? `4px solid ${s.color}`
            : undefined,
          backgroundColor: isValidColor(s.color) ? `${s.color}22` : undefined,
        }}
        className="mb-2 w-full rounded border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
      />
      <textarea
        value={s.content}
        onChange={(e) => a.setContent(e.target.value)}
        placeholder="内容（プレーンテキスト）"
        rows={14}
        style={{ fontSize: `${fontSizePx(s.fontSize)}px`, lineHeight: 1.6 }}
        className="mb-2 w-full rounded border border-slate-300 px-3 py-2 font-mono focus:border-slate-500 focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 disabled:bg-slate-400"
          disabled={!s.title.trim()}
        >
          {s.selected ? "更新" : "作成"}
        </button>
        {s.selected && (
          <button
            type="button"
            onClick={a.onDelete}
            className="rounded border border-rose-300 px-4 py-2 text-rose-700 hover:bg-rose-50"
          >
            削除
          </button>
        )}
        {s.selected && (
          <div ref={s.exportRef} className="relative ml-auto">
            <button
              type="button"
              onClick={() => {
                if (!s.exportOpen) {
                  const btn = s.exportRef.current?.querySelector("button");
                  if (btn) {
                    const rect = btn.getBoundingClientRect();
                    const estHeight = EXPORT_FORMATS.length * 40 + 16;
                    a.setExportFlipUp(
                      window.innerHeight - rect.bottom < estHeight &&
                        rect.top > estHeight,
                    );
                  }
                }
                a.setExportOpen(!s.exportOpen);
              }}
              className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
            >
              エクスポート ▾
            </button>
            {s.exportOpen && (
              <ul
                className={`absolute right-0 z-10 w-56 rounded border border-slate-200 bg-white py-1 text-sm shadow-lg ${
                  s.exportFlipUp ? "bottom-full mb-1" : "top-full mt-1"
                }`}
              >
                {EXPORT_FORMATS.map((fmt) => (
                  <li key={fmt.ext}>
                    <button
                      type="button"
                      onClick={() => {
                        if (s.selected) exportMemo(s.selected, fmt);
                        a.setExportOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-100"
                    >
                      {fmt.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
