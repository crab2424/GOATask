import type { ReactNode } from "react";
import { NAV_ITEMS, PRIMARY_MOBILE_ITEMS, SECONDARY_MOBILE_ITEMS, type Mode } from "./navigation";

interface AppShellProps {
  children: ReactNode;
  isMobile: boolean;
  mode: Mode;
  navCollapsed: boolean;
  showMore: boolean;
  /** trueの間、モバイル下部タブバーを一時的に隠す（電卓の仮想キーボード表示中など）。 */
  hideBottomNav: boolean;
  onModeChange: (mode: Mode) => void;
  onToggleNavigation: () => void;
  onShowMoreChange: (show: boolean) => void;
}

export function AppShell(props: AppShellProps) {
  if (props.isMobile) {
    return (
      <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
          <h1 className="text-base font-bold">GOATask</h1>
          <button onClick={() => props.onModeChange("settings")} aria-label="設定" className={`rounded p-1.5 text-lg leading-none transition-colors ${props.mode === "settings" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>⚙</button>
        </header>
        <main className={`min-h-0 min-w-0 flex-1 overflow-y-auto p-3 ${props.hideBottomNav ? "pb-3" : "pb-20"}`}>{props.children}</main>
        {!props.hideBottomNav && (
          <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            {PRIMARY_MOBILE_ITEMS.map((item) => <button key={item.id} onClick={() => props.onModeChange(item.id)} className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors ${props.mode === item.id ? "font-bold text-slate-900" : "text-slate-500"}`}><span className="text-lg leading-none">{item.icon}</span><span>{item.label}</span></button>)}
            <button onClick={() => props.onShowMoreChange(true)} className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors ${SECONDARY_MOBILE_ITEMS.some((item) => item.id === props.mode) ? "font-bold text-slate-900" : "text-slate-500"}`}><span className="text-lg leading-none">•••</span><span>その他</span></button>
          </nav>
        )}
        {props.showMore && <div className="fixed inset-0 z-50 flex items-end bg-black/30" onClick={() => props.onShowMoreChange(false)}><div className="w-full rounded-t-2xl bg-white p-4 pb-8 shadow-xl" style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }} onClick={(event) => event.stopPropagation()}><div className="mx-auto mb-4 h-1 w-10 rounded bg-slate-300" />{SECONDARY_MOBILE_ITEMS.map((item) => <button key={item.id} onClick={() => { props.onModeChange(item.id); props.onShowMoreChange(false); }} className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left hover:bg-slate-100"><span>{item.icon}</span><span>{item.label}</span></button>)}<button onClick={() => { props.onModeChange("settings"); props.onShowMoreChange(false); }} className="mt-2 flex w-full items-center gap-3 border-t px-4 py-3 text-left text-slate-700"><span>⚙</span><span>設定</span></button></div></div>}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <nav className={`flex shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white transition-[width] duration-150 ${props.navCollapsed ? "w-14" : "w-48"}`}>
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3">
          {!props.navCollapsed && <h1 className="min-w-0 truncate text-lg font-bold">GOATask</h1>}
          <button onClick={props.onToggleNavigation} className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100" title={props.navCollapsed ? "メニューを展開" : "メニューを畳む"} aria-label={props.navCollapsed ? "メニューを展開" : "メニューを畳む"}>{props.navCollapsed ? "›" : "‹"}</button>
        </div>
        <ul className="flex-1 p-2">{NAV_ITEMS.map((item) => <li key={item.id}><button onClick={() => props.onModeChange(item.id)} title={props.navCollapsed ? item.label : undefined} className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm transition-colors ${props.mode === item.id ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"} ${props.navCollapsed ? "justify-center" : ""}`}><span className="w-5 shrink-0 text-center">{item.icon}</span>{!props.navCollapsed && <span>{item.label}</span>}</button></li>)}</ul>
        <div className="border-t border-slate-200 p-2">
          <button onClick={() => props.onModeChange("settings")} title={props.navCollapsed ? "設定" : undefined} className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm transition-colors ${props.mode === "settings" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"} ${props.navCollapsed ? "justify-center" : ""}`}><span className="w-5 shrink-0 text-center">⚙</span>{!props.navCollapsed && <span>設定</span>}</button>
        </div>
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto p-6">{props.children}</main>
    </div>
  );
}
