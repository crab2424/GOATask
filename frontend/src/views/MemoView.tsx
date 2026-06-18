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

const MAX_DEPTH = 3;

type MemoDragItem = { type: "memo" | "folder"; id: number } | null;
type MemoDropTarget = { folderId: number | null } | null;

export function MemoView() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
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
  const [draftFolderForNew, setDraftFolderForNew] = useState<number | null>(
    null,
  );
  const [color, setColor] = useState<string>("");
  const [fontSize, setFontSize] = useState<FontSize>(DEFAULT_FONT_SIZE);
  const [exportOpen, setExportOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const colorRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [dragItem, setDragItem] = useState<MemoDragItem>(null);
  const [dropTarget, setDropTarget] = useState<MemoDropTarget>(null);
  const dragItemRef = useRef<MemoDragItem>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [exportOpen]);

  useEffect(() => {
    if (!colorOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!colorRef.current?.contains(e.target as Node)) {
        setColorOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [colorOpen]);

  const reload = async () => {
    try {
      const [m, f] = await Promise.all([listMemos(), listFolders()]);
      setMemos(m);
      setFolders(f);
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

  const childFolders = useMemo(() => {
    const map = new Map<number | null, Folder[]>();
    for (const f of folders) {
      const key = f.parent_id ?? null;
      const arr = map.get(key) ?? [];
      arr.push(f);
      map.set(key, arr);
    }
    return map;
  }, [folders]);

  const memosByFolder = useMemo(() => {
    const map = new Map<number | null, Memo[]>();
    for (const m of memos) {
      const key = m.folder_id ?? null;
      const arr = map.get(key) ?? [];
      arr.push(m);
      map.set(key, arr);
    }
    return map;
  }, [memos]);

  const flatFolderOptions = useMemo(() => {
    const out: { id: number; label: string }[] = [];
    const walk = (parent: number | null, depth: number) => {
      const list = childFolders.get(parent) ?? [];
      for (const f of list) {
        out.push({ id: f.id, label: `${"　".repeat(depth)}${f.name}` });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [childFolders]);

  const folderDepthMap = useMemo(() => {
    const map = new Map<number, number>();
    const calc = (id: number): number => {
      if (map.has(id)) return map.get(id)!;
      const f = folders.find((folder) => folder.id === id);
      if (!f || f.parent_id == null) {
        map.set(id, 0);
        return 0;
      }
      const d = calc(f.parent_id) + 1;
      map.set(id, d);
      return d;
    };
    folders.forEach((f) => calc(f.id));
    return map;
  }, [folders]);

  // Breadcrumb: path to the selected memo's folder or draft folder
  const activeFolderId = selected
    ? (selected.folder_id ?? null)
    : draftFolderForNew;

  const breadcrumb = useMemo(() => {
    const path: Folder[] = [];
    let id = activeFolderId;
    while (id !== null) {
      const f = folders.find((folder) => folder.id === id);
      if (!f) break;
      path.unshift(f);
      id = f.parent_id ?? null;
    }
    return path;
  }, [activeFolderId, folders]);

  // --- DnD helpers ---

  const subtreeMaxDepthCalc = (folderId: number): number => {
    const children = childFolders.get(folderId) ?? [];
    if (children.length === 0) return 0;
    let max = 0;
    for (const c of children) {
      const d = subtreeMaxDepthCalc(c.id) + 1;
      if (d > max) max = d;
    }
    return max;
  };

  const isDescendantFolder = (
    ancestorId: number,
    checkId: number | null,
  ): boolean => {
    if (checkId === null) return false;
    if (checkId === ancestorId) return true;
    const f = folders.find((folder) => folder.id === checkId);
    if (!f) return false;
    return isDescendantFolder(ancestorId, f.parent_id ?? null);
  };

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
        isDescendantFolder(item.id, targetFolderId)
      )
        return false;
      const f = folders.find((folder) => folder.id === item.id);
      if (f && (f.parent_id ?? null) === targetFolderId) return false;
      const targetDepth =
        targetFolderId !== null
          ? (folderDepthMap.get(targetFolderId) ?? 0)
          : -1;
      const stDepth = subtreeMaxDepthCalc(item.id);
      if (targetDepth + 1 + stDepth >= MAX_DEPTH) return false;
      return true;
    }
    return false;
  };

  const isDropTargetFor = (folderId: number | null) =>
    dropTarget !== null && dropTarget.folderId === folderId;

  // --- DnD handlers ---

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
  };

  const handleDragOver = (
    e: ReactDragEvent,
    targetFolderId: number | null,
  ) => {
    if (!canDrop(targetFolderId)) return;
    e.preventDefault();
    e.stopPropagation();
    setDropTarget({ folderId: targetFolderId });
  };

  const handleDrop = async (
    e: ReactDragEvent,
    targetFolderId: number | null,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const item = dragItemRef.current;
    if (!item) return;
    try {
      if (item.type === "memo") {
        await updateMemo(item.id, { folder_id: targetFolderId });
        if (selectedId === item.id) {
          setFolderId(targetFolderId);
        }
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

  // --- Actions ---

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startNew = (presetFolder: number | null = null) => {
    setSelectedId(null);
    setTitle("");
    setContent("");
    setFolderId(presetFolder);
    setDraftFolderForNew(presetFolder);
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
          folder_id: draftFolderForNew,
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
      startNew();
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
        ? `・メモ ${subMemos.length}件 → 未分類に移動`
        : null,
      subFolders.length === 0 && subMemos.length === 0
        ? "・影響なし（空のフォルダ）"
        : null,
    ]
      .filter(Boolean)
      .join("\n");
    if (!confirm(msg)) return;
    try {
      await deleteFolder(f.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // --- Tree rendering ---

  const renderMemoItem = (m: Memo, depth: number) => {
    const memoColor = isValidColor(m.color) ? m.color : null;
    const isDragging = dragItem?.type === "memo" && dragItem.id === m.id;
    return (
      <li key={m.id}>
        <div
          className={`flex items-center gap-1 rounded text-sm transition-opacity ${
            isDragging ? "opacity-40" : ""
          }`}
          style={{
            paddingLeft: `${depth * 12 + 8}px`,
          }}
          draggable
          onDragStart={(e) => handleDragStart(e, "memo", m.id)}
          onDragEnd={handleDragEnd}
        >
          <button
            onClick={() => selectMemo(m)}
            style={{
              borderLeft: memoColor
                ? `4px solid ${memoColor}`
                : "4px solid transparent",
            }}
            className={`w-full rounded px-2 py-1.5 text-left hover:bg-slate-100 ${
              m.id === selectedId ? "bg-slate-200 font-medium" : "bg-white"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-xs">📄</span>
              <span className="truncate">{m.title}</span>
            </div>
            <div className="truncate pl-5 text-xs text-slate-500">
              {new Date(m.updated_at).toLocaleString()}
            </div>
          </button>
        </div>
      </li>
    );
  };

  const renderFolder = (f: Folder, depth: number) => {
    const isOpen = expanded.has(f.id);
    const subFolders = childFolders.get(f.id) ?? [];
    const subMemos = memosByFolder.get(f.id) ?? [];
    const hasChildren = subFolders.length > 0 || subMemos.length > 0;
    const isDrop = isDropTargetFor(f.id);
    const isDragging = dragItem?.type === "folder" && dragItem.id === f.id;
    const fDepth = folderDepthMap.get(f.id) ?? 0;

    return (
      <li key={f.id}>
        <div
          className={`group flex items-center gap-1 rounded px-1 py-1 text-sm transition-colors hover:bg-slate-100 ${
            isDrop ? "ring-2 ring-blue-400 bg-blue-50" : ""
          } ${isDragging ? "opacity-40" : ""}`}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
          draggable
          onDragStart={(e) => handleDragStart(e, "folder", f.id)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, f.id)}
          onDrop={(e) => handleDrop(e, f.id)}
        >
          <button
            onClick={() => toggleExpand(f.id)}
            className="w-4 shrink-0 text-slate-500"
            aria-label={isOpen ? "閉じる" : "開く"}
          >
            {hasChildren ? (isOpen ? "▾" : "▸") : " "}
          </button>
          <button
            onClick={() => toggleExpand(f.id)}
            className="flex-1 truncate text-left font-medium"
          >
            📁 {f.name}
          </button>
          <div className="hidden gap-1 group-hover:flex">
            {fDepth + 1 < MAX_DEPTH && (
              <button
                onClick={(e) => onCreateFolder(f.id, e)}
                title="サブフォルダ追加"
                className="px-1 text-xs text-slate-500 hover:text-slate-900"
              >
                ＋
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                startNew(f.id);
              }}
              title="このフォルダに新規メモ"
              className="px-1 text-xs text-slate-500 hover:text-slate-900"
            >
              📝
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
          <ul className="space-y-0.5">
            {subFolders.map((sf) => renderFolder(sf, depth + 1))}
            {subMemos.map((sm) => renderMemoItem(sm, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  const rootFolders = childFolders.get(null) ?? [];
  const unfiledMemos = memosByFolder.get(null) ?? [];

  return (
    <div
      className="flex h-full gap-4"
      onDragOver={(e) => {
        if (dragItemRef.current) e.preventDefault();
      }}
    >
      {/* Sidebar */}
      <aside
        className={`w-72 shrink-0 overflow-y-auto rounded-lg border bg-white p-2 transition-colors ${
          isDropTargetFor(null) && dragItem
            ? "border-blue-400 ring-2 ring-blue-400"
            : "border-slate-200"
        }`}
        onDragOver={(e) => handleDragOver(e, null)}
        onDrop={(e) => handleDrop(e, null)}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">メモ一覧</h2>
          <div className="flex gap-1">
            <button
              onClick={(e) => onCreateFolder(null, e)}
              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
              title="ルートにフォルダ追加"
            >
              ＋フォルダ
            </button>
            <button
              onClick={() => startNew(null)}
              className="rounded bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-700"
            >
              ＋ 新規
            </button>
          </div>
        </div>

        {/* Drag hint */}
        {dragItem && (
          <div className="mb-2 rounded border border-dashed border-blue-300 bg-blue-50 px-2 py-1.5 text-center text-xs text-blue-600">
            {dragItem.type === "memo" ? "📄 メモ" : "📁 フォルダ"}
            をドラッグ中 — フォルダにドロップして移動
          </div>
        )}

        {memos.length === 0 && folders.length === 0 ? (
          <p className="text-sm text-slate-500">
            メモもフォルダもまだありません。
          </p>
        ) : (
          <ul className="space-y-0.5">
            {rootFolders.map((f) => renderFolder(f, 0))}
            <li>
              <div className="flex items-center gap-1 rounded px-1 py-1 text-sm text-slate-600">
                <span className="w-4 shrink-0">▾</span>
                <span className="flex-1 truncate font-medium">📂 未分類</span>
              </div>
              <ul className="space-y-0.5">
                {unfiledMemos.length === 0 ? (
                  <li className="px-2 py-1 pl-7 text-xs text-slate-400">
                    （なし）
                  </li>
                ) : (
                  unfiledMemos.map((m) => renderMemoItem(m, 1))
                )}
              </ul>
            </li>
          </ul>
        )}
      </aside>

      {/* Main editor */}
      <section className="flex-1">
        {/* Breadcrumb */}
        <nav className="mb-3 flex items-center gap-1.5 text-sm">
          <span
            className={`rounded px-1.5 py-0.5 ${
              breadcrumb.length === 0
                ? "font-bold text-slate-900"
                : "text-slate-500"
            }`}
          >
            🏠 ルート
          </span>
          {breadcrumb.map((f) => (
            <Fragment key={f.id}>
              <span className="text-slate-300">/</span>
              <button
                onClick={() => {
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    let cur: number | null = f.id;
                    while (cur !== null) {
                      next.add(cur);
                      const folder = folders.find(
                        (folder) => folder.id === cur,
                      );
                      cur = folder?.parent_id ?? null;
                    }
                    return next;
                  });
                  if (selected) {
                    setFolderId(f.id);
                  } else {
                    setDraftFolderForNew(f.id);
                  }
                }}
                className={`rounded px-1.5 py-0.5 ${
                  f.id === activeFolderId
                    ? "font-bold text-slate-900"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                📁 {f.name}
              </button>
            </Fragment>
          ))}
        </nav>

        <h1 className="mb-4 text-2xl font-bold">
          {selected ? "メモを編集" : "新しいメモ"}
        </h1>

        {error && (
          <div className="mb-4 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <form
          onSubmit={onSubmit}
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-2 flex items-center gap-2">
            <label className="text-sm text-slate-600">フォルダ:</label>
            <select
              value={selected ? (folderId ?? "") : (draftFolderForNew ?? "")}
              onChange={(e) => {
                const v =
                  e.target.value === "" ? null : Number(e.target.value);
                if (selected) setFolderId(v);
                else setDraftFolderForNew(v);
              }}
              className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
            >
              <option value="">（未分類）</option>
              {flatFolderOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>

            <label className="ml-2 text-sm text-slate-600">サイズ:</label>
            <select
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value as FontSize)}
              className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
            >
              {FONT_SIZES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <div ref={colorRef} className="relative ml-2">
              <button
                type="button"
                onClick={() => setColorOpen((v) => !v)}
                className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100"
                title="色を選ぶ"
              >
                <span
                  className="inline-block h-4 w-4 rounded border border-slate-300"
                  style={{
                    backgroundColor: isValidColor(color)
                      ? color
                      : "transparent",
                    backgroundImage: isValidColor(color)
                      ? undefined
                      : "linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%), linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%)",
                    backgroundSize: "8px 8px",
                    backgroundPosition: "0 0, 4px 4px",
                  }}
                />
                色 ▾
              </button>
              {colorOpen && (
                <div className="absolute left-0 z-10 mt-1 w-56 rounded border border-slate-200 bg-white p-2 shadow-lg">
                  <div className="mb-2 flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setColor("");
                        setColorOpen(false);
                      }}
                      title="色なし"
                      className={`h-6 w-6 rounded border ${
                        color === ""
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
                          setColor(c.value);
                          setColorOpen(false);
                        }}
                        title={c.label}
                        style={{ backgroundColor: c.value }}
                        className={`h-6 w-6 rounded border ${
                          color === c.value
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
                      value={isValidColor(color) ? color : "#cccccc"}
                      onChange={(e) => setColor(e.target.value)}
                      className="h-6 w-10 cursor-pointer rounded border border-slate-300 p-0"
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="タイトル"
            style={{
              borderLeft: isValidColor(color)
                ? `4px solid ${color}`
                : undefined,
              backgroundColor: isValidColor(color) ? `${color}22` : undefined,
            }}
            className="mb-2 w-full rounded border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="内容（プレーンテキスト）"
            rows={14}
            style={{
              fontSize: `${fontSizePx(fontSize)}px`,
              lineHeight: 1.6,
            }}
            className="mb-2 w-full rounded border border-slate-300 px-3 py-2 font-mono focus:border-slate-500 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 disabled:bg-slate-400"
              disabled={!title.trim()}
            >
              {selected ? "更新" : "作成"}
            </button>
            {selected && (
              <button
                type="button"
                onClick={onDelete}
                className="rounded border border-rose-300 px-4 py-2 text-rose-700 hover:bg-rose-50"
              >
                削除
              </button>
            )}
            {selected && (
              <div ref={exportRef} className="relative ml-auto">
                <button
                  type="button"
                  onClick={() => setExportOpen((v) => !v)}
                  className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
                >
                  エクスポート ▾
                </button>
                {exportOpen && (
                  <ul className="absolute right-0 z-10 mt-1 w-56 rounded border border-slate-200 bg-white py-1 text-sm shadow-lg">
                    {EXPORT_FORMATS.map((fmt) => (
                      <li key={fmt.ext}>
                        <button
                          type="button"
                          onClick={() => {
                            exportMemo(selected, fmt);
                            setExportOpen(false);
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
      </section>
    </div>
  );
}
