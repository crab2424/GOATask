// 編集ツリー⇄既存トークナイザ互換文字列の相互変換。AST層と既存評価パイプライン
// （calculatorEngine / rationalEngine / calcDispatch / equationParser）の唯一の接点。
//
// linearize: frac→(num)/(den)、sqrt→√(radicand)、sup→^(exponent)。
// いずれも既存の分数キー ()/() と同じ表現なので評価系の互換性は実証済み。
//
// parseLinear: 履歴の読み込み・=直後の結果継続・MR挿入などで文字列からツリーを
// 復元する。完全なパースは不要（変換できない並びはcharの列のままで表示も編集も
// 評価も壊れない）。分数の復元は「linearizeで戻したとき元の文字列と評価が一致する
// 場合だけ」行う保守的な方針: 例えば sin(x)/2 の (x) を分子に取り込むと
// sin((x)/(2)) に化けて意味が変わるため、関数呼び出しの括弧は分子にしない。
// 同様に a/b^c は a/(b^c)≠(a/b)^c なので、分母の直後に ^ や ! が続く場合は
// 分数化せず線形のまま残す。
import {
  type EditNode,
  type Row,
  absNode,
  charNode,
  charNodes,
  fracNode,
  isContainer,
  sqrtNode,
  supNode,
} from "./editTree";

export function linearize(row: Row): string {
  let out = "";
  for (const node of row) {
    switch (node.kind) {
      case "char":
        out += node.ch;
        break;
      case "frac":
        out += `(${linearize(node.num)})/(${linearize(node.den)})`;
        break;
      case "sqrt":
        out += `√(${linearize(node.radicand)})`;
        break;
      case "sup":
        out += `^(${linearize(node.exponent)})`;
        break;
      case "abs":
        out += `abs(${linearize(node.inner)})`;
        break;
    }
  }
  return out;
}

