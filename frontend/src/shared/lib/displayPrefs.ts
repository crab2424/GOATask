import { useState } from "react";

// フォルダ横の件数表示（端末ごと・localStorage保存）。
// タスク／メモ画面はマウント時に読み込むだけなので、設定画面での変更は次に開いたとき反映される。
export type CountTarget = "tasks" | "memos";

const countKey = (target: CountTarget) => `goatask:showCount:${target}`;

export function loadShowCount(target: CountTarget): boolean {
  try {
    return window.localStorage.getItem(countKey(target)) !== "false";
  } catch {
    return true;
  }
}

export function useShowCount(target: CountTarget) {
  const [show, setShow] = useState(() => loadShowCount(target));
  const update = (value: boolean) => {
    setShow(value);
    try {
      window.localStorage.setItem(countKey(target), String(value));
    } catch {
      // localStorage が使えない環境では端末に保存しない（表示だけ切り替わる）
    }
  };
  return [show, update] as const;
}
