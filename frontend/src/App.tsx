import { lazy, Suspense, useEffect, useState } from "react";
import { checkHealth } from "./api/tasks";
import { AppShell } from "./app/AppShell";
import type { Mode } from "./app/navigation";
import { LoginView } from "./features/auth/LoginView";
import { SignupView } from "./features/auth/SignupView";
import { useAuth } from "./shared/lib/useAuth";
import { useIsMobile } from "./shared/lib/useIsMobile";
import { useTheme } from "./shared/lib/useTheme";
import { LoadingIndicator } from "./shared/components/LoadingIndicator";

const HomeView = lazy(() => import("./features/home/HomeView").then((module) => ({ default: module.HomeView })));
const TaskView = lazy(() => import("./features/tasks/TaskView").then((module) => ({ default: module.TaskView })));
const MemoView = lazy(() => import("./features/memos/MemoView").then((module) => ({ default: module.MemoView })));
const FlashcardView = lazy(() => import("./features/flashcards/FlashcardView").then((module) => ({ default: module.FlashcardView })));
const SettingsView = lazy(() => import("./features/settings/SettingsView").then((module) => ({ default: module.SettingsView })));
const CalendarView = lazy(() => import("./features/calendar/CalendarView").then((module) => ({ default: module.CalendarView })));
const CalculatorView = lazy(() => import("./features/calculator/CalculatorView").then((module) => ({ default: module.CalculatorView })));

const NAV_COLLAPSED_KEY = "goatask:navCollapsed";
const STARTUP_MODE_KEY = "goatask:startupMode";

const STARTUP_MODES: Mode[] = ["home", "tasks", "calendar", "memos", "flashcards", "calculator"];

function loadStartupMode(): Mode {
  const value = window.localStorage.getItem(STARTUP_MODE_KEY);
  return STARTUP_MODES.includes(value as Mode) ? (value as Mode) : "home";
}

function App() {
  const { state: authState, logout } = useAuth();
  const [mode, setMode] = useState<Mode>(loadStartupMode);
  const [startupMode, setStartupMode] = useState<Mode>(loadStartupMode);
  const [health, setHealth] = useState("確認中...");
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [hideBottomNav, setHideBottomNav] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();
  const [navCollapsed, setNavCollapsed] = useState(() =>
    typeof window !== "undefined" && window.localStorage.getItem(NAV_COLLAPSED_KEY) === "1",
  );

  useEffect(() => {
    if (authState.status !== "authenticated") return;
    checkHealth().then((response) => setHealth(response.status)).catch(() => setHealth("接続失敗"));
  }, [authState.status]);

  useEffect(() => {
    window.localStorage.setItem(NAV_COLLAPSED_KEY, navCollapsed ? "1" : "0");
  }, [navCollapsed]);

  if (authState.status === "loading") {
    return <LoadingIndicator fullscreen />;
  }
  if (authState.status === "anonymous") {
    return authMode === "login"
      ? <LoginView onSwitchToSignup={() => setAuthMode("signup")} />
      : <SignupView onSwitchToLogin={() => setAuthMode("login")} />;
  }

  const handleLogout = async () => {
    if (!window.confirm("ログアウトしますか？")) return;
    try {
      await logout();
    } catch {
      window.alert("ログアウトに失敗しました");
    }
  };

  const changeStartupMode = (nextMode: Mode) => {
    setStartupMode(nextMode);
    window.localStorage.setItem(STARTUP_MODE_KEY, nextMode);
  };

  const changeMode = (nextMode: Mode) => {
    setMode(nextMode);
    setCalendarDate(null);
  };

  const content = (
    <Suspense fallback={<LoadingIndicator />}>
      {mode === "home" && <HomeView onOpenCalendar={(date) => { setCalendarDate(date); setMode("calendar"); }} onOpenTask={(taskId) => { setOpenTaskId(taskId); setMode("tasks"); }} />}
      {mode === "tasks" && <TaskView initialTaskId={openTaskId} onInitialTaskHandled={() => setOpenTaskId(null)} />}
      {mode === "calendar" && <CalendarView key={calendarDate ?? "calendar"} initialDate={calendarDate} />}
      {mode === "memos" && <MemoView />}
      {mode === "flashcards" && <FlashcardView />}
      {mode === "calculator" && <CalculatorView onKeyboardVisibleChange={setHideBottomNav} />}
      {mode === "settings" && <SettingsView username={authState.user.username} health={health} theme={theme} onThemeChange={setTheme} startupMode={startupMode} onStartupModeChange={changeStartupMode} onLogout={handleLogout} />}
    </Suspense>
  );

  return (
    <AppShell
      isMobile={isMobile}
      mode={mode}
      navCollapsed={navCollapsed}
      showMore={showMore}
      hideBottomNav={hideBottomNav}
      onModeChange={changeMode}
      onToggleNavigation={() => setNavCollapsed((value) => !value)}
      onShowMoreChange={setShowMore}
    >
      {content}
    </AppShell>
  );
}

export default App;
