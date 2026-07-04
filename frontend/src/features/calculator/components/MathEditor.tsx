// 編集ツリーのレンダラ。ネイティブMathML（mfrac/msqrt/mo stretchy）で組版する。
// 分数はmfrac、√はmsqrtが内容の高さに自動追従し、絶対値・括弧はmoのstretchy属性で
// 縦棒・括弧を内容の高さまで伸ばす。以前はSVGで手動計算していた伸縮をブラウザの
// MathMLレイアウトエンジンに任せられるため、その分のコードは持たない。
// cursorを渡さなければ読み取り専用の組版表示として使える（結果・履歴用）。
// charの並びはmathTypographyの共有フォーマッタで整える（sin⁻¹・×・−など）。既存の
// フォーマッタが返すのは通常のHTML（span/sup）で、mrowの子としては非MathML要素だが、
// MathML Coreはmrow内の非MathML子要素を許容して描画する仕様なので変換していない
// （文字の見た目自体は今回の要望の対象外で、変換コストに見合わない）。
// カーソルはトークン境界にしか止まらないため、charの並びをカーソル位置で分割しても
// asin のような複数文字トークンが途中で割れることはない（従来の分割描画と同じ性質）。
//
// 「(」「)」は編集ツリー上はただのcharのままだが（backspace・カーソル移動の挙動は
// 変えない、という2026-07-04の方針）、表示だけは絶対値と同じmo stretchyで包む。
// 対応する閉じ括弧を行内で探し、中に分数など縦に大きい要素が挟まっていても
// 高さに追従する（表示専用の変換で、編集ツリーそのものは触らない）。
//
// xʸの指数（sup）だけは「基数」を編集ツリー上で持たない単項ノードのため、msup化
// せずHTMLの<sup>のままにしている（msupは基数・指数の2引数を要求するが、このASTは
// 直前のトークン列のどこまでを基数とみなすか一意に決められない）。
//
// カーソルの点滅バーは、組版ツリーの中に直接HTML装飾要素を差し込むのではなく、
// 幅0のマーカー（CaretMarker、実体はmspace）をツリー内の正しい位置に置き、その
// DOM座標をmeasureして絶対配置のオーバーレイとして重ねる。
import { forwardRef, type MouseEvent, type ReactNode, useLayoutEffect, useRef, useState } from "react";
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

interface CaretRect {
  left: number;
  top: number;
  height: number;
}

// MathML CoreのUAスタイルシートは<math>配下の非MathML要素（span/sup）に
// display:block mathを強制する。Safariではクラスセレクタでの上書き（math span{...}）
// が効かなかったため、インラインstyle（詳細度で確実に勝つ）で明示的に上書きする。
const INLINE_STYLE = { display: "inline" } as const;

