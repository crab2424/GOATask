import { useEffect, useState, type FormEvent } from "react";
import {
  checkHealth,
  createTask,
  deleteTask,
  listTasks,
  updateTask,
  type Task,
  type TaskStatus,
} from "./api/tasks";

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

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [health, setHealth] = useState<string>("確認中...");
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      setTasks(await listTasks());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    checkHealth()
      .then((h) => setHealth(h.status))
      .catch(() => setHealth("接続失敗"));
    reload();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await createTask({ title: title.trim(), description: description.trim() });
      setTitle("");
      setDescription("");
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

  const onDelete = async (id: number) => {
    await deleteTask(id);
    await reload();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <h1 className="text-2xl font-bold">GOATask</h1>
          <span className="text-sm text-slate-500">
            API: <span className="font-mono">{health}</span>
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {error && (
          <div className="mb-4 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <form
          onSubmit={onSubmit}
          className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h2 className="mb-3 text-lg font-semibold">新しいタスク</h2>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="タイトル"
            className="mb-2 w-full rounded border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="詳細（任意）"
            rows={2}
            className="mb-2 w-full rounded border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 disabled:bg-slate-400"
            disabled={!title.trim()}
          >
            追加
          </button>
        </form>

        <section>
          <h2 className="mb-3 text-lg font-semibold">タスク一覧</h2>
          {tasks.length === 0 ? (
            <p className="text-sm text-slate-500">タスクはまだありません。</p>
          ) : (
            <ul className="space-y-2">
              {tasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start justify-between rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => cycleStatus(t)}
                        className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[t.status]}`}
                      >
                        {STATUS_LABEL[t.status]}
                      </button>
                      <span className="font-medium">{t.title}</span>
                    </div>
                    {t.description && (
                      <p className="mt-1 text-sm text-slate-600">{t.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => onDelete(t.id)}
                    className="ml-3 text-sm text-rose-600 hover:text-rose-800"
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
