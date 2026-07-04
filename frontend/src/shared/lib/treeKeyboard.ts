import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/**
 * Generic keyboard handler for a tree rendered as buttons inside a container.
 * Each focusable node should have `tabIndex={0}` and `data-tree-node` set.
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
    default:
      break;
  }
}
