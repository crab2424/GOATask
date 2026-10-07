// MathLive純正仮想キーボードのGOATask向けレイアウト定義。
// 方針: キーボードの筐体・スタイル・折りたたみ・長押し・Undo等の操作系はMathLive純正の
// ものをそのまま使い、タブ構成とキー配列だけをここで差し替える（自前スタイルは当てない）。
// `window.mathVirtualKeyboard.layouts` にこの配列を代入して適用する（CalculatorView参照）。
//
// キーキャップの书き方（MathLive公式仕様）:
// - 文字列はLaTeXスニペット扱い（ラベルもそのLaTeXで組版される）。#0は挿入直後の
//   カーソル位置、#?は空スロットプレースホルダ（自前キーパッドのinsert()と同じ意味）。
// - "[left]" "[backspace]" "[return]" 等は組み込みキーの省略記法。[return]はcommit
//   （changeイベント→CalculatorViewのequals()）を発火する＝「答え」キー。
// - オブジェクト形式 {label, insert} はラベルと挿入内容を分けたいとき、
//   {label, command} はMathLive組み込みコマンド（例: addRowAfter）を呼ぶとき。
import type { VirtualKeyboardLayout, VirtualKeyboardName } from "mathlive";

// 挿入テンプレートは自前キーパッド（CalculatorViewのKEY_PAGES）と同一のものを使う。
// これらがCompute Engineで評価可能なことは9-A〜9-Cで検証済み。
// 標準キー幅の倍率。自前レイアウトは6列構成で、既定(1.0)のままだと組込み
// レイアウト(numeric等、9〜10列)と同じキー幅基準では横に余白が残ってしまう
// ため、6列 x 1.5 = 9単位相当まで広げてビューポート幅を使い切るようにする。
const W = 1.5;
// 基本タブは操作キー(⌫←→↩)を含めた7列。MathLiveのwidthは0.5/1/1.5/2/5のみ指定でき、
// 他タブと同じ合計幅9単位になるよう列ごとに [1, 1, 1.5, 1.5, 1.5, 1, 1.5] を割り当てる。
const C = [1, 1, 1.5, 1.5, 1.5, 1, 1.5] as const;

const LAYOUT_BASIC: VirtualKeyboardLayout = {
  id: "goatask-basic",
  label: "基本",
  tooltip: "数字と基本操作",
  // 4行・7列。操作キー(⌫←→↩)を右端の列に置き、重複する不等号は微積・方程式タブへ移した。
  rows: [
    [
      { latex: "(", width: C[0] }, { latex: ")", width: C[1] },
      { latex: "7", width: C[2] }, { latex: "8", width: C[3] }, { latex: "9", width: C[4] },
      { latex: "\\div", width: C[5] },
      { label: "[backspace]", width: C[6] },
    ],
    [
      // 分数はキー高さに収まるよう small（空スロットの四角がはみ出さない大きさ）にする。
      { latex: "\\frac{#0}{#?}", class: "small", width: C[0] },
      // 試験導入: \encloseで√の中身を破線ボーダーの箱として描画する（Photomath風の空白枠線）。
      { latex: "\\sqrt{#0}", insert: "\\sqrt{\\enclose{roundedbox}[1px dashed #999]{#0}}", width: C[1] },
      { latex: "4", width: C[2] }, { latex: "5", width: C[3] }, { latex: "6", width: C[4] },
      { latex: "\\times", width: C[5] },
      { label: "[left]", width: C[6] },
    ],
    [
      { latex: "#@^2", insert: "^2", width: C[0] },
      { latex: "x", variants: ["y", "z"], shift: "y", width: C[1] },
      { latex: "1", width: C[2] }, { latex: "2", width: C[3] }, { latex: "3", width: C[4] },
      { latex: "-", width: C[5] },
      { label: "[right]", width: C[6] },
    ],
    [
      { latex: "\\pi", width: C[0] }, { latex: "\\%", width: C[1] }, { latex: "0", width: C[2] },
      { latex: ".", width: C[3] }, { latex: "=", width: C[4] }, { latex: "+", width: C[5] },
      { label: "[return]", width: C[6] },
    ],
  ],
};

