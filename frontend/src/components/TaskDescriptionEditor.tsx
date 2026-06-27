import { useEffect, useRef, type KeyboardEvent } from "react";

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

const CHECK_PREFIX = "- [ ] ";

function lineRangeAt(text: string, pos: number): { start: number; end: number } {
  const start = text.lastIndexOf("\n", pos - 1) + 1;
  let end = text.indexOf("\n", pos);
  if (end === -1) end = text.length;
  return { start, end };
}

function matchListPrefix(line: string): { indent: string; marker: string; body: string } | null {
  const m = line.match(/^(\s*)(- \[[ xX]\] |- |・)(.*)$/);
  if (!m) return null;
  return { indent: m[1], marker: m[2], body: m[3] };
}

export function TaskDescriptionEditor({
  value,
  onChange,
  placeholder,
  rows = 3,
  className = "",
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.6)}px`;
  }, [value]);

  function insertAtCursor(insert: string) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = value.slice(0, start) + insert + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + insert.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  function wrapSelection(prefix: string, suffix = prefix, placeholder = "") {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end) || placeholder;
    const next = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const a = start + prefix.length;
      el.setSelectionRange(a, a + selected.length);
    });
  }

  function insertChecklistAtLineStart() {
    const el = ref.current;
    if (!el) return;
    const pos = el.selectionStart;
    const { start } = lineRangeAt(value, pos);
    const next = value.slice(0, start) + CHECK_PREFIX + value.slice(start);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = pos + CHECK_PREFIX.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    const el = e.currentTarget;
    const pos = el.selectionStart;
    if (pos !== el.selectionEnd) return;
    const { start, end } = lineRangeAt(value, pos);
    const line = value.slice(start, end);
    const match = matchListPrefix(line);
    if (!match) return;
    e.preventDefault();
    if (match.body.trim() === "") {
      const next = value.slice(0, start) + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start, start);
      });
      return;
    }
    const marker = /^- \[[xX]\] $/.test(match.marker) ? "- [ ] " : match.marker;
    const insert = `\n${match.indent}${marker}`;
    const next = value.slice(0, pos) + insert + value.slice(pos);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = pos + insert.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-1 text-xs">
        <button
          type="button"
          onClick={() => wrapSelection("**", "**", "太字")}
          className="rounded border border-slate-300 px-2 py-0.5 font-bold hover:bg-slate-100"
          title="太字 (**xxx**)"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => wrapSelection("*", "*", "斜体")}
          className="rounded border border-slate-300 px-2 py-0.5 italic hover:bg-slate-100"
          title="斜体 (*xxx*)"
        >
          I
        </button>
        <button
          type="button"
          onClick={() => wrapSelection("`", "`", "code")}
          className="rounded border border-slate-300 px-2 py-0.5 font-mono hover:bg-slate-100"
          title="コード (`xxx`)"
        >
          {"`code`"}
        </button>
        <button
          type="button"
          onClick={insertChecklistAtLineStart}
          className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100"
          title="チェック項目を追加 (- [ ])"
        >
          ☑ チェック項目
        </button>
        <span className="ml-1 text-slate-400">
          **太字** *斜体* `code` / 「- [ ]」「・」でチェックリスト
        </span>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={`w-full resize-none break-words rounded border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none ${className}`}
      />
    </div>
  );
}
