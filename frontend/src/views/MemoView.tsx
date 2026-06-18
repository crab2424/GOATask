import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type FormEvent,
} from "react";
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

type DragItem = { type: "memo" | "folder"; id: number } | null;
type DropTarget =
  | { kind: "folder"; folderId: number | null }
  | { kind: "reorder"; memoId: number; before: boolean }
  | null;

export function MemoView() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem("goatask-folder-expanded");
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
  const [colorOpen, setColorOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const colorRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [dragItem, setDragItem] = useState<DragItem>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const dragItemRef = useRef<DragItem>(null);

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
    if (!colorOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!colorRef.current?.contains(e.target as Node)) setColorOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [colorOpen]);

  const reload = async () => {
    try {
      const [m, f] = await Promise.all([listMemos(), listFolders()]);
      setMemos(m);
      setFolders(f);
      setCurrentFolderId((cur) =>
        cur !== null && !f.some((folder) => folder.id === cur) ? null : cur,
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "goatask-folder-expanded",
      JSON.stringify([...expanded]),
    );
  }, [expanded]);

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

  const directFolders = childFolders.get(currentFolderId) ?? [];
  const directMemos = memosByFolder.get(currentFolderId) ?? [];

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
    }
  };

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const onDelete = async () => {
    if (!selected) return;
    const msg = [
      `メモ「${selected.title}」を削除しますか？`,
      "",
      "・この操作は取り消せません",
    ].join("\n");
    if (!confirm(msg)) return;
    try {
      await deleteMemo(selected.id);
      backToList();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onDeleteMemoFromList = async (m: Memo) => {
    const msg = [
      `メモ「${m.title}」を削除しますか？`,
      "",
      "・この操作は取り消せません",
    ].join("\n");
    if (!confirm(msg)) return;
    try {
      await deleteMemo(m.id);
      if (selectedId === m.id) backToList();
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

  const renderTreeMemo = (m: Memo, depth: number): JSX.Element => {
    const memoColor = isValidColor(m.color) ? m.color : null;
    const isDragging = dragItem?.type === "memo" && dragItem.id === m.id;
    return (
      <li key={`m-${m.id}`}>
        <div
          className={`flex items-center gap-1 rounded px-1 py-1 text-sm hover:bg-slate-50 ${
            isDragging ? "opacity-40" : ""
          } ${m.id === selectedId ? "bg-slate-200 font-medium" : ""}`}
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
          draggable
          onDragStart={(e) => handleDragStart(e, "memo", m.id)}
          onDragEnd={handleDragEnd}
        >
          <span className="w-4 shrink-0" />
          <button
            onClick={() => openExistingMemo(m)}
            style={{
              borderLeft: memoColor
                ? `3px solid ${memoColor}`
                : "3px solid transparent",
              paddingLeft: 6,
            }}
            className="flex-1 truncate text-left text-slate-600"
          >
            📄 {m.title}
          </button>
        </div>
      </li>
    );
  };

  const renderTreeFolder = (f: Folder, depth: number): JSX.Element => {
    const isOpen = expanded.has(f.id);
    const subFolders = childFolders.get(f.id) ?? [];
    const subMemos = memosByFolder.get(f.id) ?? [];
    const hasChildren = subFolders.length > 0 || subMemos.length > 0;
    const isCurrent = currentFolderId === f.id;
    const count = recursiveMemoCount.get(f.id) ?? 0;
    const isDrop = isDropTargetFor(f.id);
    const isDragging = dragItem?.type === "folder" && dragItem.id === f.id;

    return (
      <li
        key={`f-${f.id}`}
        className={`rounded ${isDrop ? "bg-blue-50 ring-2 ring-blue-400" : ""}`}
        onDragOver={(e) => handleFolderDragOver(e, f.id)}
        onDragLeave={(e) => handleFolderDragLeave(e, f.id)}
        onDrop={(e) => handleFolderDrop(e, f.id)}
      >
        <div
          className={`group flex items-center gap-1 rounded px-1 py-1 text-sm transition-colors ${
            isCurrent
              ? "bg-slate-200 font-bold text-slate-900"
              : "hover:bg-slate-100"
          } ${isDragging ? "opacity-40" : ""}`}
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
          draggable
          onDragStart={(e) => handleDragStart(e, "folder", f.id)}
          onDragEnd={handleDragEnd}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) toggleExpand(f.id);
            }}
            className="w-4 shrink-0 text-slate-400"
          >
            {hasChildren ? (isOpen ? "▾" : "▸") : " "}
          </button>
          <button
            onClick={() => navigateTo(f.id)}
            className="flex-1 truncate text-left"
          >
            📁 {f.name}
            {count > 0 && (
              <span className="ml-1 text-xs text-slate-400">{count}</span>
            )}
          </button>
          <div className="hidden gap-1 group-hover:flex">
            <button
              onClick={(e) => onCreateFolder(f.id, e)}
              title="サブフォルダ追加"
              className="px-1 text-xs text-slate-500 hover:text-slate-900"
            >
              ＋
            </button>
            <button
              onClick={(e) => onRenameFolder(f, e)}
              title="リネーム"
              className="px-1 text-xs text-slate-500 hover:text-slate-900"
            >
              ✎
            </button>
            <button
              onClick={(e) => onDeleteFolder(f, e)}
              title="削除"
              className="px-1 text-xs text-rose-500 hover:text-rose-700"
            >
              🗑
            </button>
          </div>
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

    return (
      <li
        key={m.id}
        className={`relative rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-opacity hover:border-slate-300 hover:bg-slate-50 ${
          isDragging ? "opacity-40" : ""
        }`}
        style={{
          borderLeft: memoColor ? `4px solid ${memoColor}` : undefined,
        }}
        draggable
        onDragStart={(e) => handleDragStart(e, "memo", m.id)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleMemoReorderDragOver(e, m.id)}
        onDrop={(e) => handleMemoReorderDrop(e, m.id)}
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
            onClick={() => onDeleteMemoFromList(m)}
            className="text-sm text-rose-500 hover:text-rose-700"
            title="削除"
          >
            🗑
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

  return (
    <div
      className="flex h-full gap-4"
      onDragOver={(e) => {
        if (dragItemRef.current) e.preventDefault();
      }}
    >
      {/* Sidebar */}
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
        <ul className="space-y-0.5">
          <li>
            <button
              onClick={() => navigateTo(null)}
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
          {currentFolderId === null &&
            rootMemos.map((m) => renderTreeMemo(m, 0))}
        </ul>
      </aside>

      {/* Main */}
      <div className="flex-1 overflow-y-auto">
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

        {error && (
          <div className="mb-4 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Drag hint */}
        {dragItem && (
          <div className="mb-3 rounded border border-dashed border-blue-300 bg-blue-50 px-3 py-2 text-center text-sm text-blue-600">
            {dragItem.type === "memo"
              ? "📄 メモをドラッグ中 — フォルダにドロップで移動 / 一覧内で並び替え"
              : "📁 フォルダをドラッグ中 — フォルダにドロップで階層変更（500ms ホバーで自動展開）"}
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
                setColorOpen,
                onSubmit,
                onDelete,
              },
            )}
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-2xl font-bold">{currentLabel}</h1>
              <div className="flex gap-2">
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
                  return (
                    <div
                      key={f.id}
                      className={`group flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all ${
                        isDrop
                          ? "border-blue-400 bg-blue-50 ring-2 ring-blue-400"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      } ${dragItem?.type === "folder" && dragItem.id === f.id ? "opacity-40" : ""}`}
                      onClick={() => navigateTo(f.id)}
                      draggable
                      onDragStart={(e) => handleDragStart(e, "folder", f.id)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleFolderDragOver(e, f.id)}
                      onDragLeave={(e) => handleFolderDragLeave(e, f.id)}
                      onDrop={(e) => handleFolderDrop(e, f.id)}
                    >
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
                      <div className="hidden gap-1 group-hover:flex">
                        <button
                          onClick={(e) => onRenameFolder(f, e)}
                          title="リネーム"
                          className="rounded p-1 text-xs text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                        >
                          ✎
                        </button>
                        <button
                          onClick={(e) => onDeleteFolder(f, e)}
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
              <h2 className="mb-3 text-lg font-semibold">
                メモ一覧
                {directMemos.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    {directMemos.length}件
                  </span>
                )}
              </h2>
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
              onClick={() => a.setExportOpen(!s.exportOpen)}
              className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
            >
              エクスポート ▾
            </button>
            {s.exportOpen && (
              <ul className="absolute right-0 z-10 mt-1 w-56 rounded border border-slate-200 bg-white py-1 text-sm shadow-lg">
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
