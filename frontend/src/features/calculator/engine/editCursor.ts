// 編集ツリー上のカーソル移動。既存のmoveCursor（文字列＋tokenBoundaries）の後継。
// Row内のcharの並びは既存のtokenBoundariesでトークン単位にジャンプし（sin( や asinh を
// 1タップで飛び越える従来仕様の踏襲）、コンテナノード（分数・√・指数）の境界では
// スロットに入る／出る動きをする。
import { tokenBoundaries } from "./calculatorEngine";
import {
  type CharNode,
  type CursorPath,
  type Row,
  getRowAt,
  getSlot,
  isContainer,
  slotsOf,
} from "./editTree";

/**
 * Row内でカーソルが止まれる位置（ノード配列のインデックス、両端含む）を返す。
 * 連続するcharはひとつの文字列とみなしてtokenBoundariesを適用し、
 * コンテナノードは単独で両側が境界になる。
 */
export function rowBoundaries(row: Row): number[] {
  const bounds: number[] = [0];
  const push = (pos: number) => {
    if (bounds[bounds.length - 1] !== pos) bounds.push(pos);
  };
  let i = 0;
  while (i < row.length) {
    if (isContainer(row[i])) {
      i++;
      push(i);
      continue;
    }
    // 連続するcharをまとめてトークン境界を求める（charは1文字なので位置は1:1対応）
    let j = i;
    let text = "";
    while (j < row.length && row[j].kind === "char") {
      text += (row[j] as CharNode).ch;
      j++;
    }
    for (const b of tokenBoundaries(text)) {
      if (b > 0) push(i + b);
    }
    i = j;
  }
  return bounds;
}

function snapRight(bounds: number[], offset: number, max: number): number {
  return bounds.find((b) => b > offset) ?? max;
}

function snapLeft(bounds: number[], offset: number): number {
  return [...bounds].reverse().find((b) => b < offset) ?? 0;
}

/** offsetが境界上になければ最寄りの境界へ吸着させる（挿入・削除直後の中途位置対策） */
export function clampToBoundary(tree: Row, cursor: CursorPath): CursorPath {
  const row = getRowAt(tree, cursor.steps);
  const bounds = rowBoundaries(row);
  if (bounds.includes(cursor.offset)) return cursor;
  return { steps: cursor.steps, offset: snapLeft(bounds, cursor.offset) };
}

export function moveRight(tree: Row, cursor: CursorPath): CursorPath {
  const row = getRowAt(tree, cursor.steps);
  const bounds = rowBoundaries(row);
  const { offset } = cursor;
  // 境界外の位置なら方向側の最寄り境界へ吸着（既存仕様の踏襲）
  if (!bounds.includes(offset)) {
    return { steps: cursor.steps, offset: snapRight(bounds, offset, row.length) };
  }
  const node = row[offset];
  // 直後がコンテナなら最初のスロットへ入る
  if (node && isContainer(node)) {
    return { steps: [...cursor.steps, { nodeIndex: offset, slot: slotsOf(node)[0] }], offset: 0 };
  }
  if (offset < row.length) {
    return { steps: cursor.steps, offset: snapRight(bounds, offset, row.length) };
  }
  // Rowの末尾: 次のスロットへ進むか、ノードの右隣へ出る
  if (cursor.steps.length === 0) return cursor;
  const steps = cursor.steps.slice(0, -1);
  const last = cursor.steps[cursor.steps.length - 1];
  const parentRow = getRowAt(tree, steps);
  const parentNode = parentRow[last.nodeIndex];
  const slots = slotsOf(parentNode);
  const si = slots.indexOf(last.slot);
  if (si < slots.length - 1) {
    return { steps: [...steps, { nodeIndex: last.nodeIndex, slot: slots[si + 1] }], offset: 0 };
  }
  return { steps, offset: last.nodeIndex + 1 };
}

export function moveLeft(tree: Row, cursor: CursorPath): CursorPath {
  const row = getRowAt(tree, cursor.steps);
  const bounds = rowBoundaries(row);
  const { offset } = cursor;
  if (!bounds.includes(offset)) {
    return { steps: cursor.steps, offset: snapLeft(bounds, offset) };
  }
  if (offset > 0) {
    const prev = row[offset - 1];
    // 直前がコンテナなら最後のスロットの末尾へ入る
    if (isContainer(prev)) {
      const slots = slotsOf(prev);
      const slot = slots[slots.length - 1];
      const slotRow = getSlot(prev, slot)!;
      return { steps: [...cursor.steps, { nodeIndex: offset - 1, slot }], offset: slotRow.length };
    }
    return { steps: cursor.steps, offset: snapLeft(bounds, offset) };
  }
  // Rowの先頭: 前のスロットへ戻るか、ノードの左隣へ出る
  if (cursor.steps.length === 0) return cursor;
  const steps = cursor.steps.slice(0, -1);
  const last = cursor.steps[cursor.steps.length - 1];
  const parentRow = getRowAt(tree, steps);
  const parentNode = parentRow[last.nodeIndex];
  const slots = slotsOf(parentNode);
  const si = slots.indexOf(last.slot);
  if (si > 0) {
    const prevSlot = slots[si - 1];
    const prevRow = getSlot(parentNode, prevSlot)!;
    return { steps: [...steps, { nodeIndex: last.nodeIndex, slot: prevSlot }], offset: prevRow.length };
  }
  return { steps, offset: last.nodeIndex };
}

/**
 * 分数の分子⇄分母を上下移動する。カーソルパスの深い側から最も近い分数の
 * num/denステップを探して切り替える。該当がなければ何もしない。
 */
export function moveVertical(tree: Row, cursor: CursorPath, dir: "up" | "down"): CursorPath {
  for (let d = cursor.steps.length - 1; d >= 0; d--) {
    const step = cursor.steps[d];
    const parentRow = getRowAt(tree, cursor.steps.slice(0, d));
    const node = parentRow[step.nodeIndex];
    if (node.kind !== "frac") continue;
    const target = dir === "down" && step.slot === "num" ? "den" : dir === "up" && step.slot === "den" ? "num" : null;
    if (!target) continue;
    const steps = [...cursor.steps.slice(0, d), { nodeIndex: step.nodeIndex, slot: target } as const];
    const targetRow = getRowAt(tree, steps);
    const bounds = rowBoundaries(targetRow);
    // 深い位置から上下移動したときはoffsetが横位置の目安にならないため、範囲内に丸めて境界へ吸着
    const capped = Math.min(cursor.offset, targetRow.length);
    const offset = bounds.includes(capped) ? capped : snapLeft(bounds, capped);
    return { steps, offset };
  }
  return cursor;
}