/** startの"("に対応する")"の位置を返す（end未満）。見つからなければ-1 */
function matchingParen(text: string, start: number, end: number): number {
  let depth = 0;
  for (let i = start; i < end; i++) {
    if (text[i] === "(") depth++;
    if (text[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

/** i位置から数値リテラル（12・3.14など）にマッチした文字列を返す */
function matchNumber(text: string, i: number, end: number): string | null {
  let j = i;
  while (j < end && text[j] >= "0" && text[j] <= "9") j++;
  if (text[j] === ".") {
    j++;
    while (j < end && text[j] >= "0" && text[j] <= "9") j++;
  }
  return j > i ? text.slice(i, j) : null;
}

function isLetter(ch: string): boolean {
  return /[a-zA-Z]/.test(ch);
}

/**
 * rowの末尾から分子候補を取り出す。取れない並び（関数呼び出しの括弧・sup直後など）は
 * 意味が変わる恐れがあるためnullを返し、呼び出し側は/をcharのまま残す。
 */
function takeNumerator(row: Row): { startIndex: number; nodes: EditNode[] } | null {
  if (row.length === 0) return null;
  const last = row[row.length - 1];
  // 分数・√・絶対値ノード単体は安全に分子にできる（(√x)/2 と √x/2 は評価が同じ）
  if (last.kind === "frac" || last.kind === "sqrt" || last.kind === "abs") {
    return { startIndex: row.length - 1, nodes: [last] };
  }
  // supは基数とセットで意味を持つため分子に取らない（2^2/3 は (2^2)/3 で線形のままが正しい）
  if (last.kind === "sup") return null;
  const ch = (last as { ch: string }).ch;
  // 末尾の数値トークン（x2/3→x*(2/3)は評価が変わらないので前が文字でも安全）
  if ((ch >= "0" && ch <= "9") || ch === ".") {
    let i = row.length - 1;
    while (i > 0) {
      const prev = row[i - 1];
      if (prev.kind === "char" && ((prev.ch >= "0" && prev.ch <= "9") || prev.ch === ".")) i--;
      else break;
    }
    return { startIndex: i, nodes: row.slice(i) };
  }
  // 括弧グループ: 対応する ( までを分子にする。ただし直前が英字なら関数呼び出し
  // （sin(x)/2 等）の可能性があるため分数化しない
  if (ch === ")") {
    let depth = 0;
    for (let i = row.length - 1; i >= 0; i--) {
      const n = row[i];
      if (n.kind !== "char") continue;
      if (n.ch === ")") depth++;
      if (n.ch === "(" && --depth === 0) {
        const before = row[i - 1];
        if (before && before.kind === "char" && isLetter(before.ch)) return null;
        // 外側の括弧は外す（linearizeが付け直すので冗長な二重括弧を避ける）
        return { startIndex: i, nodes: row.slice(i + 1, row.length - 1) };
      }
    }
    return null;
  }
  return null;
}

/**
 * text[i]以降から分母候補を1原子（数値・括弧グループ・√・絶対値）取り出す。
 * 直後に^や!が続く場合は a/b^c = a/(b^c) ≠ (a/b)^c となり表示と評価がズレるためnull。
 */
function takeDenominator(text: string, i: number, end: number): { nodes: EditNode[]; end: number } | null {
  let nodes: EditNode[];
  let j: number;
  if (text[i] === "(") {
    const close = matchingParen(text, i, end);
    if (close === -1) return null;
    nodes = parseRange(text, i + 1, close);
    j = close + 1;
  } else if (text[i] === "√") {
    if (text[i + 1] === "(") {
      const close = matchingParen(text, i + 1, end);
      if (close === -1) return null;
      nodes = [sqrtNode(parseRange(text, i + 2, close))];
      j = close + 1;
    } else {
      const num = matchNumber(text, i + 1, end);
      if (!num) return null;
      nodes = [sqrtNode(charNodes(num))];
      j = i + 1 + num.length;
    }
  } else if (text.startsWith("abs(", i)) {
    const close = matchingParen(text, i + 3, end);
    if (close === -1) return null;
    nodes = [absNode(parseRange(text, i + 4, close))];
    j = close + 1;
  } else {
    const num = matchNumber(text, i, end);
    if (!num) return null;
    nodes = charNodes(num);
    j = i + num.length;
  }
  if (j < end && (text[j] === "^" || text[j] === "!")) return null;
  return { nodes, end: j };
}

function parseRange(text: string, start: number, end: number): Row {
  const row: EditNode[] = [];
  let i = start;
  while (i < end) {
    const ch = text[i];
    if (ch === "a" && text.startsWith("abs(", i)) {
      const close = matchingParen(text, i + 3, end);
      if (close !== -1) {
        row.push(absNode(parseRange(text, i + 4, close)));
        i = close + 1;
        continue;
      }
    }
    if (ch === "√") {
      if (text[i + 1] === "(") {
        const close = matchingParen(text, i + 1, end);
        if (close !== -1) {
          row.push(sqrtNode(parseRange(text, i + 2, close)));
          i = close + 1;
          continue;
        }
      }
      const num = matchNumber(text, i + 1, end);
      if (num) {
        row.push(sqrtNode(charNodes(num)));
        i += 1 + num.length;
        continue;
      }
      row.push(charNode(ch));
      i++;
      continue;
    }
    if (ch === "^") {
      if (text[i + 1] === "(") {
        const close = matchingParen(text, i + 1, end);
        if (close !== -1) {
          row.push(supNode(parseRange(text, i + 2, close)));
          i = close + 1;
          continue;
        }
      }
      // x^2 のような括弧なし指数は数値1個または変数1文字だけを指数に取る
      const num = matchNumber(text, i + 1, end) ?? (text[i + 1] === "-" ? `-${matchNumber(text, i + 2, end) ?? ""}` : null);
      if (num && num !== "-") {
        row.push(supNode(charNodes(num)));
        i += 1 + num.length;
        continue;
      }
      if (i + 1 < end && (isLetter(text[i + 1]) || text[i + 1] === "π")) {
        row.push(supNode(charNodes(text[i + 1])));
        i += 2;
        continue;
      }
      row.push(charNode("^"));
      i++;
      continue;
    }
    if (ch === "/") {
      const num = takeNumerator(row);
      if (num) {
        const den = takeDenominator(text, i + 1, end);
        if (den) {
          row.length = num.startIndex;
          row.push(fracNode(num.nodes, den.nodes));
          i = den.end;
          continue;
        }
      }
      row.push(charNode("/"));
      i++;
      continue;
    }
    if (ch === "(") {
      const close = matchingParen(text, i, end);
      if (close !== -1) {
        // 括弧はcharのまま残しつつ、中身を再帰処理して内側の√/^/分数もノード化する
        row.push(charNode("("));
        row.push(...parseRange(text, i + 1, close));
        row.push(charNode(")"));
        i = close + 1;
        continue;
      }
    }
    row.push(charNode(ch));
    i++;
  }
  return row;
}

/**
 * 線形文字列から編集ツリーを復元する。どんな入力でも例外は投げず、
 * 認識できない並びはcharの列として返す。
 */
export function parseLinear(text: string): Row {
  return parseRange(text, 0, text.length);
}

/** ツリー内にコンテナノード（分数・√・指数）が1つでも含まれるか */
export function hasContainer(row: Row): boolean {
  return row.some((n) => isContainer(n));
}
