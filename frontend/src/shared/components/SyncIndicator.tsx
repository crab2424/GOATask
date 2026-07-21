import { useServerEventConnection } from "../lib/useServerEvents";
import { serverEvents } from "../lib/serverEvents";
import { refreshBus } from "../lib/refreshBus";

// 現在のSSE接続状態と手動更新ボタンを1個にまとめた小さなインジケータ。
// - 接続中: 緑, 接続試行中: 黄, 切断: 灰
// - クリックで現在ビューの再取得(refreshBus.requestRefresh) + SSE再接続
export function SyncIndicator({ compact = false }: { compact?: boolean }) {
  const state = useServerEventConnection();
  const color = state === "open" ? "bg-emerald-500" : state === "connecting" ? "bg-amber-400" : "bg-slate-400";
  const title = state === "open"
    ? "同期中（サーバー接続OK）"
    : state === "connecting"
    ? "同期接続中…"
    : "同期切断中";
  const onClick = () => {
    serverEvents.reconnectNow();
    refreshBus.requestRefresh();
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${title}\nクリックで再取得`}
      aria-label="同期状態と手動更新"
      className={`flex shrink-0 items-center gap-1.5 rounded ${compact ? "p-1" : "px-2 py-1"} text-slate-500 transition-colors hover:bg-slate-100`}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      <span className={compact ? "sr-only" : "text-[13px] leading-none"}>更新</span>
    </button>
  );
}
