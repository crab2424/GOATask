import { useEffect, useState } from "react";
import { checkHealth } from "./api/tasks";
import { HomeView } from "./views/HomeView";
import { TaskView } from "./views/TaskView";
import { MemoView } from "./views/MemoView";
import { FlashcardView } from "./views/FlashcardView";
import { BackupView } from "./views/BackupView";
import { LoginView } from "./views/LoginView";
import { useIsMobile } from "./lib/useIsMobile";
import { useAuth } from "./lib/AuthContext";

type Mode = "home" | "tasks" | "memos" | "flashcards" | "backup";

const TABS: { id: Mode; label: string; icon: string }[] = [
  { id: "home", label: "ホーム", icon: "🏠" },
  { id: "tasks", label: "タスク", icon: "✓" },
  { id: "memos", label: "メモ", icon: "📝" },
  { id: "flashcards", label: "単語帳", icon: "🃏" },
  { id: "backup", label: "バックアップ", icon: "💾" },
];

const NAV_COLLAPSED_KEY = "goatask:navCollapsed";

function App() {
  const { state: authState } = useAuth();
  const [mode, setMode] = useState<Mode>("home");
  const [health, setHealth] = useState<string>("確認中...");
  const isMobile = useIsMobile();
  const [navCollapsed, setNavCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(NAV_COLLAPSED_KEY) === "1";
  });

  useEffect(() => {
    if (authState.status !== "authenticated") return;
    checkHealth()
      .then((h) => setHealth(h.status))
      .catch(() => setHealth("接続失敗"));
  }, [authState.status]);

  if (authState.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        読み込み中...
      </div>
    );
  }
  if (authState.status === "anonymous") {
    return <LoginView />;
  }

  useEffect(() => {
    window.localStorage.setItem(NAV_COLLAPSED_KEY, navCollapsed ? "1" : "0");
  }, [navCollapsed]);

  const content = (
    <>
      {mode === "home" && <HomeView />}
      {mode === "tasks" && <TaskView />}
      {mode === "memos" && <MemoView />}
      {mode === "flashcards" && <FlashcardView />}
      {mode === "backup" && <BackupView />}
    </>
  );

  if (isMobile) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 py-2">
          <h1 className="text-base font-bold">GOATask</h1>
          <p className="text-[10px] text-slate-500">
            API: <span className="font-mono">{health}</span>
          </p>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 pb-24">
          {content}
        </main>
        <nav
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors ${
                mode === tab.id
                  ? "font-bold text-slate-900"
                  : "text-slate-500"
              }`}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <nav
        className={`flex shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-150 ${
          navCollapsed ? "w-14" : "w-48"
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3">
          {!navCollapsed && (
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold">GOATask</h1>
              <p className="mt-0.5 text-[10px] text-slate-500">
                API: <span className="font-mono">{health}</span>
              </p>
            </div>
          )}
          <button
            onClick={() => setNavCollapsed((v) => !v)}
            className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100"
            title={navCollapsed ? "メニューを展開" : "メニューを畳む"}
            aria-label={navCollapsed ? "メニューを展開" : "メニューを畳む"}
          >
            {navCollapsed ? "›" : "‹"}
          </button>
        </div>
        <ul className="flex-1 p-2">
          {TABS.map((tab) => (
            <li key={tab.id}>
              <button
                onClick={() => setMode(tab.id)}
                title={navCollapsed ? tab.label : undefined}
                className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm transition-colors ${
                  mode === tab.id
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                } ${navCollapsed ? "justify-center" : ""}`}
              >
                <span className="w-5 shrink-0 text-center">{tab.icon}</span>
                {!navCollapsed && <span>{tab.label}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <main className="min-w-0 flex-1 p-6">{content}</main>
    </div>
  );
}

export default App;
