import { useEffect, useMemo, useState, type FormEvent } from "react";
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

export function MemoView() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [draftFolderForNew, setDraftFolderForNew] = useState<number | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

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
  };

  const selectMemo = (m: Memo) => {
    setSelectedId(m.id);
    setTitle(m.title);
    setContent(m.content);
    setFolderId(m.folder_id ?? null);
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
        });
        await reload();
        setSelectedId(updated.id);
      } else {
        const created = await createMemo({
          title: title.trim(),
          content,
          folder_id: draftFolderForNew,
        });
        await reload();
        setSelectedId(created.id);
        setFolderId(created.folder_id ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onDelete = async () => {
    if (!selected) return;
    if (!confirm(`「${selected.title}」を削除しますか？`)) return;
    try {
      await deleteMemo(selected.id);
      startNew();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onCreateFolder = async (parent: number | null) => {
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

  const onRenameFolder = async (f: Folder) => {
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

  const onDeleteFolder = async (f: Folder) => {
    if (
      !confirm(
        `フォルダ「${f.name}」を削除しますか？\n中のメモは「未分類」に戻り、子フォルダは1つ上に繰り上がります。`,
      )
    )
      return;
    try {
      await deleteFolder(f.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const renderMemoItem = (m: Memo, depth: number) => (
    <li key={m.id}>
      <button
        onClick={() => selectMemo(m)}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        className={`w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100 ${
          m.id === selectedId ? "bg-slate-200 font-medium" : "bg-white"
        }`}
      >
        <div className="truncate">{m.title}</div>
        <div className="truncate text-xs text-slate-500">
          {new Date(m.updated_at).toLocaleString()}
        </div>
      </button>
    </li>
  );

  const renderFolder = (f: Folder, depth: number) => {
    const isOpen = expanded.has(f.id);
    const subFolders = childFolders.get(f.id) ?? [];
    const subMemos = memosByFolder.get(f.id) ?? [];
    return (
      <li key={f.id}>
        <div
          className="group flex items-center gap-1 rounded px-1 py-1 text-sm hover:bg-slate-100"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          <button
            onClick={() => toggleExpand(f.id)}
            className="w-4 shrink-0 text-slate-500"
            aria-label={isOpen ? "閉じる" : "開く"}
          >
            {isOpen ? "▾" : "▸"}
          </button>
          <button
            onClick={() => toggleExpand(f.id)}
            className="flex-1 truncate text-left font-medium"
          >
            📁 {f.name}
          </button>
          <div className="hidden gap-1 group-hover:flex">
            <button
              onClick={() => onCreateFolder(f.id)}
              title="サブフォルダ追加"
              className="px-1 text-xs text-slate-500 hover:text-slate-900"
            >
              ＋
            </button>
            <button
              onClick={() => startNew(f.id)}
              title="このフォルダに新規メモ"
              className="px-1 text-xs text-slate-500 hover:text-slate-900"
            >
              📝
            </button>
            <button
              onClick={() => onRenameFolder(f)}
              title="リネーム"
              className="px-1 text-xs text-slate-500 hover:text-slate-900"
            >
              ✎
            </button>
            <button
              onClick={() => onDeleteFolder(f)}
              title="削除"
              className="px-1 text-xs text-rose-500 hover:text-rose-700"
            >
              🗑
            </button>
          </div>
        </div>
        {isOpen && (subFolders.length > 0 || subMemos.length > 0) && (
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
    <div className="flex h-full gap-4">
      <aside className="w-72 shrink-0 overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">メモ一覧</h2>
          <div className="flex gap-1">
            <button
              onClick={() => onCreateFolder(null)}
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

      <section className="flex-1">
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
              value={
                selected
                  ? (folderId ?? "")
                  : (draftFolderForNew ?? "")
              }
              onChange={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
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
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="タイトル"
            className="mb-2 w-full rounded border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="内容（プレーンテキスト）"
            rows={14}
            className="mb-2 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm focus:border-slate-500 focus:outline-none"
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
          </div>
        </form>
      </section>
    </div>
  );
}
