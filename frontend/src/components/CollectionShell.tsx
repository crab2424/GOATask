import { type HTMLAttributes, type ReactNode } from "react";
import { MobileDrawer } from "./MobileDrawer";

interface CollectionShellProps {
  isMobile: boolean;
  /** Sidebar tree/search content (identical for desktop aside and mobile drawer). */
  treeContent: ReactNode;
  /** Main content — usually the list, editor, or dashboard for the current mode. */
  children: ReactNode;

  /** Mobile drawer open/close state. */
  treeOpen: boolean;
  onTreeOpenChange: (open: boolean) => void;
  /** Label shown next to ☰ on the mobile toggle button (usually the current folder/project). */
  mobileToggleLabel: string;

  /** Desktop sidebar width utility class. Defaults to `w-60`. */
  sidebarWidthClass?: string;
  /** Extra classes applied to the desktop `<aside>` (e.g., border color while a drop is hovering). */
  sidebarClassName?: string;
  /** HTML props for the desktop `<aside>` (drag/drop handlers when dropping onto the tree root). */
  sidebarProps?: HTMLAttributes<HTMLElement>;
  /** HTML props for the outermost wrapper (e.g., top-level onDragOver preventDefault). */
  wrapperProps?: HTMLAttributes<HTMLDivElement>;
  /** Extra utility classes for the main content wrapper. */
  mainClassName?: string;
  /** Title shown in the mobile drawer header. */
  drawerTitle?: string;
  /** Header text shown at the top of the desktop sidebar. */
  sidebarHeading?: string;
}

/**
 * Shared layout skeleton for collection-style modes (Task, Memo, …):
 * desktop sidebar tree + main area, collapsed to a MobileDrawer on narrow screens.
 * Composition only — domain state (tree data, drag-drop rules, breadcrumbs) stays in the caller.
 */
export function CollectionShell({
  isMobile,
  treeContent,
  children,
  treeOpen,
  onTreeOpenChange,
  mobileToggleLabel,
  sidebarWidthClass = "w-60",
  sidebarClassName = "",
  sidebarProps,
  wrapperProps,
  mainClassName = "",
  drawerTitle = "ナビゲーション",
  sidebarHeading = "ナビゲーション",
}: CollectionShellProps) {
  const mainBaseClass = isMobile
    ? "h-full overflow-y-auto"
    : "flex-1 overflow-y-auto";

  return (
    <div className={isMobile ? "h-full" : "flex h-full gap-4"} {...wrapperProps}>
      {!isMobile && (
        <aside
          {...sidebarProps}
          className={`${sidebarWidthClass} shrink-0 overflow-y-auto rounded-lg border bg-white p-2 transition-colors ${sidebarClassName}`}
        >
          <div className="mb-2 px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {sidebarHeading}
            </h2>
          </div>
          {treeContent}
        </aside>
      )}

      {isMobile && (
        <MobileDrawer
          open={treeOpen}
          onClose={() => onTreeOpenChange(false)}
          title={drawerTitle}
        >
          {treeContent}
        </MobileDrawer>
      )}

      <div className={`${mainBaseClass} ${mainClassName}`}>
        {isMobile && (
          <button
            onClick={() => onTreeOpenChange(true)}
            className="mb-3 inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-100"
            aria-label="ナビゲーションを開く"
          >
            <span aria-hidden="true">☰</span>
            <span>{mobileToggleLabel}</span>
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
