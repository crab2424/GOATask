import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { CalcError, evaluate, formatResult, type AngleMode } from "./engine/calculatorEngine";
import { evaluateAdvanced, isPlainNumeric } from "./engine/calcDispatch";
import { tryEvaluateRational, formatFraction } from "./engine/rationalEngine";
import { endCursor } from "./engine/editTree";
import { moveLeft, moveRight, moveVertical } from "./engine/editCursor";
import {
  type EditState,
  backspace as backspaceEdit,
  emptyState,
  insertAbs,
  insertChars,
  insertFraction,
  insertSqrt,
  insertSup,
} from "./engine/editCommands";
import { linearize, parseLinear } from "./engine/linearize";
import { useIsMobile } from "../../shared/lib/useIsMobile";
import { CalculatorEquationPanel } from "./components/CalculatorEquationPanel";
import { MathEditor } from "./components/MathEditor";
import { MathExpression } from "./components/MathExpression";

// 解析パネルはnerdamer（約400KB）を含むため、開いたときだけ読み込む
const CalculatorAnalysisPanel = lazy(() =>
  import("./components/CalculatorAnalysisPanel").then((m) => ({
    default: m.CalculatorAnalysisPanel,
  })),
);

// 電卓内のサブモード。1画面に詰め込まず、モードごとにキーパッドを切り替える。
type CalcSubMode = "calc" | "equation" | "analysis";

const SUB_MODES: { id: CalcSubMode; label: string }[] = [
  { id: "calc", label: "計算" },
  { id: "equation", label: "方程式" },
  { id: "analysis", label: "解析" },
];

interface HistoryEntry {
  expression: string;
  result: string;
}

// キーパッド定義。insertは式に挿入する文字列、nodeは複数スロットを持つ構造ノード
// （分数・√・上付き指数）を挿入して最初のスロットにカーソルを置く。
type NodeKind = "frac" | "sqrt" | "sup" | "abs";
type Key =
  | { type: "insert"; label: string; text: string; className?: string; arith?: boolean }
  | { type: "node"; label: string; node: NodeKind; className?: string }
  | { type: "action"; label: string; action: "clear" | "backspace" | "equals" | "left" | "right"; className?: string };

const KEY_OP = "bg-slate-200 hover:bg-slate-300 text-slate-800";
const KEY_NUM = "bg-white hover:bg-slate-100 text-slate-900 border border-slate-200";
const KEY_ACCENT = "bg-slate-900 hover:bg-slate-700 text-white";
// 数字と隣接しない記号・関数キー（√, sin, π, a-z等）は数字キーと同じ枠を付け、
// 独立したキーだと分かるようにする（NUMBER_PAD内の四則演算子は数字と地続きなので対象外）。
const KEY_OP_FRAMED = "border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700";

// 数字＋四則演算＋括弧・%。全モード共通で常設するキーパッド。
const NUMBER_PAD: Key[][] = [
  [
    { type: "insert", label: "7", text: "7", className: KEY_NUM },
    { type: "insert", label: "8", text: "8", className: KEY_NUM },
    { type: "insert", label: "9", text: "9", className: KEY_NUM },
    { type: "insert", label: "÷", text: "÷", className: KEY_OP, arith: true },
    { type: "insert", label: "%", text: "%", className: KEY_OP },
  ],
  [
    { type: "insert", label: "4", text: "4", className: KEY_NUM },
    { type: "insert", label: "5", text: "5", className: KEY_NUM },
    { type: "insert", label: "6", text: "6", className: KEY_NUM },
    { type: "insert", label: "×", text: "×", className: KEY_OP, arith: true },
    { type: "insert", label: "(", text: "(", className: KEY_OP },
  ],
  [
    { type: "insert", label: "1", text: "1", className: KEY_NUM },
    { type: "insert", label: "2", text: "2", className: KEY_NUM },
    { type: "insert", label: "3", text: "3", className: KEY_NUM },
    { type: "insert", label: "−", text: "-", className: KEY_OP, arith: true },
    { type: "insert", label: ")", text: ")", className: KEY_OP },
  ],
  [
    { type: "insert", label: "0", text: "0", className: `${KEY_NUM} col-span-2` },
    { type: "insert", label: ".", text: ".", className: KEY_NUM },
    { type: "insert", label: "＋", text: "+", className: KEY_OP, arith: true },
    { type: "action", label: "=", action: "equals", className: KEY_ACCENT },
  ],
];

