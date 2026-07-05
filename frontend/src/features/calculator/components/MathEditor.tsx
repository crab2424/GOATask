// 編集ツリーのレンダラ。ネイティブMathML（mfrac/msqrt/mo stretchy）で組版する。
// 分数はmfrac、√はmsqrtが内容の高さに自動追従し、絶対値・括弧はmoのstretchy属性で
// 縦棒・括弧を内容の高さまで伸ばす。以前はSVGで手動計算していた伸縮をブラウザの
// MathMLレイアウトエンジンに任せられるため、その分のコードは持たない。
// cursorを渡さなければ読み取り専用の組版表示として使える（結果・履歴用）。
// charの並びはmathTypographyの共有フォーマッタでmn/mi/moへ変換する。
// カーソルはトークン境界にしか止まらないため、charの並びをカーソル位置で分割しても
// asin のような複数文字トークンが途中で割れることはない（従来の分割描画と同じ性質）。
//
// 「(」「)」は編集ツリー上はただのcharのままだが（backspace・カーソル移動の挙動は
// 変えない、という2026-07-04の方針）、表示だけは絶対値と同じmo stretchyで包む。
// 対応する閉じ括弧を行内で探し、中に分数など縦に大きい要素が挟まっていても
// 高さに追従する（表示専用の変換で、編集ツリーそのものは触らない）。
//
// xʸの指数（sup）は「基数」を編集ツリー上で持たないため、幅0のmspaceを基数にした
// msupとして現在位置に上付き表示する。
//
// カーソルの点滅バーは、組版ツリーの中に直接HTML装飾要素を差し込むのではなく、
// 幅0のマーカー（CaretMarker、実体はmspace）をツリー内の正しい位置に置き、その
// DOM座標をmeasureして絶対配置のオーバーレイとして重ねる。
import {
  cloneElement,
  forwardRef,
  isValidElement,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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

// 空スロットの枠・√の高さ確保・カーソルの高さ、3箇所がそれぞれ別の値を使っていると
// 入力のたびに見た目のサイズがズレて見えるため、同じ「数字1行分」の基準を共有する。
const LINE_ASCENT_EM = 1;
const LINE_DESCENT_EM = 0;

/** カーソル位置を測るための幅0マーカー。見た目は持たず、座標だけを提供する */
const CaretMarker = forwardRef<MathMLElement>((_props, ref) => (
  <mspace ref={ref} width="0" height="0" depth="0" />
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
    const fontSize = Number.parseFloat(window.getComputedStyle(markerRef.current).fontSize);
    const caretHeight = fontSize * (LINE_ASCENT_EM + LINE_DESCENT_EM);
    const next: CaretRect = {
      left: markerBox.left - containerBox.left,
      // 高さ0のマーカーはベースライン上にある。空スロットの枠・√の高さ確保と同じ
      // LINE_ASCENT_EM/LINE_DESCENT_EMでHTMLカーソルを描き、mspace自体はMathMLの
      // 組版寸法へ影響させない。
      top: markerBox.top - containerBox.top - fontSize * LINE_ASCENT_EM,
      height: caretHeight,
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

  // カーソル前後を別mrowで包むとmoの前置・中置・後置判定が変わるため、各atomを
  // 同じmrowの兄弟として返す。クリック位置の指定は各atomへ直接付与する。
  const renderClickableParts = (text: string, keyPrefix: string, onClick: (e: MouseEvent) => void): ReactNode[] =>
    renderLinearParts(text, keyPrefix).map((part) =>
      isValidElement(part)
        ? cloneElement(part as ReactElement<{ onClick?: (e: MouseEvent) => void }>, { onClick })
        : part,
    );

  const renderContainer = (node: Exclude<Row[number], CharNode>, index: number, steps: CursorStep[]): ReactNode => {
    const stepTo = (slot: SlotName): CursorStep[] => [...steps, { nodeIndex: index, slot }];
    switch (node.kind) {
      case "frac":
        return (
          // inline MathMLのmfracは既定で分子・分母をscriptstyleへ縮小する。
          // displaystyleにすることで、通常の数字と同じtextstyleで組版する。
          <mstyle key={node.id} displaystyle="true" scriptlevel="0">
            <mfrac>
              {/* 分子・分母をmpaddedで左右に少し広げ、横棒を中身より長く出す
                  （連分数を入れ子にしたときに段の区切りが分かるように）。 */}
              <mpadded width="+0.3em" lspace="0.15em">
                <mrow>{renderRow(node.num, stepTo("num"))}</mrow>
              </mpadded>
              <mpadded width="+0.3em" lspace="0.15em">
                <mrow>{renderRow(node.den, stepTo("den"))}</mrow>
              </mpadded>
            </mfrac>
          </mstyle>
        );
      case "sqrt":
        return (
          <msqrt key={node.id}>
            <mrow>
              {/* 中身が空/浅い数字だけのときに√の高さが変わって見えないよう、
                  空スロットのプレースホルダ・カーソルと同じ高さ・深さを幅0で常に確保する。 */}
              <mspace width="0" height={`${LINE_ASCENT_EM}em`} depth={`${LINE_DESCENT_EM}em`} />
              {renderRow(node.radicand, stepTo("radicand"))}
            </mrow>
          </msqrt>
        );
      case "sup":
        return (
          <msup key={node.id}>
            <mspace width="0" />
            <mrow>{renderRow(node.exponent, stepTo("exponent"))}</mrow>
          </msup>
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
        out.push(...renderClickableParts(text.slice(0, caretAt - i), `t${i}`, placeCursor(steps, caretAt)));
        out.push(<CaretMarker ref={markerRef} key={`c${caretAt}`} />);
        out.push(...renderClickableParts(text.slice(caretAt - i), `t${caretAt}`, placeCursor(steps, j)));
      } else {
        if (caretAt === i) out.push(<CaretMarker ref={markerRef} key={`c${i}`} />);
        out.push(...renderClickableParts(text, `t${i}`, placeCursor(steps, j)));
      }
      i = j;
    }
    if (caretAt === end) out.push(<CaretMarker ref={markerRef} key={`c${end}`} />);
    return out;
  };

  const caretKey = cursor
    ? `${cursor.steps.map((step) => `${step.nodeIndex}:${step.slot}`).join("/")}:${cursor.offset}`
    : "none";

  const renderRow = (row: Row, steps: CursorStep[]): ReactNode => {
    const caretAt = editable && cursor && sameSteps(cursor.steps, steps) ? cursor.offset : -1;
    if (row.length === 0) {
      // 空のスロット: カーソルがあればカーソルのみ、編集中なら点線のプレースホルダ、
      // 読み取り専用（結果・履歴）では何も表示しない
      if (!editable) return null;
      const placeholder = (
        <mspace
          width="0.75em"
          height={`${LINE_ASCENT_EM}em`}
          depth={`${LINE_DESCENT_EM}em`}
          style={{ outline: "1px dashed rgb(203 213 225)", borderRadius: "2px" }}
          onClick={placeCursor(steps, 0)}
        />
      );
      // フォーカス中も空スロットの大きさを保ち、先頭にカーソルを重ねる。
      if (caretAt === 0) {
        return (
          <mrow>
            <CaretMarker ref={markerRef} />
            {placeholder}
          </mrow>
        );
      }
      return (
        placeholder
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
      <math className="math-editor-expression">
        <mrow>{renderRow(tree, [])}</mrow>
      </math>
      {caretRect && (
        <span
          key={caretKey}
          aria-hidden
          className="math-editor-caret absolute w-0.5 rounded bg-slate-900"
          style={{ left: caretRect.left - 1, top: caretRect.top, height: caretRect.height }}
        />
      )}
    </span>
  );
}
