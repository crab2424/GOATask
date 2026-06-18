import { useEffect, useState, type FormEvent } from "react";
import {
  createMemo,
  deleteMemo,
  listMemos,
  updateMemo,
  type Memo,
} from "../api/memos";

export function MemoView() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      const list = await listMemos();
      setMemos(list);
      setError(null);
      return list;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return [];
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const selected = memos.find((m) => m.id === selectedId) ?? null;

  const startNew = () => {
    setSelectedId(null);
    setTitle("");
    setContent("");
  };

  const selectMemo = (m: Memo) => {
    setSelectedId(m.id);
    setTitle(m.title);
    setContent(m.content);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      if (selected) {
        const updated = await updateMemo(selected.id, {
          title: title.trim(),
          content,
        });
        await reload();
        setSelectedId(updated.id);
      } else {
        const created = await createMemo({ title: title.trim(), content });
        await reload();
        setSelectedId(created.id);
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

  return (
    <div className="flex h-full gap-4">
      <aside className="w-64 shrink-0">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">メモ一覧</h2>
          <button
            onClick={startNew}
            className="rounded bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-700"
          >
            ＋ 新規
          </button>
        </div>
        {memos.length === 0 ? (
          <p className="text-sm text-slate-500">メモはまだありません。</p>
        ) : (
          <ul className="space-y-1">
            {memos.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => selectMemo(m)}
                  className={`w-full rounded px-2 py-2 text-left text-sm hover:bg-slate-100 ${
                    m.id === selectedId
                      ? "bg-slate-200 font-medium"
                      : "bg-white"
                  }`}
                >
                  <div className="truncate">{m.title}</div>
                  <div className="truncate text-xs text-slate-500">
                    {new Date(m.updated_at).toLocaleString()}
                  </div>
                </button>
              </li>
            ))}
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