// キー定義を短く書くためのヘルパー。opは記号キー（関数・演算子）、insはそのまま挿入するキー、
// nodeKeyは構造ノード（分数・√・指数）を挿入するキー。数字と隣接しないので枠付きにする。
const op = (label: string, text: string): Key =>
  ({ type: "insert", label, text, className: KEY_OP_FRAMED });
const ins = (label: string, text?: string): Key =>
  ({ type: "insert", label, text: text ?? label, className: KEY_NUM });
const nodeKey = (label: string, node: NodeKind): Key =>
  ({ type: "node", label, node, className: KEY_OP_FRAMED });

// Photomath形式のキーページ。ページ切替でキーパッド全体（数字含む）を入れ替えて
// スペースを確保する。新しい分類はこの配列に要素を追加するだけで対応できる。
// 注: 微積分・文字（x,y,ギリシャ文字等）のキーは入力のみ対応で、評価は式判定統合
// （方程式・解析モードの融合）で対応予定。現状は = でエラーメッセージになる。
interface KeyPage {
  id: string;
  label: string;
  cols: 3 | 4 | 5 | 6;
  keys: Key[][];
}

const KEY_PAGES: KeyPage[] = [
  {
    id: "main",
    label: "基本",
    cols: 5,
    keys: [
      // √・xʸ・a/bはスロットを持つ構造ノードとして挿入し、内側にカーソルを置く
      [nodeKey("√", "sqrt"), nodeKey("xʸ", "sup"), op("π", "π"), op("e", "e"), op("x!", "!")],
      [nodeKey("a/b", "frac"), op("x", "x"), op("y", "y"), op(",", ","), nodeKey("|a|", "abs")],
      ...NUMBER_PAD,
    ],
  },
  {
    id: "trig",
    label: "三角",
    cols: 3,
    keys: [
      [op("sin", "sin("), op("cos", "cos("), op("tan", "tan(")],
      [op("sin⁻¹", "asin("), op("cos⁻¹", "acos("), op("tan⁻¹", "atan(")],
      [op("sinh", "sinh("), op("cosh", "cosh("), op("tanh", "tanh(")],
      [op("sinh⁻¹", "asinh("), op("cosh⁻¹", "acosh("), op("tanh⁻¹", "atanh(")],
    ],
  },
  {
    id: "log",
    label: "log・組合せ",
    cols: 5,
    keys: [
      [op("log", "log("), op("ln", "ln("), op("eˣ", "exp("), nodeKey("|a|", "abs"), op(",", ",")],
      [op("nPr", "nPr("), op("nCr", "nCr("), op("nHr", "nHr("), op("nVr", "nVr("), op("i", "i")],
    ],
  },
  {
    id: "calculus",
    label: "微積分",
    cols: 4,
    keys: [
      [op("∫", "∫("), op("d/dx", "d/dx("), op("lim", "lim("), op("Σ", "Σ(")],
      [op("Π", "Π("), op("dx", "dx"), op("∞", "∞"), op("f'", "'")],
    ],
  },
  {
    id: "abc",
    label: "abc",
    cols: 6,
    keys: [
      ["a", "b", "c", "d", "e", "f"].map((c) => ins(c)),
      ["g", "h", "i", "j", "k", "l"].map((c) => ins(c)),
      ["m", "n", "o", "p", "q", "r"].map((c) => ins(c)),
      ["s", "t", "u", "v", "w", "x"].map((c) => ins(c)),
      ["y", "z", "α", "β", "γ", "δ"].map((c) => ins(c)),
      ["ε", "θ", "λ", "μ", "σ", "ω"].map((c) => ins(c)),
    ],
  },
];

// 基本ページ以外にも = とカーソル移動・⌫を常設し、評価のたびにページを戻らなくて済むようにする。
const CONTROL_ROW: Key[] = [
  { type: "action", label: "←", action: "left", className: KEY_OP },
  { type: "action", label: "→", action: "right", className: KEY_OP },
  { type: "action", label: "⌫", action: "backspace", className: KEY_OP },
  { type: "action", label: "=", action: "equals", className: KEY_ACCENT },
];

