import type { ReactNode } from "react";
import { NAV_ITEMS, PRIMARY_MOBILE_ITEMS, SECONDARY_MOBILE_ITEMS, type Mode } from "./navigation";

interface AppShellProps {
  children: ReactNode;
  isMobile: boolean;
  mode: Mode;
  username: string;
  health: string;
  navCollapsed: boolean;
  showMore: boolean;
  onModeChange: (mode: Mode) => void;
  onToggleNavigation: () => void;
  onShowMoreChange: (show: boolean) => void;
  onLogout: () => void;
}

export function AppShell(props: AppShellProps) {
  if (props.isMobile) {
    return (
      <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
          <h1 className="text-base font-bold">GOATask</h1>
          <div className="flex items-center gap-2">
            <p className="text-[10px] text-slate-500"><span className="font-mono">{props.username}</span> / API: <span className="font-mono">{props.health}</span></p>
            <button onClick={props.onLogout} className="rounded border border-slate-300 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-100">ログアウト</button>
          </div>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 pb-20">{props.children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          {PRIMARY_MOBILE_ITEMS.map((item) => <button key={item.id} onClick={() => props.onModeChange(item.id)} className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors ${props.mode === item.id ? "font-bold text-slate-900" : "text-slate-500"}`}><span className="text-lg leading-none">{item.icon}</span><span>{item.label}</span></button>)}
          <button onClick={() => props.onShowMoreChange(true)} className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors ${SECONDARY_MOBILE_ITEMS.some((item) => item.id === props.mode) ? "font-bold text-slate-900" : "text-slate-500"}`}><span className="text-lg leading-none">•••</span><span>その他</span></button>
        </nav>
        {props.showMore && <div className="fixed inset-0 z-50 flex items-end bg-black/30" onClick={() => props.onShowMoreChange(false)}><div className="w-full rounded-t-2xl bg-white p-4 pb-8 shadow-xl" style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }} onClick={(event) => event.stopPropagation()}><div className="mx-auto mb-4 h-1 w-10 rounded bg-slate-300" />{SECONDARY_MOBILE_ITEMS.map((item) => <button key={item.id} onClick={() => { props.onModeChange(item.id); props.onShowMoreChange(false); }} className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left hover:bg-slate-100"><span>{item.icon}</span><span>{item.label}</span></button>)}<button onClick={() => { props.onShowMoreChange(false); props.onLogout(); }} className="mt-2 flex w-full items-center gap-3 border-t px-4 py-3 text-left text-rose-600"><span>⏻</span><span>ログアウト</span></button></div></div>}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <nav className={`flex shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white transition-[width] duration-150 ${props.navCollapsed ? "w-14" : "w-48"}`}>
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3">
          {!props.navCollapsed && <div className="min-w-0"><h1 className="truncate text-lg font-bold">GOATask</h1><p className="mt-0.5 text-[10px] text-slate-500">API: <span className="font-mono">{props.health}</span></p></div>}
          <button onClick={props.onToggleNavigation} className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100" title={props.navCollapsed ? "メニューを展開" : "メニューを畳む"} aria-label={props.navCollapsed ? "メニューを展開" : "メニューを畳む"}>{props.navCollapsed ? "›" : "‹"}</button>
        </div>
        <ul className="flex-1 p-2">{NAV_ITEMS.map((item) => <li key={item.id}><button onClick={() => props.onModeChange(item.id)} title={props.navCollapsed ? item.label : undefined} className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm transition-colors ${props.mode === item.id ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"} ${props.navCollapsed ? "justify-center" : ""}`}><span className="w-5 shrink-0 text-center">{item.icon}</span>{!props.navCollapsed && <span>{item.label}</span>}</button></li>)}</ul>
        <div className="border-t border-slate-200 p-2">{!props.navCollapsed && <p className="mb-1 px-2 text-[11px] text-slate-500"><span className="font-mono">{props.username}</span></p>}<button onClick={props.onLogout} title={props.navCollapsed ? "ログアウト" : undefined} className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 ${props.navCollapsed ? "justify-center" : ""}`}><span className="w-5 shrink-0 text-center">⏻</span>{!props.navCollapsed && <span>ログアウト</span>}</button></div>
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto p-6">{props.children}</main>
    </div>
  );
}
