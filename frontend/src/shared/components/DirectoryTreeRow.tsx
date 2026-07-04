import type { DragEvent, ReactNode } from "react";

interface DirectoryTreeRowProps {
  depth: number;
  isOpen: boolean;
  hasChildren: boolean;
  isCurrent: boolean;
  isDropTarget: boolean;
  isDragging: boolean;
  label: string;
  count: number;
  dataTreeNode: string;
  isMobile: boolean;
  onClick: () => void;
  onToggleExpand: () => void;
  onContextMenu: (x: number, y: number) => void;
  onMenuToggle: (x: number, y: number) => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  children?: ReactNode;
}

export function DirectoryTreeRow({
  depth,
  isOpen,
  hasChildren,
  isCurrent,
  isDropTarget,
  isDragging,
  label,
  count,
  dataTreeNode,
  isMobile,
  onClick,
  onToggleExpand,
  onContextMenu,
  onMenuToggle,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: DirectoryTreeRowProps) {
  return (
    <li
      role="treeitem"
      aria-expanded={isOpen}
      className={`rounded ${isDropTarget ? "bg-blue-50 ring-2 ring-blue-400" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div
        className={`group flex items-center rounded ${
          isCurrent ? "bg-slate-200 font-bold text-slate-900" : "hover:bg-slate-100"
        } ${isDragging ? "opacity-40" : ""}`}
      >
        <button
          type="button"
          draggable
          data-tree-node={dataTreeNode}
          onClick={onClick}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              e.stopPropagation();
              if (!isOpen) onToggleExpand();
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              e.stopPropagation();
              if (isOpen) onToggleExpand();
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onContextMenu(e.clientX, e.clientY);
          }}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="flex min-w-0 flex-1 items-center gap-1 px-1 py-1 text-left text-sm"
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
        >
          <span className="flex w-4 shrink-0 items-center justify-center text-slate-400">
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`}
            >
              <path
                d="M6 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="flex-1 truncate">
            {label}
            {count > 0 && (
              <span className="ml-1 text-xs text-slate-400">{count}</span>
            )}
          </span>
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            onMenuToggle(rect.left, rect.bottom);
          }}
          title="メニュー"
          aria-label="メニュー"
          className={`shrink-0 rounded px-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 ${
            isMobile ? "" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          ⋮
        </button>
      </div>
      {isOpen && hasChildren && (
        <ul className="relative space-y-0.5">
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-1 top-0 w-px bg-slate-200"
            style={{ left: depth * 16 + 12 }}
          />
          {children}
        </ul>
      )}
    </li>
  );
}
