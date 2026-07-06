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

const LAYOUT_BASIC: VirtualKeyboardLayout = {
  id: "goatask-basic",
  label: "基本",
  tooltip: "数字と基本操作",
  rows: [
    [
      { latex: "(", variants: [")", "()"], shift:")", width: W },
      { latex: ">", variants: ["<", "≥", "≤"], shift:"<", width: W },
      { latex: "7", width: W }, { latex: "8", width: W }, { latex: "9", width: W }, { latex: "\\div", width: W }
    ],
    [
      { latex: "\\frac{#0}{#?}", width: W },
      // 試験導入: \encloseで√の中身を破線ボーダーの箱として描画する（Photomath風の空白枠線）。
      // labelは通常の√表記のまま、挿入時だけ中身をenclose{roundedbox}で包む。
      { latex: "\\sqrt{#0}", insert: "\\sqrt{\\enclose{roundedbox}[1px dashed #999]{#0}}", width: W },
      { latex: "4", width: W }, { latex: "5", width: W }, { latex: "6", width: W }, { latex: "\\times", width: W }
    ],
    [
      { label: "{#0}<sup>2</sup>", insert: "^2", width: W },
      { label: "x", variants:["y", "z"], shift: "y", width: W },
      { latex: "1", width: W }, { latex: "2", width: W }, { latex: "3", width: W }, { latex: "-", width: W }],
    [
      { latex: "\\pi", width: W }, { latex: "%", width: W }, { latex: "0", width: W },
      { latex: ".", width: W }, { latex: "=", width: W }, { latex: "+", width: W },
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
      { label: "e<sup>x</sup>", insert: "\\exp(", width: W },
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
      { latex: "(", width: W },
      { latex: ")", width: W },
    ],
    [
      { latex: "\\sinh^{-1}", insert: "\\operatorname{asinh}(", class: "small", width: W },
      { latex: "\\cosh^{-1}", insert: "\\operatorname{acosh}(", class: "small", width: W },
      { latex: "\\tanh^{-1}", insert: "\\operatorname{atanh}(", class: "small", width: W },
      { label: ",", insert: ",", width: W },
      { latex: "i", width: W },
      { label: "|a|", insert: "\\left|#0\\right|", width: W },
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
      { label: "∫", insert: "\\int #0\\, d#?", width: W },
      { latex: "\\frac{d}{dx}", insert: "\\frac{d}{dx} #0", class: "small", width: W },
      { label: "lim", insert: "\\lim_{#?\\to #?} #0", width: W },
      { label: "Σ", insert: "\\sum_{#?=#?}^{#?} #0", width: W },
      { label: "Π", insert: "\\prod_{#?=#?}^{#?} #0", width: W },
      { label: "f'", insert: "'", width: W },
    ],
    [
      { latex: "=", width: W },
      // \begin{cases}は行数に応じて左中括弧が自動伸縮する。+行はcases内でのみ機能する
      // MathLive組み込みコマンド（範囲外では無害に無視される）。
      { label: "連立", insert: "\\begin{cases}#0\\\\#?\\end{cases}", class: "small", width: W },
      { label: "+行", command: "addRowAfter", class: "small", width: W },
      { label: "dx", insert: "dx", width: W },
      { latex: "\\infty", width: W },
      { latex: "x", width: W },
    ],
    [
      { latex: "<", width: W }, { latex: ">", width: W }, { latex: "\\le", width: W },
      { latex: "\\ge", width: W }, { latex: "\\ne", width: W }, { label: ",", insert: ",", width: W },
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
