import { Fragment, type ReactNode } from "react";

type Token =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string };

const PATTERN = /(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|`[^`\n]+?`)/g;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    const start = m.index ?? 0;
    if (start > last) tokens.push({ type: "text", value: text.slice(last, start) });
    const raw = m[0];
    if (raw.startsWith("**")) {
      tokens.push({ type: "bold", value: raw.slice(2, -2) });
    } else if (raw.startsWith("`")) {
      tokens.push({ type: "code", value: raw.slice(1, -1) });
    } else {
      tokens.push({ type: "italic", value: raw.slice(1, -1) });
    }
    last = start + raw.length;
  }
  if (last < text.length) tokens.push({ type: "text", value: text.slice(last) });
  return tokens;
}

function renderMdInline(text: string): ReactNode[] {
  return tokenize(text).map((t, i) => {
    switch (t.type) {
      case "bold":
        return <strong key={i}>{t.value}</strong>;
      case "italic":
        return <em key={i}>{t.value}</em>;
      case "code":
        return (
          <code
            key={i}
            className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] break-all"
          >
            {t.value}
          </code>
        );
      default:
        return <Fragment key={i}>{t.value}</Fragment>;
    }
  });
}

export function MdText({ text, className }: { text: string; className?: string }) {
  return <span className={className}>{renderMdInline(text)}</span>;
}
