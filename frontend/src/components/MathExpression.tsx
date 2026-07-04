import type { ReactNode } from "react";

interface MathExpressionProps {
  expression: string;
  className?: string;
}

const FUNCTION_NAMES = ["asin", "acos", "atan", "sqrt", "sin", "cos", "tan", "log", "ln", "nPr", "nCr"];

function matchingParen(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "(") depth++;
    if (text[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

function nextAtom(text: string, start: number): { value: string; end: number } {
  if (text[start] === "(") {
    const close = matchingParen(text, start);
    if (close >= 0) return { value: text.slice(start + 1, close), end: close + 1 };
  }
  const match = text.slice(start).match(/^[+−-]?(?:\d+(?:\.\d+)?|[a-zA-Zπ]+)/);
  if (match) return { value: match[0], end: start + match[0].length };
  return { value: text[start] ?? "", end: start + 1 };
}

function renderParts(text: string, keyPrefix = "m"): ReactNode[] {
  const parts: ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const key = `${keyPrefix}-${i}`;
    const fn = FUNCTION_NAMES.find((name) => text.startsWith(name, i));
    if (fn) {
      if (fn === "sqrt" && text[i + fn.length] === "(") {
        const atom = nextAtom(text, i + fn.length);
        parts.push(
          <span key={key} className="inline-flex items-start">
            <span className="text-[1.15em] leading-none">√</span>
            <span className="border-t border-current px-0.5 leading-tight">{renderParts(atom.value, key)}</span>
          </span>,
        );
        i = atom.end;
        continue;
      }
      const inverse = fn.startsWith("a") && ["asin", "acos", "atan"].includes(fn);
      const label = inverse ? fn.slice(1) : fn;
      parts.push(
        <span key={key} className="font-serif not-italic">
          {label}{inverse && <sup className="ml-px text-[0.65em]">−1</sup>}
        </span>,
      );
      i += fn.length;
      continue;
    }
    if (text[i] === "√") {
      const atom = nextAtom(text, i + 1);
      parts.push(
        <span key={key} className="inline-flex items-start">
          <span className="text-[1.15em] leading-none">√</span>
          <span className="border-t border-current px-0.5 leading-tight">{renderParts(atom.value, key)}</span>
        </span>,
      );
      i = atom.end;
      continue;
    }
    if (text[i] === "^" && parts.length > 0) {
      const atom = nextAtom(text, i + 1);
      parts.push(<sup key={key} className="text-[0.65em]">{renderParts(atom.value, key)}</sup>);
      i = atom.end;
      continue;
    }
    const symbol = text[i] === "-" ? "−" : text[i] === "*" || text[i] === "·" ? "×" : text[i];
    parts.push(<span key={key}>{symbol}</span>);
    i++;
  }
  return parts;
}

/** 計算用文字列を変更せず、表示だけを数学記号に整える。 */
export function MathExpression({ expression, className = "" }: MathExpressionProps) {
  return (
    <span className={`font-serif tabular-nums ${className}`} aria-label={expression}>
      {renderParts(expression)}
    </span>
  );
}
