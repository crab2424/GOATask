import { useEffect, useState } from "react";
import { checkHealth } from "./api/tasks";
import { HomeView } from "./views/HomeView";
import { TaskView } from "./views/TaskView";
import { MemoView } from "./views/MemoView";
import { FlashcardView } from "./views/FlashcardView";

type Mode = "home" | "tasks" | "memos" | "flashcards";

const TABS: { id: Mode; label: string; icon: string }[] = [
  { id: "home", label: "ホーム", icon: "🏠" },
  { id: "tasks", label: "タスク", icon: "✓" },
  { id: "memos", label: "メモ", icon: "📝" },
  { id: "flashcards", label: "単語帳", icon: "🃏" },
];

function App() {
  const [mode, setMode] = useState<Mode>("home");
  const [health, setHealth] = useState<string>("確認中...");

  useEffect(() => {
    checkHealth()
      .then((h) => setHealth(h.status))
      .catch(() => setHealth("接続失敗"));
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <nav className="flex w-48 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-4">
          <h1 className="text-xl font-bold">GOATask</h1>
          <p className="mt-1 text-xs text-slate-500">
            API: <span className="font-mono">{health}</span>
          </p>
        </div>
        <ul className="flex-1 p-2">
          {TABS.map((tab) => (
            <li key={tab.id}>
              <button
                onClick={() => setMode(tab.id)}
                className={`mb-1 flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors ${
                  mode === tab.id
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span className="w-5 text-center">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <main className="flex-1 p-6">
        {mode === "home" && <HomeView />}
        {mode === "tasks" && <TaskView />}
        {mode === "memos" && <MemoView />}
        {mode === "flashcards" && <FlashcardView />}
      </main>
    </div>
  );
}

export default App;
