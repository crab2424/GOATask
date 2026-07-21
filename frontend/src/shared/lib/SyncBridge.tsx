import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerEvents } from "./useServerEvents";
import { refreshBus } from "./refreshBus";

// サーバーイベント種別 -> 影響を受けるReact QueryのqueryKey群。
// SSEで通知が来ると該当キーをinvalidateし、useQueryが自動でrefetchする。
//
// 通知本文にIDは載っているが、現状のアプリはlist単位でクエリを組んでいるため
// list全体を古くマークする方が実装が単純で確実。差分反映は将来最適化。
const KIND_TO_KEYS: Record<string, string[][]> = {
  task: [["tasks"], ["calendar"]],
  subtask: [["tasks"]],
  memo: [["memos"]],
  folder: [["folders"], ["memos"]],
  deck: [["decks"]],
  card: [["decks"]],
  project: [["projects"], ["tasks"]],
  calendar: [["calendar"]],
  settings: [["userSettings"]],
  file: [["files"]],
};

// SSE購読を1箇所で受け、対応するReact Queryキーをinvalidateする。
// アプリ全体で1つだけマウントする（App.tsx直下）。
export function SyncBridge() {
  const queryClient = useQueryClient();

  useServerEvents(Object.keys(KIND_TO_KEYS), (ev) => {
    const [kind] = ev.kind.split(".");
    const keys = KIND_TO_KEYS[kind];
    if (!keys) return;
    for (const key of keys) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  });

  useEffect(() => {
    // 手動更新ボタン: 全キーをinvalidateして即再取得
    return refreshBus.subscribe(() => {
      const uniqueKeys = new Set<string>();
      const keys: string[][] = [];
      for (const group of Object.values(KIND_TO_KEYS)) {
        for (const key of group) {
          const s = key.join("|");
          if (!uniqueKeys.has(s)) { uniqueKeys.add(s); keys.push(key); }
        }
      }
      for (const key of keys) queryClient.invalidateQueries({ queryKey: key });
    });
  }, [queryClient]);

  return null;
}
