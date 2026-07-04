// 電卓の編集ツリー（Edit Tree）のデータ層。
// 2次元レイアウトが必要な構造（分数・√・上付き指数）だけをノード化し、
// それ以外（数字・演算子・変数・括弧・関数名）は1文字ずつのcharノードのままにする。
// sin( のような関数名をcharの並びに保つことで、カーソル移動は既存のtokenBoundaries
// （maximal munch）をRow単位でそのまま流用できる。
// 評価は linearize.ts で既存トークナイザ互換の文字列に落として既存エンジンに渡す。

let nextId = 1;
function newId(): string {
  return `n${nextId++}`;
}

export interface CharNode {
  id: string;
  kind: "char";
  ch: string;
}
export interface FracNode {
  id: string;
  kind: "frac";
  num: Row;
  den: Row;
}
export interface SqrtNode {
  id: string;
  kind: "sqrt";
  radicand: Row;
}
export interface SupNode {
  id: string;
  kind: "sup";
  exponent: Row;
}
export interface AbsNode {
  id: string;
  kind: "abs";
  inner: Row;
}
export type EditNode = CharNode | FracNode | SqrtNode | SupNode | AbsNode;
export type Row = EditNode[];

export type SlotName = "num" | "den" | "radicand" | "exponent" | "inner";

/** ネストしたRowを特定するパス。stepsでスロットを辿り、offsetはそのRow内の位置（0〜row.length） */
export interface CursorStep {
  nodeIndex: number;
  slot: SlotName;
}
export interface CursorPath {
  steps: CursorStep[];
  offset: number;
}

export function charNode(ch: string): CharNode {
  return { id: newId(), kind: "char", ch };
}

export function charNodes(text: string): EditNode[] {
  return [...text].map(charNode);
}

export function fracNode(num: Row = [], den: Row = []): FracNode {
  return { id: newId(), kind: "frac", num, den };
}

export function sqrtNode(radicand: Row = []): SqrtNode {
  return { id: newId(), kind: "sqrt", radicand };
}

export function supNode(exponent: Row = []): SupNode {
  return { id: newId(), kind: "sup", exponent };
}

export function absNode(inner: Row = []): AbsNode {
  return { id: newId(), kind: "abs", inner };
}

/** ノードが持つスロットを走査順（左→右のカーソル進行順）で返す。charは空配列 */
export function slotsOf(node: EditNode): SlotName[] {
  switch (node.kind) {
    case "frac":
      return ["num", "den"];
    case "sqrt":
      return ["radicand"];
    case "sup":
      return ["exponent"];
    case "abs":
      return ["inner"];
    default:
      return [];
  }
}

export function isContainer(node: EditNode): boolean {
  return node.kind !== "char";
}

export function getSlot(node: EditNode, slot: SlotName): Row | null {
  switch (node.kind) {
    case "frac":
      return slot === "num" ? node.num : slot === "den" ? node.den : null;
    case "sqrt":
      return slot === "radicand" ? node.radicand : null;
    case "sup":
      return slot === "exponent" ? node.exponent : null;
    case "abs":
      return slot === "inner" ? node.inner : null;
    default:
      return null;
  }
}

/** スロットを差し替えた新しいノードを返す（イミュータブル更新） */
export function withSlot(node: EditNode, slot: SlotName, row: Row): EditNode {
  switch (node.kind) {
    case "frac":
      if (slot === "num") return { ...node, num: row };
      if (slot === "den") return { ...node, den: row };
      break;
    case "sqrt":
      if (slot === "radicand") return { ...node, radicand: row };
      break;
    case "sup":
      if (slot === "exponent") return { ...node, exponent: row };
      break;
    case "abs":
      if (slot === "inner") return { ...node, inner: row };
      break;
  }
  throw new Error(`ノード${node.kind}にスロット${slot}はありません`);
}

/** stepsで指定されたRowを取得する。パスが不正なら例外 */
export function getRowAt(root: Row, steps: CursorStep[]): Row {
  let row = root;
  for (const s of steps) {
    const node = row[s.nodeIndex];
    const slot = node ? getSlot(node, s.slot) : null;
    if (!slot) throw new Error("カーソルパスが不正です");
    row = slot;
  }
  return row;
}

/** stepsで指定されたRowをfnで変換した新しいツリーを返す（イミュータブル更新） */
export function updateRowAt(root: Row, steps: CursorStep[], fn: (row: Row) => Row): Row {
  if (steps.length === 0) return fn(root);
  const [head, ...rest] = steps;
  const node = root[head.nodeIndex];
  const slot = node ? getSlot(node, head.slot) : null;
  if (!slot) throw new Error("カーソルパスが不正です");
  const updated = withSlot(node, head.slot, updateRowAt(slot, rest, fn));
  return [...root.slice(0, head.nodeIndex), updated, ...root.slice(head.nodeIndex + 1)];
}

/** 全スロットが空のノードか（backspaceでノードごと削除してよいかの判定に使う） */
export function nodeIsEmpty(node: EditNode): boolean {
  return slotsOf(node).every((slot) => getSlot(node, slot)!.length === 0);
}

export function treeIsEmpty(tree: Row): boolean {
  return tree.length === 0;
}

export function rootCursor(): CursorPath {
  return { steps: [], offset: 0 };
}

/** ルートRowの末尾位置のカーソル */
export function endCursor(tree: Row): CursorPath {
  return { steps: [], offset: tree.length };
}

export function sameSteps(a: CursorStep[], b: CursorStep[]): boolean {
  return a.length === b.length && a.every((s, i) => s.nodeIndex === b[i].nodeIndex && s.slot === b[i].slot);
}
