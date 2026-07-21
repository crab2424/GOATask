import { useEffect, useState } from "react";
import { serverEvents, type ConnectionState, type ServerEvent } from "./serverEvents";

// 特定のイベント種別だけをフィルタして購読するhook。
// kindsは "task", "task.updated" のように種別プレフィックスも完全一致もOK。
// - "task" → task.created, task.updated, task.deleted 全部拾う
// - "task.updated" → updateだけ拾う
export function useServerEvents(kinds: string[], handler: (ev: ServerEvent) => void): void {
  useEffect(() => {
    const unsub = serverEvents.subscribe((ev) => {
      for (const k of kinds) {
        if (ev.kind === k) { handler(ev); return; }
        if (!k.includes(".") && ev.kind.startsWith(k + ".")) { handler(ev); return; }
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kinds.join("|"), handler]);
}

export function useServerEventConnection(): ConnectionState {
  const [state, setState] = useState<ConnectionState>(serverEvents.getState());
  useEffect(() => serverEvents.subscribeState(setState), []);
  return state;
}