/** カーソル位置を測るための幅0マーカー。見た目は持たず、座標だけを提供する */
const CaretMarker = forwardRef<MathMLElement>((_props, ref) => (
  <mspace ref={ref} width="0" height="0.6em" depth="0.5em" />
));
CaretMarker.displayName = "CaretMarker";

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
  const containerRef = useRef<HTMLSpanElement>(null);
  const markerRef = useRef<MathMLElement>(null);
  const [caretRect, setCaretRect] = useState<CaretRect | null>(null);

  // 描画のたびにマーカーの実座標を測ってオーバーレイの位置を更新する。
  // 値が変わっていなければ同じstateオブジェクトを返してReactの再レンダーを打ち切る
  // （そうしないとsetState→再レンダー→effect再実行が無限ループする）。
  useLayoutEffect(() => {
    if (!editable || !markerRef.current || !containerRef.current) {
      setCaretRect((prev) => (prev === null ? prev : null));
      return;
    }
    const markerBox = markerRef.current.getBoundingClientRect();
    const containerBox = containerRef.current.getBoundingClientRect();
    const next: CaretRect = {
      left: markerBox.left - containerBox.left,
      top: markerBox.top - containerBox.top,
      height: markerBox.height,
    };
    setCaretRect((prev) =>
      prev && prev.left === next.left && prev.top === next.top && prev.height === next.height ? prev : next,
    );
  }, [tree, cursor, editable]);

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
          <mfrac key={node.id}>
            <mrow>{renderRow(node.num, stepTo("num"))}</mrow>
            <mrow>{renderRow(node.den, stepTo("den"))}</mrow>
          </mfrac>
        );
      case "sqrt":
        return (
          <msqrt key={node.id}>
            <mrow>{renderRow(node.radicand, stepTo("radicand"))}</mrow>
          </msqrt>
        );
      case "sup":
        return (
          <sup key={node.id} className="text-[0.65em]" style={INLINE_STYLE}>
            {renderRow(node.exponent, stepTo("exponent"))}
          </sup>
        );
      case "abs":
        return (
          <mrow key={node.id}>
            <mo stretchy="true">|</mo>
            <mrow>{renderRow(node.inner, stepTo("inner"))}</mrow>
            <mo stretchy="true">|</mo>
          </mrow>
        );
    }
  };

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
          if (caretAt === i) out.push(<CaretMarker ref={markerRef} key={`c${i}`} />);
          out.push(
            <mrow key={`b${i}`}>
              <mo stretchy="true">(</mo>
              <mrow>{renderSpan(row, i + 1, close, steps, caretAt)}</mrow>
              <mo stretchy="true">)</mo>
            </mrow>,
          );
          i = close + 1;
          continue;
        }
      }
      if (node.kind !== "char") {
        if (caretAt === i) out.push(<CaretMarker ref={markerRef} key={`c${i}`} />);
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
          <span key={`t${i}`} style={INLINE_STYLE} onClick={placeCursor(steps, caretAt)}>
            {renderLinearParts(text.slice(0, caretAt - i), `t${i}`)}
          </span>,
        );
        out.push(<CaretMarker ref={markerRef} key={`c${caretAt}`} />);
        out.push(
          <span key={`t${caretAt}`} style={INLINE_STYLE} onClick={placeCursor(steps, j)}>
            {renderLinearParts(text.slice(caretAt - i), `t${caretAt}`)}
          </span>,
        );
      } else {
        if (caretAt === i) out.push(<CaretMarker ref={markerRef} key={`c${i}`} />);
        out.push(
          <span key={`t${i}`} style={INLINE_STYLE} onClick={placeCursor(steps, j)}>
            {renderLinearParts(text, `t${i}`)}
          </span>,
        );
      }
      i = j;
    }
    if (caretAt === end) out.push(<CaretMarker ref={markerRef} key={`c${end}`} />);
    return out;
  };

  const renderRow = (row: Row, steps: CursorStep[]): ReactNode => {
    const caretAt = editable && cursor && sameSteps(cursor.steps, steps) ? cursor.offset : -1;
    if (row.length === 0) {
      // 空のスロット: カーソルがあればカーソルのみ、編集中なら点線のプレースホルダ、
      // 読み取り専用（結果・履歴）では何も表示しない
      if (caretAt === 0) return <CaretMarker ref={markerRef} />;
      if (!editable) return null;
      return (
        <span
          className="inline-block h-[1em] w-3 rounded-sm border border-dashed border-slate-300 align-middle"
          style={{ display: "inline-block" }}
          onClick={placeCursor(steps, 0)}
        />
      );
    }
    return renderSpan(row, 0, row.length, steps, caretAt);
  };

  return (
    <span
      ref={containerRef}
      className={`relative tabular-nums align-middle ${className}`}
      onClick={editable && onCursorChange ? placeCursor([], tree.length) : undefined}
    >
      <math>
        <mrow>{renderRow(tree, [])}</mrow>
      </math>
      {caretRect && (
        <span
          aria-hidden
          className="absolute w-0.5 animate-pulse rounded bg-slate-900"
          style={{ left: caretRect.left - 1, top: caretRect.top, height: caretRect.height }}
        />
      )}
    </span>
  );
}
