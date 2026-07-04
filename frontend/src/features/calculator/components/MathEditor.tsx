// 編集ツリーのレンダラ。分数は縦組み、√はradicand幅に追従するoverline、指数は上付きで
// 描画し、カーソル（CursorPath）の位置に点滅バーを差し込む。
// cursorを渡さなければ読み取り専用の組版表示として使える（結果・履歴用）。
// charの並びはmathTypographyの共有フォーマッタで整える（sin⁻¹・×・−など）。
// カーソルはトークン境界にしか止まらないため、charの並びをカーソル位置で分割しても
// asin のような複数文字トークンが途中で割れることはない（従来の分割描画と同じ性質）。
import type { MouseEvent, ReactNode } from "react";
import {
  type CharNode,
  type CursorPath,
  type CursorStep,
  type Row,
  type SlotName,
  sameSteps,
} from "../engine/editTree";
import { renderLinearParts } from "./mathTypography";

interface MathEditorProps {
  tree: Row;
  /** 編集モードのカーソル。省略すると読み取り専用表示 */
  cursor?: CursorPath | null;
  /** タップでカーソルを置けるようにする（編集モードのみ） */
  onCursorChange?: (cursor: CursorPath) => void;
  className?: string;
}

function Caret() {
  return <span className="mx-px inline-block h-[1.1em] w-0.5 animate-pulse rounded bg-slate-900 align-middle" />;
}

export function MathEditor({ tree, cursor, onCursorChange, className = "" }: MathEditorProps) {
  const editable = cursor != null;

  const placeCursor = (steps: CursorStep[], offset: number) => (e: MouseEvent) => {
    if (!editable || !onCursorChange) return;
    e.stopPropagation();
    onCursorChange({ steps, offset });
  };

  const renderRow = (row: Row, steps: CursorStep[]): ReactNode => {
    const caretAt = editable && cursor && sameSteps(cursor.steps, steps) ? cursor.offset : -1;
    if (row.length === 0) {
      // 空のスロット: カーソルがあればカーソルのみ、なければ点線のプレースホルダ
      if (caretAt === 0) return <Caret />;
      return (
        <span
          className="inline-block h-[1em] w-3 rounded-sm border border-dashed border-slate-300 align-middle"
          onClick={placeCursor(steps, 0)}
        />
      );
    }
    const out: ReactNode[] = [];
    let i = 0;
    while (i < row.length) {
      const node = row[i];
      if (node.kind !== "char") {
        if (caretAt === i) out.push(<Caret key={`c${i}`} />);
        out.push(renderContainer(node, i, steps));
        i++;
        continue;
      }
      // 連続するcharはまとめて共有フォーマッタで組版する
      let j = i;
      let text = "";
      while (j < row.length && row[j].kind === "char") {
        text += (row[j] as CharNode).ch;
        j++;
      }
      if (caretAt > i && caretAt < j) {
        out.push(
          <span key={`t${i}`} onClick={placeCursor(steps, caretAt)}>
            {renderLinearParts(text.slice(0, caretAt - i), `t${i}`)}
          </span>,
        );
        out.push(<Caret key={`c${caretAt}`} />);
        out.push(
          <span key={`t${caretAt}`} onClick={placeCursor(steps, j)}>
            {renderLinearParts(text.slice(caretAt - i), `t${caretAt}`)}
          </span>,
        );
      } else {
        if (caretAt === i) out.push(<Caret key={`c${i}`} />);
        out.push(
          <span key={`t${i}`} onClick={placeCursor(steps, j)}>
            {renderLinearParts(text, `t${i}`)}
          </span>,
        );
      }
      i = j;
    }
    if (caretAt === row.length) out.push(<Caret key="c-end" />);
    return out;
  };

  const renderContainer = (node: Exclude<Row[number], CharNode>, index: number, steps: CursorStep[]): ReactNode => {
    const stepTo = (slot: SlotName): CursorStep[] => [...steps, { nodeIndex: index, slot }];
    switch (node.kind) {
      case "frac":
        return (
          <span key={node.id} className="mx-0.5 inline-flex flex-col items-center text-center align-middle">
            <span className="border-b border-current px-1 leading-tight">{renderRow(node.num, stepTo("num"))}</span>
            <span className="px-1 leading-tight">{renderRow(node.den, stepTo("den"))}</span>
          </span>
        );
      case "sqrt":
        return (
          <span key={node.id} className="inline-flex items-start align-middle">
            <span className="text-[1.15em] leading-none">√</span>
            <span className="border-t border-current px-0.5 leading-tight">{renderRow(node.radicand, stepTo("radicand"))}</span>
          </span>
        );
      case "sup":
        return (
          <sup key={node.id} className="text-[0.65em]">
            {renderRow(node.exponent, stepTo("exponent"))}
          </sup>
        );
    }
  };

  return (
    <span
      className={`tabular-nums ${className}`}
      onClick={editable && onCursorChange ? placeCursor([], tree.length) : undefined}
    >
      {renderRow(tree, [])}
    </span>
  );
}
