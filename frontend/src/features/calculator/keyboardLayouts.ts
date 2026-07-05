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
const LAYOUT_BASIC: VirtualKeyboardLayout = {
  id: "goatask-basic",
  label: "基本",
  tooltip: "数字と基本操作",
  rows: [
    [
      { latex: "(", variants: [")", "()"], shift:")" },
      { latex: ">", variants: ["<", "≥", "≤"], shift:"<" },
      "[7]", "[8]", "[9]", "\\div"
    ],
    [
      "\\frac{#0}{#?}",
      // 試験導入: \encloseで√の中身を破線ボーダーの箱として描画する（Photomath風の空白枠線）。
      // labelは通常の√表記のまま、挿入時だけ中身をenclose{roundedbox}で包む。
      { latex: "\\sqrt{#0}", insert: "\\sqrt{\\enclose{roundedbox}[1px dashed #999]{#0}}" },
      "[4]", "[5]", "[6]", "\\times"
    ],
    [
      { label: "{#0}<sup>2</sup>", insert: "^2"},
      { label: "x", variants:["y", "z"], shift: "y"}, 
      "[1]", "[2]", "[3]", "-"],
    ["\\pi", "%", "[0]", "[.]", "=", "+"],
  ],
};

const LAYOUT_FUNCTIONS: VirtualKeyboardLayout = {
  id: "goatask-functions",
  label: "関数",
  tooltip: "三角関数・対数・組合せ",
  rows: [
    [
      { latex: "\\sin", insert: "\\sin(" },
      { latex: "\\cos", insert: "\\cos(" },
      { latex: "\\tan", insert: "\\tan(" },
      { latex: "\\log", insert: "\\log(" },
      { latex: "\\ln", insert: "\\ln(" },
      { label: "e<sup>x</sup>", insert: "\\exp(" },
    ],
    [
      { latex: "\\sin^{-1}", insert: "\\arcsin(", class: "small" },
      { latex: "\\cos^{-1}", insert: "\\arccos(", class: "small" },
      { latex: "\\tan^{-1}", insert: "\\arctan(", class: "small" },
      { label: "nPr", insert: "\\operatorname{nPr}(", class: "small" },
      { label: "nCr", insert: "\\operatorname{nCr}(", class: "small" },
      { label: "nHr", insert: "\\operatorname{nHr}(", class: "small" },
    ],
    [
      { latex: "\\sinh", insert: "\\sinh(", class: "small" },
      { latex: "\\cosh", insert: "\\cosh(", class: "small" },
      { latex: "\\tanh", insert: "\\tanh(", class: "small" },
      { label: "nVr", insert: "\\operatorname{nVr}(", class: "small" },
      "(",
      ")",
    ],
    [
      { latex: "\\sinh^{-1}", insert: "\\operatorname{asinh}(", class: "small" },
      { latex: "\\cosh^{-1}", insert: "\\operatorname{acosh}(", class: "small" },
      { latex: "\\tanh^{-1}", insert: "\\operatorname{atanh}(", class: "small" },
      { label: ",", insert: "," },
      "i",
      { label: "|a|", insert: "\\left|#0\\right|" },
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
      { label: "∫", insert: "\\int #0\\, d#?" },
      { latex: "\\frac{d}{dx}", insert: "\\frac{d}{dx} #0", class: "small" },
      { label: "lim", insert: "\\lim_{#?\\to #?} #0" },
      { label: "Σ", insert: "\\sum_{#?=#?}^{#?} #0" },
      { label: "Π", insert: "\\prod_{#?=#?}^{#?} #0" },
      { label: "f'", insert: "'" },
    ],
    [
      "=",
      // \begin{cases}は行数に応じて左中括弧が自動伸縮する。+行はcases内でのみ機能する
      // MathLive組み込みコマンド（範囲外では無害に無視される）。
      { label: "連立", insert: "\\begin{cases}#0\\\\#?\\end{cases}", class: "small" },
      { label: "+行", command: "addRowAfter", class: "small" },
      { label: "dx", insert: "dx" },
      "\\infty",
      "x",
    ],
    ["<", ">", "\\le", "\\ge", "\\ne", { label: ",", insert: "," }],
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
