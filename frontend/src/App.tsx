import { useEffect, useState } from "react";
import { checkHealth } from "./api/tasks";
import { HomeView } from "./views/HomeView";
import { TaskView } from "./views/TaskView";
import { MemoView } from "./views/MemoView";
import { FlashcardView } from "./views/FlashcardView";
import { BackupView } from "./views/BackupView";
import { CalendarView } from "./views/CalendarView";
import { LoginView } from "./views/LoginView";
import { useIsMobile } from "./lib/useIsMobile";
import { useAuth } from "./lib/AuthContext";

type Mode = "home" | "tasks" | "calendar" | "memos" | "flashcards" | "backup";

const TABS: { id: Mode; label: string; icon: string }[] = [
  { id: "home", label: "ホーム", icon: "🏠" },
  { id: "tasks", label: "タスク", icon: "✓" },
  { id: "calendar", label: "カレンダー", icon: "▦" },
  { id: "memos", label: "メモ", icon: "📝" },
  { id: "flashcards", label: "単語帳", icon: "🃏" },
  { id: "backup", label: "バックアップ", icon: "💾" },
];

const MOBILE_TABS: { id: Mode | "more"; label: string; icon: string }[] = [
  { id: "home", label: "ホーム", icon: "🏠" },
  { id: "tasks", label: "タスク", icon: "✓" },
  { id: "calendar", label: "カレンダー", icon: "▦" },
  { id: "memos", label: "メモ", icon: "📝" },
  { id: "more", label: "その他", icon: "•••" },
];

const NAV_COLLAPSED_KEY = "goatask:navCollapsed";

function App() {
  const { state: authState, logout } = useAuth();
  const [mode, setMode] = useState<Mode>("home");
  const [health, setHealth] = useState<string>("確認中...");
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  const [showMore, setShowMore] = useState(false);
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

  useEffect(() => {
    window.localStorage.setItem(NAV_COLLAPSED_KEY, navCollapsed ? "1" : "0");
  }, [navCollapsed]);

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

  const user = authState.user;
  const handleLogout = async () => {
    if (!window.confirm("ログアウトしますか？")) return;
    try {
      await logout();
    } catch {
      // 失敗時はユーザーに通知。最低限の体験で十分。
      alert("ログアウトに失敗しました");
    }
  };

  const content = (
    <>
      {mode === "home" && (
        <HomeView
          onOpenCalendar={(date) => { setCalendarDate(date); setMode("calendar"); }}
          onOpenTask={(taskId) => { setOpenTaskId(taskId); setMode("tasks"); }}
        />
      )}
      {mode === "tasks" && (
        <TaskView initialTaskId={openTaskId} onInitialTaskHandled={() => setOpenTaskId(null)} />
      )}
      {mode === "calendar" && <CalendarView key={calendarDate ?? "calendar"} initialDate={calendarDate} />}
      {mode === "memos" && <MemoView />}
      {mode === "flashcards" && <FlashcardView />}
      {mode === "backup" && <BackupView />}
    </>
  );

  if (isMobile) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
          <h1 className="text-base font-bold">GOATask</h1>
          <div className="flex items-center gap-2">
            <p className="text-[10px] text-slate-500">
              <span className="font-mono">{user.username}</span> / API:{" "}
              <span className="font-mono">{health}</span>
            </p>
            <button
              onClick={handleLogout}
              className="rounded border border-slate-300 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-100"
            >
              ログアウト
            </button>
          </div>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 pb-24">
          {content}
        </main>
        <nav
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {MOBILE_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { if (tab.id === "more") setShowMore(true); else { setMode(tab.id); setCalendarDate(null); } }}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors ${
                (tab.id === "more" ? mode === "flashcards" || mode === "backup" : mode === tab.id)
                  ? "font-bold text-slate-900"
                  : "text-slate-500"
              }`}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
        {showMore && <div className="fixed inset-0 z-50 flex items-end bg-black/30" onClick={() => setShowMore(false)}>
          <div className="w-full rounded-t-2xl bg-white p-4 pb-8 shadow-xl" style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded bg-slate-300" />
            {[{ id: "flashcards" as Mode, label: "単語帳", icon: "🃏" }, { id: "backup" as Mode, label: "バックアップ", icon: "💾" }].map((item) => <button key={item.id} onClick={() => { setMode(item.id); setShowMore(false); }} className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left hover:bg-slate-100"><span>{item.icon}</span><span>{item.label}</span></button>)}
            <button onClick={() => { setShowMore(false); handleLogout(); }} className="mt-2 flex w-full items-center gap-3 border-t px-4 py-3 text-left text-rose-600"><span>⏻</span><span>ログアウト</span></button>
          </div>
        </div>}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <nav
        className={`flex shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white transition-[width] duration-150 ${
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
        <div className="border-t border-slate-200 p-2">
          {!navCollapsed && (
            <p className="mb-1 px-2 text-[11px] text-slate-500">
              <span className="font-mono">{user.username}</span>
            </p>
          )}
          <button
            onClick={handleLogout}
            title={navCollapsed ? "ログアウト" : undefined}
            className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 ${
              navCollapsed ? "justify-center" : ""
            }`}
          >
            <span className="w-5 shrink-0 text-center">⏻</span>
            {!navCollapsed && <span>ログアウト</span>}
          </button>
        </div>
      </nav>

      <main className="min-w-0 flex-1 overflow-y-auto p-6">{content}</main>
    </div>
  );
}

export default App;
