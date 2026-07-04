// 線形文字列の断片を数学記号の見た目に整えるフォーマッタ。
// MathExpression（結果・履歴の文字列表示）とMathEditor（編集ツリーのchar並び）で共用する。
// 計算用の文字列は変更せず、表示だけを整える。
//
// MathMLツリー内にHTMLのspan/supを混ぜるとSafariが内容を組版しないため、返す要素は
// mn/mi/mo/msqrt/msup/mrowだけに限定する。
import type { ReactNode } from "react";

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
          <msqrt key={key}>
            <mrow>{renderLinearParts(atom.value, key)}</mrow>
          </msqrt>,
        );
        i = atom.end;
        continue;
      }
      const inverse = fn.startsWith("a") && ["asin", "acos", "atan"].includes(fn);
      const label = inverse ? fn.slice(1) : fn;
      parts.push(inverse ? (
        <msup key={key}>
          <mi mathvariant="normal">{label}</mi>
          <mrow><mo>−</mo><mn>1</mn></mrow>
        </msup>
      ) : <mi key={key} mathvariant="normal">{label}</mi>);
      i += fn.length;
      continue;
    }
    if (text[i] === "√") {
      const atom = nextAtom(text, i + 1);
      parts.push(
        <msqrt key={key}>
          <mrow>{renderLinearParts(atom.value, key)}</mrow>
        </msqrt>,
      );
      i = atom.end;
      continue;
    }
    if (text[i] === "^" && parts.length > 0) {
      const atom = nextAtom(text, i + 1);
      // 編集中に "x^" のように指数が未入力の状態でカーソルを置くと空sup になり
      // ^ 記号が視覚的に消えてしまう。中身が空のときは ^ をそのまま表示する。
      if (atom.value === "") {
        parts.push(<mo key={key}>^</mo>);
        i++;
        continue;
      }
      parts.push(
        <msup key={key}>
          <mspace width="0" />
          <mrow>{renderLinearParts(atom.value, key)}</mrow>
        </msup>,
      );
      i = atom.end;
      continue;
    }
    const number = text.slice(i).match(/^\d+(?:\.\d+)?/);
    if (number) {
      parts.push(<mn key={key}>{number[0]}</mn>);
      i += number[0].length;
      continue;
    }
    const identifier = text.slice(i).match(/^[a-zA-Zπ]+/);
    if (identifier) {
      // <mi>は1文字なら既定で斜体、複数文字なら通常体になるため、カーソル位置で
      // 文字列が分割されたときに字体が変わらないよう変数は常に1文字ずつ組版する。
      parts.push(...[...identifier[0]].map((ch, offset) => (
        <mi key={`${key}-${offset}`}>{ch}</mi>
      )));
      i += identifier[0].length;
      continue;
    }
    const symbol = text[i] === "-" ? "−" : text[i] === "*" || text[i] === "·" ? "×" : text[i];
    parts.push(<mo key={key}>{symbol}</mo>);
    i++;
  }
  return parts;
}
