import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { findUrls, openUrl, urlAt } from "../utils/linkify";

interface Props {
  content: string;
  setContent: (v: string) => void;
  fontSizePx: number;
  /** true: 閲覧モード（リンクをクリックで開ける）／false: 編集モード（textarea） */
  viewing: boolean;
  setViewing: (v: boolean) => void;
}

const ROWS = 14;
const LINE_HEIGHT = 1.6;

/** 閲覧表示内のクリック座標を本文の文字オフセットに変換する */
function offsetFromPoint(root: HTMLElement, x: number, y: number): number | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let node: Node | null = null;
  let offset = 0;
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    if (p) { node = p.offsetNode; offset = p.offset; }
  } else if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(x, y);
    if (r) { node = r.startContainer; offset = r.startOffset; }
  }
  if (!node || !root.contains(node)) return null;
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

/**
 * メモ本文。閲覧モードではURLを青字＋下線のリンクとして表示し、クリックで新しいタブに開く。
 * リンク以外をクリックすると、その位置にカーソルを置いて編集モード（textarea）に切り替える。
 * 編集モードでは Ctrl/⌘+クリック、またはカーソルがURL上にある時に出る「開く」ボタンで開く。
 */
export function MemoContentField({ content, setContent, fontSizePx, viewing, setViewing }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingCaret = useRef<{ pos: number; scrollTop: number } | null>(null);
  const [caretUrl, setCaretUrl] = useState<string | null>(null);

  const style = {
    fontSize: `${fontSizePx}px`,
    lineHeight: LINE_HEIGHT,
    height: `calc(${ROWS * LINE_HEIGHT}em + 1rem + 2px)`,
  };

  const segments = useMemo(() => {
    const out: ReactNode[] = [];
    let last = 0;
    for (const span of findUrls(content)) {
      if (span.start > last) out.push(content.slice(last, span.start));
      out.push(
        <a
          key={span.start}
          href={span.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-blue-600 underline hover:text-blue-800"
        >
          {content.slice(span.start, span.end)}
        </a>,
      );
      last = span.end;
    }
    if (last < content.length) out.push(content.slice(last));
    return out;
  }, [content]);

  // 閲覧→編集の切替直後に、クリック位置へカーソルを置きスクロール位置も引き継ぐ
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (viewing || !textarea || !pendingCaret.current) return;
    const { pos, scrollTop } = pendingCaret.current;
    pendingCaret.current = null;
    textarea.focus();
    textarea.setSelectionRange(pos, pos);
    textarea.scrollTop = scrollTop;
  }, [viewing]);

  const enterEdit = (pos: number, scrollTop: number) => {
    pendingCaret.current = { pos: Math.min(pos, content.length), scrollTop };
    setViewing(false);
  };

  const updateCaretUrl = (t: HTMLTextAreaElement) => {
    setCaretUrl(t.selectionStart === t.selectionEnd ? urlAt(t.value, t.selectionStart) : null);
  };

  return (
    <>
      {viewing ? (
        <div
          role="textbox"
          aria-readonly="true"
          aria-label="内容（クリックで編集）"
          tabIndex={0}
          onClick={(e) => {
            // 文字列をドラッグ選択（コピー目的）した時は編集に切り替えない
            if (!window.getSelection()?.isCollapsed) return;
            const pos = offsetFromPoint(e.currentTarget, e.clientX, e.clientY) ?? content.length;
            enterEdit(pos, e.currentTarget.scrollTop);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.target === e.currentTarget) {
              e.preventDefault();
              enterEdit(content.length, e.currentTarget.scrollTop);
            }
          }}
          style={style}
          className="mb-2 w-full cursor-text overflow-auto whitespace-pre-wrap break-words rounded border border-slate-300 px-3 py-2 font-mono focus:border-slate-500 focus:outline-none"
        >
          {content ? segments : <span className="text-slate-400">内容（プレーンテキスト）</span>}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          id="memo-content-editor"
          value={content}
          onChange={(e) => { setContent(e.target.value); updateCaretUrl(e.target); }}
          onSelect={(e) => updateCaretUrl(e.currentTarget)}
          onBlur={() => setCaretUrl(null)}
          onClick={(e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            const url = urlAt(e.currentTarget.value, e.currentTarget.selectionStart);
            if (url) openUrl(url);
          }}
          placeholder="内容（プレーンテキスト）"
          rows={ROWS}
          style={style}
          className="mb-2 w-full rounded border border-slate-300 px-3 py-2 font-mono focus:border-slate-500 focus:outline-none"
        />
      )}
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500">
        {!viewing && caretUrl && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => openUrl(caretUrl)}
            title={`${caretUrl}\n（Ctrl/⌘+クリックでも開けます）`}
            className="mr-auto max-w-[60%] truncate rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-700 hover:bg-blue-100"
          >
            🔗 開く: {caretUrl}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (viewing) enterEdit(content.length, 0);
            else setViewing(true);
          }}
          className="rounded px-1.5 py-0.5 hover:bg-slate-100"
          title={viewing ? "編集モードに切り替え" : "閲覧モード（リンクをクリックで開ける）に切り替え"}
        >
          {viewing ? "✎ 編集" : "👁 閲覧"}
        </button>
        <span>
          {[...content].length}文字 /{" "}
          {content.trim() === "" ? 0 : content.trim().split(/\s+/).length}
          単語
        </span>
      </div>
    </>
  );
}
