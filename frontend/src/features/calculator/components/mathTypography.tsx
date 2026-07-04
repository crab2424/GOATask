// 線形文字列の断片を数学記号の見た目に整えるフォーマッタ。
// MathExpression（結果・履歴の文字列表示）とMathEditor（編集ツリーのchar並び）で共用する。
// 計算用の文字列は変更せず、表示だけを整える。
//
// ここで作るspan/supはMathEditorの<math>ツリーの中に置かれる非MathML要素になる。
// MathML CoreのUAスタイルシートはmath配下の非MathML要素にdisplay:block mathを
// 強制するため（SafariではCSSクラスでの上書きが効かなかった）、各要素に元の
// 見た目と同じdisplay値をインラインstyleで明示し直す。
import type { CSSProperties, ReactNode } from "react";

const INLINE: CSSProperties = { display: "inline" };
const INLINE_FLEX: CSSProperties = { display: "inline-flex" };

// 前方一致で探すため、長い名前（asinh等）を短い名前（asin等）より先に置くこと
const FUNCTION_NAMES = [
  "asinh", "acosh", "atanh", "sinh", "cosh", "tanh",
  "asin", "acos", "atan", "sqrt", "sin", "cos", "tan",
  "log", "ln", "exp", "abs", "nPr", "nCr", "nHr", "nVr",
];

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

/** 線形文字列を表示用のReactNode列に変換する（× ÷ 上付き指数 √ sin⁻¹表記など） */
export function renderLinearParts(text: string, keyPrefix = "m"): ReactNode[] {
  const parts: ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const key = `${keyPrefix}-${i}`;
    const fn = FUNCTION_NAMES.find((name) => text.startsWith(name, i));
    if (fn) {
      if (fn === "sqrt" && text[i + fn.length] === "(") {
        const atom = nextAtom(text, i + fn.length);
        parts.push(
          <span key={key} className="inline-flex items-start" style={INLINE_FLEX}>
            <span className="text-[1.15em] leading-none" style={INLINE}>√</span>
            <span className="border-t border-current px-0.5 leading-tight" style={INLINE}>{renderLinearParts(atom.value, key)}</span>
          </span>,
        );
        i = atom.end;
        continue;
      }
      const inverse = fn.startsWith("a") && ["asin", "acos", "atan"].includes(fn);
      const label = inverse ? fn.slice(1) : fn;
      parts.push(
        <span key={key} style={INLINE}>
          {label}{inverse && <sup className="ml-px text-[0.65em]" style={INLINE}>−1</sup>}
        </span>,
      );
      i += fn.length;
      continue;
    }
    if (text[i] === "√") {
      const atom = nextAtom(text, i + 1);
      parts.push(
        <span key={key} className="inline-flex items-start" style={INLINE_FLEX}>
          <span className="text-[1.15em] leading-none" style={INLINE}>√</span>
          <span className="border-t border-current px-0.5 leading-tight" style={INLINE}>{renderLinearParts(atom.value, key)}</span>
        </span>,
      );
      i = atom.end;
      continue;
    }
    if (text[i] === "^" && parts.length > 0) {
      const atom = nextAtom(text, i + 1);
      // 編集中に "x^" のように指数が未入力の状態でカーソルを置くと空sup になり
      // ^ 記号が視覚的に消えてしまう。中身が空のときは ^ をそのまま表示する。
      if (atom.value === "") {
        parts.push(<span key={key} style={INLINE}>^</span>);
        i++;
        continue;
      }
      parts.push(<sup key={key} className="text-[0.65em]" style={INLINE}>{renderLinearParts(atom.value, key)}</sup>);
      i = atom.end;
      continue;
    }
    const symbol = text[i] === "-" ? "−" : text[i] === "*" || text[i] === "·" ? "×" : text[i];
    parts.push(<span key={key} style={INLINE}>{symbol}</span>);
    i++;
  }
  return parts;
}