const LAYOUT_FUNCTIONS: VirtualKeyboardLayout = {
  id: "goatask-functions",
  label: "関数",
  tooltip: "三角関数・対数・組合せ",
  rows: [
    [
      { latex: "\\sin", insert: "\\sin(", width: W },
      { latex: "\\cos", insert: "\\cos(", width: W },
      { latex: "\\tan", insert: "\\tan(", width: W },
      { latex: "\\log", insert: "\\log(", width: W },
      { latex: "\\ln", insert: "\\ln(", width: W },
      { latex: "e^x", insert: "\\exp(", width: W },
    ],
    [
      { latex: "\\sin^{-1}", insert: "\\arcsin(", class: "small", width: W },
      { latex: "\\cos^{-1}", insert: "\\arccos(", class: "small", width: W },
      { latex: "\\tan^{-1}", insert: "\\arctan(", class: "small", width: W },
      { label: "nPr", insert: "\\operatorname{nPr}(", class: "small", width: W },
      { label: "nCr", insert: "\\operatorname{nCr}(", class: "small", width: W },
      { label: "nHr", insert: "\\operatorname{nHr}(", class: "small", width: W },
    ],
    [
      { latex: "\\sinh", insert: "\\sinh(", class: "small", width: W },
      { latex: "\\cosh", insert: "\\cosh(", class: "small", width: W },
      { latex: "\\tanh", insert: "\\tanh(", class: "small", width: W },
      { label: "nVr", insert: "\\operatorname{nVr}(", class: "small", width: W },
      { label: "!", insert: "!", width: W },
      { latex: "\\sqrt[n]{}", insert: "\\sqrt[#?]{#0}", class: "small", width: W },
    ],
    [
      { latex: "\\sinh^{-1}", insert: "\\operatorname{asinh}(", class: "small", width: W },
      { latex: "\\cosh^{-1}", insert: "\\operatorname{acosh}(", class: "small", width: W },
      { latex: "\\tanh^{-1}", insert: "\\operatorname{atanh}(", class: "small", width: W },
      { latex: ",", width: W },
      { latex: "i", width: W },
      { latex: "\\left|a\\right|", insert: "\\left|#0\\right|", width: W },
    ],
    ["[left]", "[right]", "[backspace]", "[return]"],
  ],
};

const LAYOUT_CALCULUS_EQ: VirtualKeyboardLayout = {
  id: "goatask-calculus-eq",
  label: "微積・方程式",
  tooltip: "微積分・方程式・比較演算子",
  rows: [
    [
      { latex: "\\int", insert: "\\int #0\\, d#?", width: W },
      { latex: "\\frac{d}{dx}", insert: "\\frac{d}{dx} #0", class: "small", width: W },
      { latex: "\\lim", insert: "\\lim_{#?\\to #?} #0", width: W },
      { latex: "\\sum", insert: "\\sum_{#?=#?}^{#?} #0", width: W },
      { latex: "\\prod", insert: "\\prod_{#?=#?}^{#?} #0", width: W },
      { latex: "f'", insert: "'", width: W },
    ],
    [
      { latex: "y", width: W },
      // \begin{cases}は行数に応じて左中括弧が自動伸縮する。+行はcases内でのみ機能する
      // MathLive組み込みコマンド（範囲外では無害に無視される）。
      { label: "連立", insert: "\\begin{cases}#0\\\\#?\\end{cases}", class: "small", width: W },
      { label: "+行", command: "addRowAfter", class: "small", width: W },
      { latex: "dx", insert: "dx", width: W },
      { latex: "\\infty", width: W },
      { latex: "t", width: W },
    ],
    [
      { latex: "<", width: W }, { latex: ">", width: W }, { latex: "\\le", width: W },
      { latex: "\\ge", width: W }, { latex: "\\ne", width: W }, { latex: "\\exponentialE", width: W },
    ],
    ["[left]", "[right]", "[backspace]", "[return]"],
  ],
};

// abc・ギリシャ文字はMathLive組み込みレイアウトをそのまま使う（shiftレイヤー・
// 長押しバリアント込みの純正配列。自前のabcページより表現力が高い）。
export const CALCULATOR_KEYBOARD_LAYOUTS: (VirtualKeyboardName | VirtualKeyboardLayout)[] = [
  LAYOUT_BASIC,
  LAYOUT_FUNCTIONS,
  LAYOUT_CALCULUS_EQ,
  "numeric",
  "symbols",
  "alphabetic",
  "greek",
];