// ページごとに行列を尊重して描画するため、Tailwindが静的に拾えるようにマップで定義する。
const PAGE_COLS_CLASS: Record<3 | 4 | 5 | 6, string> = {
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

// 結果の分数トグル表示を出すかどうかを判定する。
// 整数（分数にする意味がない）・厳密評価不可（sin/log/piなど）・桁数が大きすぎて
// スマホ画面でも読みにくくなる場合はnull（トグルボタン自体を出さない）。
// float評価値とも突き合わせ、rationalEngine側にバグがあっても誤った分数を出さないようにする。
function pickFractionDisplay(expression: string, value: number): string | null {
  const rational = tryEvaluateRational(expression);
  if (!rational || rational.isInt()) return null;
  if (rational.num.toString().replace("-", "").length > 12 || rational.den.toString().length > 12) return null;
  if (Math.abs(rational.toNumber() - value) > 1e-9 * Math.max(1, Math.abs(value))) return null;
  return formatFraction(rational);
}

// 分数⇄小数の表示モードはユーザーの好みなので計算のたびにリセットせず、
// localStorageに永続化して次回起動後も覚えておく。
const FRACTION_DISPLAY_KEY = "goatask-calc-fraction-display";

function loadFractionDisplayPref(): boolean {
  try {
    return localStorage.getItem(FRACTION_DISPLAY_KEY) === "1";
  } catch {
    return false;
  }
}

// 物理キーボード入力 → 挿入文字列の対応（PC向け）。^はsupノード挿入なので別扱い
const KEYBOARD_INSERT: Record<string, string> = {
  "0": "0", "1": "1", "2": "2", "3": "3", "4": "4",
  "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
  ".": ".", "+": "+", "-": "-", "*": "×", "/": "÷",
  "%": "%", "(": "(", ")": ")", "!": "!",
};

export function CalculatorView() {
  const isMobile = useIsMobile();
  const [subMode, setSubMode] = useState<CalcSubMode>("calc");
  const [analysisOpened, setAnalysisOpened] = useState(false);
  // 入力中の式は編集ツリー＋カーソルパスで保持する（評価時にlinearizeで文字列化）
  const [edit, setEdit] = useState<EditState>(emptyState);
  const [result, setResult] = useState<string | null>(null);
  // 数値のみの式かつ厳密な有理数として計算できたときだけ入る（詳細はrationalEngine.ts）
  const [resultFraction, setResultFraction] = useState<string | null>(null);
  // 分数⇄小数の表示モード。ユーザーの好みとして計算をまたいで維持し、localStorageに永続化する
  // （直前の結果に分数が無いときは自然にresultFraction===nullで小数表示にフォールバックする）。
  const [showFraction, setShowFraction] = useState(loadFractionDisplayPref);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [angleMode, setAngleMode] = useState<AngleMode>("DEG");
  const [activePageId, setActivePageId] = useState(KEY_PAGES[0].id);
  const [memory, setMemory] = useState<number | null>(null);
  // 方程式・微積分・複素数はnerdamerの動的import待ちが発生しうるため、その間の表示用フラグ
  const [isCalculating, setIsCalculating] = useState(false);
  // =直後に数字を打ったら新しい式を始める（実機電卓と同じ挙動）
  const justEvaluated = useRef(false);

  const toggleFractionDisplay = useCallback(() => {
    setShowFraction((v) => {
      const next = !v;
      try {
        localStorage.setItem(FRACTION_DISPLAY_KEY, next ? "1" : "0");
      } catch {
        // プライベートブラウジング等でlocalStorageが使えない場合は今回だけの切替に留める
      }
      return next;
    });
  }, []);

  // =直後の入力開始処理。演算子（や指数）なら直前の結果に続けて計算し、
  // それ以外は新しい式を始める（実機電卓と同じ挙動）。
  const beginOrContinue = useCallback((continueFromResult: boolean): EditState => {
    if (!justEvaluated.current) return edit;
    justEvaluated.current = false;
    if (continueFromResult && result !== null) {
      const tree = parseLinear(result);
      return { tree, cursor: endCursor(tree) };
    }
    setResult(null);
    setResultFraction(null);
    return emptyState();
  }, [edit, result]);

  const insertText = useCallback((text: string) => {
    setError(null);
    const base = beginOrContinue(text.length === 1 && "+-×÷%!".includes(text));
    setEdit(insertChars(base, text));
  }, [beginOrContinue]);

  // 分数・√・指数キー: 構造ノードを挿入して最初のスロットにカーソルを置く。
  // 指数（xʸ・物理キーの^）だけは=直後なら結果に続けて累乗できるようにする。
  const insertNode = useCallback((node: NodeKind) => {
    setError(null);
    const base = beginOrContinue(node === "sup");
    switch (node) {
      case "frac": setEdit(insertFraction(base)); break;
      case "sqrt": setEdit(insertSqrt(base)); break;
      case "sup": setEdit(insertSup(base)); break;
      case "abs": setEdit(insertAbs(base)); break;
    }
  }, [beginOrContinue]);

  const backspace = useCallback(() => {
    setError(null);
    justEvaluated.current = false;
    setEdit((s) => backspaceEdit(s));
  }, []);

  const clearAll = useCallback(() => {
    setEdit(emptyState());
    setResult(null);
    setResultFraction(null);
    setError(null);
    justEvaluated.current = false;
  }, []);

  // カーソル移動はeditCursorに委譲する。Row内はトークン境界単位でジャンプし
  // （sin( や asinh を1タップで飛び越える従来仕様）、分数・√・指数の境界では
  // スロットに入る／出る。↑↓は分数の分子⇄分母。
  const moveCursor = useCallback((delta: number) => {
    justEvaluated.current = false;
    setEdit((s) => ({ tree: s.tree, cursor: delta > 0 ? moveRight(s.tree, s.cursor) : moveLeft(s.tree, s.cursor) }));
  }, []);

  const moveCursorVertical = useCallback((dir: "up" | "down") => {
    justEvaluated.current = false;
    setEdit((s) => ({ tree: s.tree, cursor: moveVertical(s.tree, s.cursor, dir) }));
  }, []);

  // 数値のみの式は既存の同期エンジンで即座に評価する（従来通り、カーソル位置エラー表示も維持）。
  // 方程式(=)・微積分記法・文字式はcalcDispatchへ回し、必要な場合だけnerdamerを動的importする。
  const equals = useCallback(() => {
    // 評価は編集ツリーを既存トークナイザ互換の文字列に線形化して既存パイプラインに渡す
    const expression = linearize(edit.tree);
    if (expression.trim() === "" || isCalculating) return;
    if (isPlainNumeric(expression)) {
      try {
        const value = evaluate(expression, { angleMode });
        const formatted = formatResult(value);
        setResult(formatted);
        setResultFraction(pickFractionDisplay(expression, value));
        setError(null);
        setHistory((prev) => [{ expression, result: formatted }, ...prev].slice(0, 20));
        justEvaluated.current = true;
      } catch (e) {
        if (e instanceof CalcError) {
          // エラー位置は線形化後の文字列上の位置でツリーへ逆写像できないため、メッセージのみ表示する
          setError(e.message);
        } else {
          setError("計算に失敗しました");
        }
      }
      return;
    }
    setError(null);
    setIsCalculating(true);
    setResultFraction(null);
    evaluateAdvanced(expression)
      .then((formatted) => {
        setResult(formatted);
        setHistory((prev) => [{ expression, result: formatted }, ...prev].slice(0, 20));
        justEvaluated.current = true;
      })
      .catch((e) => setError(e instanceof Error ? e.message : "計算に失敗しました"))
      .finally(() => setIsCalculating(false));
  }, [edit, angleMode, isCalculating]);

  // M+/M-: 表示中の結果（なければ現在の式を評価した値）をメモリに加減算する
  const memoryAdd = useCallback((sign: 1 | -1) => {
    let value: number;
    if (result !== null) {
      value = parseFloat(result);
    } else {
      try {
        value = evaluate(linearize(edit.tree), { angleMode });
      } catch {
        setError("メモリに保存する値を計算できません");
        return;
      }
    }
    setMemory((m) => (m ?? 0) + sign * value);
  }, [result, edit, angleMode]);

  const handleKey = useCallback((key: Key) => {
    if (key.type === "insert") {
      insertText(key.text);
      return;
    }
    if (key.type === "node") {
      insertNode(key.node);
      return;
    }
    switch (key.action) {
      case "clear": clearAll(); break;
      case "backspace": backspace(); break;
      case "equals": equals(); break;
      case "left": moveCursor(-1); break;
      case "right": moveCursor(1); break;
    }
  }, [insertText, insertNode, clearAll, backspace, equals, moveCursor]);

  // PC: 物理キーボード対応。他の入力欄にフォーカスがあるときは奪わない。
  // 方程式・解析モードはフォーム入力主体なのでリスナー自体を外す。
  useEffect(() => {
    if (subMode !== "calc") return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key in KEYBOARD_INSERT) {
        e.preventDefault();
        insertText(KEYBOARD_INSERT[e.key]);
      } else if (e.key === "^") {
        e.preventDefault();
        insertNode("sup");
      } else if (/^[a-zA-Z,]$/.test(e.key)) {
        // sin(30) のような関数名をそのままタイプできるようにする
        e.preventDefault();
        insertText(e.key);
      } else if (e.key === "Enter" || e.key === "=") {
        e.preventDefault();
        equals();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
      } else if (e.key === "Escape") {
        e.preventDefault();
        clearAll();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveCursor(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        moveCursor(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveCursorVertical("up");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveCursorVertical("down");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [subMode, insertText, insertNode, equals, backspace, clearAll, moveCursor, moveCursorVertical]);

  const display = (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${isMobile ? "p-3" : "p-4"}`}>
      <div className="mb-1 flex min-h-8 items-center gap-2 text-[11px] font-semibold text-slate-400">
        <div className="flex items-center gap-2">
          <span title="三角関数の角度モード">角度 {angleMode}</span>
          {memory !== null && <span title={`メモリ: ${formatResult(memory)}`}>M</span>}
        </div>
        <div className="ml-auto flex gap-1" aria-label="式のカーソル移動">
          <button onClick={() => moveCursor(-1)} className="min-h-8 min-w-9 rounded-md bg-slate-100 text-sm text-slate-600 hover:bg-slate-200" aria-label="カーソルを左へ">←</button>
          <button onClick={() => moveCursor(1)} className="min-h-8 min-w-9 rounded-md bg-slate-100 text-sm text-slate-600 hover:bg-slate-200" aria-label="カーソルを右へ">→</button>
        </div>
      </div>
      {/* 編集中の式は編集ツリーをMathEditorで組版する（分数の縦組み・√のoverline・
          上付き指数・sin⁻¹表記・カーソル描画・タップでのカーソル配置）。 */}
      <div className="min-h-[2rem] break-all text-left font-mono text-xl text-slate-800">
        <MathEditor
          tree={edit.tree}
          cursor={edit.cursor}
          onCursorChange={(c) => {
            justEvaluated.current = false;
            setEdit((s) => ({ tree: s.tree, cursor: c }));
          }}
        />
      </div>
      <div className={`${isMobile ? "mt-1 min-h-[2.25rem]" : "mt-2 min-h-[2.5rem]"} flex items-center justify-end gap-2`}>
        {error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : isCalculating ? (
          <p className="text-sm text-slate-400">計算中…</p>
        ) : (
          <>
            {/* 分数⇄小数の切替チップ。厳密な有理数として計算できたときだけ表示する（rationalEngine.ts）。
                新しい行を作らず同じ行に収めてスマホでも詰まないようにする。選んだ表示モードは
                localStorageに永続化され、計算をまたいでも次回起動後も維持される。 */}
            {resultFraction && (
              <button
                onClick={toggleFractionDisplay}
                className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200"
                title="分数⇄小数を切替"
              >
                {showFraction ? "0.x" : "a/b"}
              </button>
            )}
            <p className={`break-all font-mono font-bold text-slate-900 ${isMobile ? "text-2xl" : "text-3xl"}`}>
              {result !== null ? (
                <>
                  <span>= </span>
                  <MathExpression expression={showFraction && resultFraction ? resultFraction : result} />
                </>
              ) : (
                " "
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );

  // キーページ。行列を尊重し、行ごとに独立gridで描画する（0キーのcol-span-2は行内で成立）。
  // 基本ページ以外にはCONTROL_ROW（←→⌫=）を末尾に足し、評価のたびにページを戻らなくて済むようにする。
  const renderPage = (page: KeyPage) => {
    const rows = page.id === "main" ? page.keys : [...page.keys, CONTROL_ROW];
    return (
      <div className="space-y-2">
        {rows.map((row, rowIdx) => (
          <div
            key={rowIdx}
            className={`grid gap-2 ${row === CONTROL_ROW ? "grid-cols-4" : PAGE_COLS_CLASS[page.cols]}`}
          >
            {row.map((key, i) => {
              // 四則演算子（＋−×÷）は数字キーと同じ枠の中で、見た目だけ数字の横幅くらいの
              // 小さな角丸チップにする。タップ領域はセル全体のまま変えない。
              const isArith = key.type === "insert" && key.arith;
              return (
                <button
                  key={i}
                  onClick={() => handleKey(key)}
                  className={`min-h-11 flex items-center justify-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 ${
                    isArith ? "" : `px-1 py-2 text-base font-medium ${key.className ?? KEY_NUM}`
                  }`}
                >
                  {isArith ? (
                    <span className={`flex h-8 w-8 items-center justify-center rounded-md text-base font-medium ${key.className ?? KEY_OP}`}>
                      {key.label}
                    </span>
                  ) : (
                    key.label
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  const activePage = KEY_PAGES.find((p) => p.id === activePageId) ?? KEY_PAGES[0];

  // 常設ツールバー: AC/⌫、角度モード、メモリ操作。パネルタブに関わらず常に表示する。
  const calcToolbar = (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        onClick={clearAll}
        className="rounded-lg bg-rose-100 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-200"
      >
        AC
      </button>
      <button
        onClick={backspace}
        className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-300"
      >
        ⌫
      </button>
      <button
        onClick={() => setAngleMode((m) => (m === "DEG" ? "RAD" : "DEG"))}
        className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-300"
        title="角度モード切替"
      >
        {angleMode === "DEG" ? "DEG⇄" : "RAD⇄"}
      </button>
      <div className="ml-auto flex flex-wrap gap-1">
        <button
          onClick={() => setMemory(null)}
          disabled={memory === null}
          className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-300 disabled:opacity-40"
        >
          MC
        </button>
        <button
          onClick={() => { if (memory !== null) insertText(formatResult(memory)); }}
          disabled={memory === null}
          className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-300 disabled:opacity-40"
        >
          MR
        </button>
        <button
          onClick={() => memoryAdd(1)}
          className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-300"
        >
          M+
        </button>
        <button
          onClick={() => memoryAdd(-1)}
          className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-300"
        >
          M−
        </button>
      </div>
    </div>
  );

  // キーページのタブ。将来のカテゴリ追加はKEY_PAGESに要素を足すだけでよい。
  const pageTabs = (
    <div className="flex items-center gap-1 overflow-x-auto">
      {KEY_PAGES.map((page) => (
        <button
          key={page.id}
          onClick={() => setActivePageId(page.id)}
          aria-pressed={activePageId === page.id}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            activePageId === page.id
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {page.label}
        </button>
      ))}
    </div>
  );

  const historyPanel = history.length > 0 && (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-500">履歴</h3>
        <button
          onClick={() => setHistory([])}
          className="text-[11px] text-slate-400 hover:text-slate-600"
        >
          クリア
        </button>
      </div>
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {history.map((entry, i) => (
          <li key={i}>
            <button
              onClick={() => {
                const tree = parseLinear(entry.result);
                setEdit({ tree, cursor: endCursor(tree) });
                setResult(null);
                setResultFraction(null);
                setError(null);
                justEvaluated.current = false;
              }}
              className="w-full rounded px-2 py-1 text-right font-mono text-sm hover:bg-slate-100"
              title="結果を式に読み込む"
            >
              <span className="text-slate-400"><MathExpression expression={entry.expression} /> =</span>{" "}
              <span className="font-semibold text-slate-800"><MathExpression expression={entry.result} /></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  const mobileHistory = history.length > 0 && (
    <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-500">
        履歴（{history.length}件）
      </summary>
      <div className="border-t border-slate-100 p-2">{historyPanel}</div>
    </details>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className={`${isMobile ? "mb-2" : "mb-3"} flex items-center gap-1 overflow-x-auto`}>
        {SUB_MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              setSubMode(m.id);
              if (m.id === "analysis") setAnalysisOpened(true);
            }}
            aria-pressed={subMode === m.id}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors ${
              subMode === m.id
                ? "bg-slate-900 font-semibold text-white"
                : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div hidden={subMode !== "calc"}>
        {(() => {
          const keypad = (
            <>
              {calcToolbar}
              {pageTabs}
              {renderPage(activePage)}
            </>
          );
          return isMobile ? (
            <div className="space-y-2">
              {display}
              {keypad}
              {mobileHistory}
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_240px] gap-4">
              <div className="space-y-3">
                {display}
                {keypad}
                <p className="text-center text-[11px] text-slate-400">
                  キーボード入力対応: 数字・演算子・関数名(sinなど)・Enter(=)・Backspace・Esc(AC)・←→↑↓(カーソル移動)
                </p>
              </div>
              <div>{historyPanel}</div>
            </div>
          );
        })()}
      </div>

      <div hidden={subMode !== "equation"}>
        <CalculatorEquationPanel />
      </div>

      {analysisOpened && (
        <div hidden={subMode !== "analysis"}>
          <Suspense
            fallback={
              <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
                読み込み中...
              </div>
            }
          >
            <CalculatorAnalysisPanel />
          </Suspense>
        </div>
      )}
    </div>
  );
}
