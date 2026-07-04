// キー操作→編集ツリー変換。既存のinsertText/backspaceの後継。
// 全て (tree, cursor) → { tree, cursor } の純関数で、UIには依存しない。
//
// 仕様（2026-07-04ユーザー確定）:
// - 分数キーは空のfracを挿入して分子にカーソル（直前の数字の引き込みはしない）
// - ^キー（xʸ・物理キーボードの^とも）は常にsupノードを挿入して指数スロットにカーソル
// - backspaceはMathQuill方式: 中身のあるノードの直後では「入って末尾へ」、
//   全スロットが空のノードは丸ごと削除、スロット先頭では前のスロット末尾または
//   ノードの左隣へ移動（削除はしない）
import {
  type CursorPath,
  type EditNode,
  type Row,
  type SlotName,
  charNodes,
  fracNode,
  getRowAt,
  getSlot,
  isContainer,
  nodeIsEmpty,
  rootCursor,
  slotsOf,
  sqrtNode,
  supNode,
  updateRowAt,
} from "./editTree";

export interface EditState {
  tree: Row;
  cursor: CursorPath;
}

export function emptyState(): EditState {
  return { tree: [], cursor: rootCursor() };
}

/** カーソル位置に文字列を1文字ずつcharノードとして挿入する（sin( のような複数文字もそのまま） */
export function insertChars(state: EditState, text: string): EditState {
  const { tree, cursor } = state;
  const nodes = charNodes(text);
  const newTree = updateRowAt(tree, cursor.steps, (row) => [
    ...row.slice(0, cursor.offset),
    ...nodes,
    ...row.slice(cursor.offset),
  ]);
  return { tree: newTree, cursor: { steps: cursor.steps, offset: cursor.offset + nodes.length } };
}

function insertContainer(state: EditState, node: EditNode, focusSlot: SlotName): EditState {
  const { tree, cursor } = state;
  const newTree = updateRowAt(tree, cursor.steps, (row) => [
    ...row.slice(0, cursor.offset),
    node,
    ...row.slice(cursor.offset),
  ]);
  return {
    tree: newTree,
    cursor: { steps: [...cursor.steps, { nodeIndex: cursor.offset, slot: focusSlot }], offset: 0 },
  };
}

/** 空の分数を挿入して分子にカーソルを置く。√の中で押せば √(分数) が自然に組める */
export function insertFraction(state: EditState): EditState {
  return insertContainer(state, fracNode(), "num");
}

export function insertSqrt(state: EditState): EditState {
  return insertContainer(state, sqrtNode(), "radicand");
}

export function insertSup(state: EditState): EditState {
  return insertContainer(state, supNode(), "exponent");
}

export function backspace(state: EditState): EditState {
  const { tree, cursor } = state;
  const row = getRowAt(tree, cursor.steps);
  if (cursor.offset > 0) {
    const prev = row[cursor.offset - 1];
    if (isContainer(prev) && !nodeIsEmpty(prev)) {
      // 中身のあるノードは消さず、最後のスロットの末尾へ入る（MathQuill方式）
      const slots = slotsOf(prev);
      const slot = slots[slots.length - 1];
      const slotRow = getSlot(prev, slot)!;
      return {
        tree,
        cursor: { steps: [...cursor.steps, { nodeIndex: cursor.offset - 1, slot }], offset: slotRow.length },
      };
    }
    // charは1文字削除（従来仕様）、空のコンテナはノードごと削除
    const newTree = updateRowAt(tree, cursor.steps, (r) => [
      ...r.slice(0, cursor.offset - 1),
      ...r.slice(cursor.offset),
    ]);
    return { tree: newTree, cursor: { steps: cursor.steps, offset: cursor.offset - 1 } };
  }
  // スロットの先頭: 削除はせずカーソルだけ移動する
  if (cursor.steps.length === 0) return state;
  const steps = cursor.steps.slice(0, -1);
  const last = cursor.steps[cursor.steps.length - 1];
  const parentRow = getRowAt(tree, steps);
  const parentNode = parentRow[last.nodeIndex];
  const slots = slotsOf(parentNode);
  const si = slots.indexOf(last.slot);
  if (si > 0) {
    const prevSlot = slots[si - 1];
    const prevRow = getSlot(parentNode, prevSlot)!;
    return { tree, cursor: { steps: [...steps, { nodeIndex: last.nodeIndex, slot: prevSlot }], offset: prevRow.length } };
  }
  return { tree, cursor: { steps, offset: last.nodeIndex } };
}
