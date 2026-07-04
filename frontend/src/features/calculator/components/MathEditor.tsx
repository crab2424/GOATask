// 編集ツリーのレンダラ。分数は縦組み、√はradicand幅に追従するoverline、指数は上付きで
// 描画し、カーソル（CursorPath）の位置に点滅バーを差し込む。
// cursorを渡さなければ読み取り専用の組版表示として使える（結果・履歴用）。
// charの並びはmathTypographyの共有フォーマッタで整える（sin⁻¹・×・−など）。
// カーソルはトークン境界にしか止まらないため、charの並びをカーソル位置で分割しても
// asin のような複数文字トークンが途中で割れることはない（従来の分割描画と同じ性質）。
//
// 「(」「)」は編集ツリー上はただのcharのままだが（backspace・カーソル移動の挙動は
// 変えない、という2026-07-04の方針）、表示だけは√と同じSVGの伸縮ブラケットで包む。
// 対応する閉じ括弧を行内で探し、中に分数など縦に大きい要素が挟まっていても
// 高さに追従する（表示専用の変換で、編集ツリーそのものは触らない）。
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

/** 行内でindex位置の"("に対応する")"の行内インデックスを探す。containerノードは括弧の対応に数えない */
function findMatchingParen(row: Row, openIndex: number): number {
  let depth = 0;
  for (let k = openIndex; k < row.length; k++) {
    const node = row[k];
    if (node.kind !== "char") continue;
    if (node.ch === "(") depth++;
    else if (node.ch === ")") {
      depth--;
      if (depth === 0) return k;
    }
  }
  return -1;
}

export function MathEditor({ tree, cursor, onCursorChange, className = "" }: MathEditorProps) {
  const editable = cursor != null;

  const placeCursor = (steps: CursorStep[], offset: number) => (e: MouseEvent) => {
    if (!editable || !onCursorChange) return;
    e.stopPropagation();
    onCursorChange({ steps, offset });
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
        // √記号を固定サイズの文字グリフではなくSVGで描く。items-stretch＋self-stretchで
        // 兄弟要素（radicand）の高さに追従させ、preserveAspectRatio="none"で非一様スケールを
        // 許すことで、中に分数などタテに大きくなる要素が入ってもチェック部分が上端まで伸びる。
        // 横方向はradicandの内容量にborder-topが自動追従するため、幅は固定の細い比率で足りる。
        return (
          <span key={node.id} className="inline-flex items-stretch align-middle">
            <svg viewBox="0 0 20 54" preserveAspectRatio="none" className="w-[0.6em] shrink-0 self-stretch">
              <path
                d="M0 32 L4 32 L8 50 L14 2 L20 2"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <span className="border-t-2 border-current pl-0.5 pt-0.5 leading-tight">
              {renderRow(node.radicand, stepTo("radicand"))}
            </span>
          </span>
        );
      case "sup":
        return (
          <sup key={node.id} className="text-[0.65em]">
            {renderRow(node.exponent, stepTo("exponent"))}
          </sup>
        );
      case "abs":
        // |x| の縦棒。border-leftを内容の高さに追従させるだけで済むため、√や括弧と違い
        // SVGは不要（曲線を持たない直線なのでborderで十分きれいに伸びる）。
        return (
          <span key={node.id} className="mx-0.5 inline-flex items-stretch align-middle">
            <span className="w-0 self-stretch border-l-2 border-current" />
            <span className="px-0.5 leading-tight">{renderRow(node.inner, stepTo("inner"))}</span>
            <span className="w-0 self-stretch border-l-2 border-current" />
          </span>
        );
    }
  };

  /** 括弧SVG。√と同じくself-stretchで兄弟要素の高さに追従する（表示専用、charは触らない） */
  const Bracket = ({ side }: { side: "left" | "right" }) => (
    <svg viewBox="0 0 20 54" preserveAspectRatio="none" className="w-[0.45em] shrink-0 self-stretch">
      <path
        d={side === "left" ? "M14 2 C 4 12, 4 42, 14 52" : "M6 2 C 16 12, 16 42, 6 52"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );

  // rowの[start, end)範囲を描画する。対応する"(" ")"のペアを見つけたら伸縮ブラケットで
  // 包み、中身は同じ範囲内の絶対インデックスのまま再帰的に描画する（カーソルのoffsetは
  // スロット内で通し番号なので、部分範囲を切り出しても添字はそのまま使える）。
  const renderSpan = (row: Row, start: number, end: number, steps: CursorStep[], caretAt: number): ReactNode[] => {
    const out: ReactNode[] = [];
    let i = start;
    while (i < end) {
      const node = row[i];
      if (node.kind === "char" && node.ch === "(") {
        const close = findMatchingParen(row, i);
        if (close !== -1 && close < end) {
          if (caretAt === i) out.push(<Caret key={`c${i}`} />);
          out.push(
            <span key={`b${i}`} className="mx-px inline-flex items-stretch align-middle">
              <Bracket side="left" />
              <span className="leading-tight">{renderSpan(row, i + 1, close, steps, caretAt)}</span>
              <Bracket side="right" />
            </span>,
          );
          i = close + 1;
          continue;
        }
      }
      if (node.kind !== "char") {
        if (caretAt === i) out.push(<Caret key={`c${i}`} />);
        out.push(renderContainer(node, i, steps));
        i++;
        continue;
      }
      // 連続するcharはまとめて共有フォーマッタで組版する（対応する閉じ括弧を持つ"("で区切る）
      let j = i;
      let text = "";
      while (j < end && row[j].kind === "char") {
        const ch = (row[j] as CharNode).ch;
        if (ch === "(" && findMatchingParen(row, j) !== -1 && findMatchingParen(row, j) < end) break;
        text += ch;
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
    if (caretAt === end) out.push(<Caret key={`c${end}`} />);
    return out;
  };

  const renderRow = (row: Row, steps: CursorStep[]): ReactNode => {
    const caretAt = editable && cursor && sameSteps(cursor.steps, steps) ? cursor.offset : -1;
    if (row.length === 0) {
      // 空のスロット: カーソルがあればカーソルのみ、編集中なら点線のプレースホルダ、
      // 読み取り専用（結果・履歴）では何も表示しない
      if (caretAt === 0) return <Caret />;
      if (!editable) return null;
      return (
        <span
          className="inline-block h-[1em] w-3 rounded-sm border border-dashed border-slate-300 align-middle"
          onClick={placeCursor(steps, 0)}
        />
      );
    }
    return renderSpan(row, 0, row.length, steps, caretAt);
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
