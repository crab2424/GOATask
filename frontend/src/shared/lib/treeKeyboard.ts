import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/**
 * ディレクトリツリー共通のキーボード操作（VS Code エクスプローラー準拠）。
 * 各ノードは `li[role=treeitem]` 内の `[data-tree-node]` ボタンで、
 * フォルダ行の li には aria-expanded が付く（DirectoryTreeRow）。
 *
 * - ↑ / ↓ : 前後の可視ノードへ移動   - Home / End : 先頭 / 末尾へ
 * - → : 閉じたフォルダは開く（DirectoryTreeRow 側で処理）／開いたフォルダは最初の子へ
 * - ← : 開いたフォルダは閉じる（DirectoryTreeRow 側で処理）／それ以外は親フォルダへ
 */
export function handleTreeKeyDown(e: ReactKeyboardEvent<HTMLElement>) {
  const container = e.currentTarget;
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>("[data-tree-node]"),
  );
  if (nodes.length === 0) return;
  const active = document.activeElement as HTMLElement | null;
  const idx = active ? nodes.indexOf(active) : -1;

  const focusAt = (i: number) => {
    const target = nodes[Math.max(0, Math.min(nodes.length - 1, i))];
    target?.focus();
  };

  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      focusAt(idx < 0 ? 0 : idx + 1);
      break;
    case "ArrowUp":
      e.preventDefault();
      focusAt(idx < 0 ? nodes.length - 1 : idx - 1);
      break;
    case "Home":
      e.preventDefault();
      focusAt(0);
      break;
    case "End":
      e.preventDefault();
      focusAt(nodes.length - 1);
      break;
    case "ArrowRight": {
      // 開いているフォルダ上: 最初の子ノードへ。閉じたフォルダの展開は行側で処理済み。
      if (idx < 0) return;
      const item = active?.closest<HTMLElement>('li[role="treeitem"]');
      if (!item || item.getAttribute("aria-expanded") !== "true") return;
      const firstChild = item.querySelector<HTMLElement>("ul [data-tree-node]");
      if (firstChild) {
        e.preventDefault();
        firstChild.focus();
      }
      break;
    }
    case "ArrowLeft": {
      // 葉ノード・閉じたフォルダ上: 親フォルダへ。開いたフォルダの折りたたみは行側で処理済み。
      if (idx < 0) return;
      const item = active?.closest<HTMLElement>('li[role="treeitem"]');
      const parentItem = item?.parentElement?.closest<HTMLElement>('li[role="treeitem"]');
      const parentNode = parentItem?.querySelector<HTMLElement>("[data-tree-node]");
      if (parentNode) {
        e.preventDefault();
        parentNode.focus();
      }
      break;
    }
    default:
      break;
  }
}
