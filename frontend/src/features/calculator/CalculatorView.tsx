import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalcError, evaluate, formatResult, type AngleMode } from "./engine/calculatorEngine";
import { evaluateAdvanced, expandExpression, factorExpression, isPlainNumeric } from "./engine/calcDispatch";
import { tryEvaluateRational, formatFraction } from "./engine/rationalEngine";
import { fractionToLatex, latexToLinear, numberToLatex } from "./engine/latexBridge";
import { useIsMobile } from "../../shared/lib/useIsMobile";
import { CalculatorEquationPanel } from "./components/CalculatorEquationPanel";
import { MathField, type MathFieldHandle } from "./components/MathField";
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
  /** 入力式の LaTeX（履歴クリックで復元できる） */
  latex: string;
  /** 表示用に整形済みの結果 LaTeX */
  resultLatex: string;
}

// キーパッド定義。値は MathLive に渡す LaTeX スニペット。
// #0 は挿入直後にカーソルを置く位置、#? はプレースホルダ空スロット。
// たとえば a/b は `\frac{#0}{#?}` で挿入し、分子にカーソルが立って分母は空スロット表示。
type Key =
  | { type: "insert"; label: string; latex: string; className?: string }
  | { type: "action"; label: string; action: CalcAction; className?: string };

type CalcAction = "clear" | "backspace" | "equals" | "left" | "right";

const KEY_OP = "bg-slate-200 hover:bg-slate-300 text-slate-800";
const KEY_NUM = "bg-white hover:bg-slate-100 text-slate-900 border border-slate-200";
const KEY_ACCENT = "bg-slate-900 hover:bg-slate-700 text-white";

// 数字＋四則演算＋括弧・%。全モード共通で常設するキーパッド。
const NUMBER_PAD: Key[][] = [
  [
    { type: "insert", label: "7", latex: "7", className: KEY_NUM },
    { type: "insert", label: "8", latex: "8", className: KEY_NUM },
    { type: "insert", label: "9", latex: "9", className: KEY_NUM },
    { type: "insert", label: "÷", latex: "\\div", className: KEY_OP },
    { type: "insert", label: "%", latex: "\\%", className: KEY_OP },
  ],
  [
    { type: "insert", label: "4", latex: "4", className: KEY_NUM },
    { type: "insert", label: "5", latex: "5", className: KEY_NUM },
    { type: "insert", label: "6", latex: "6", className: KEY_NUM },
    { type: "insert", label: "×", latex: "\\times", className: KEY_OP },
    { type: "insert", label: "(", latex: "(", className: KEY_OP },
  ],
  [
    { type: "insert", label: "1", latex: "1", className: KEY_NUM },
    { type: "insert", label: "2", latex: "2", className: KEY_NUM },
    { type: "insert", label: "3", latex: "3", className: KEY_NUM },
    { type: "insert", label: "−", latex: "-", className: KEY_OP },
    { type: "insert", label: ")", latex: ")", className: KEY_OP },
  ],
  [
    { type: "insert", label: "0", latex: "0", className: `${KEY_NUM} col-span-2` },
    { type: "insert", label: ".", latex: ".", className: KEY_NUM },
    { type: "insert", label: "＋", latex: "+", className: KEY_OP },
    { type: "action", label: "=", action: "equals", className: KEY_ACCENT },
  ],
];

// キー定義ヘルパ。opは記号キー（関数・演算子）、insはそのまま挿入するキー。
const op = (label: string, latex: string): Key => ({ type: "insert", label, latex, className: KEY_OP });
const ins = (label: string, latex?: string): Key => ({ type: "insert", label, latex: latex ?? label, className: KEY_NUM });

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
      // √・xʸ・a/bはLaTeXの構造ノードとして挿入し、#0の位置（第1スロット）にカーソルを置く
      [op("√", "\\sqrt{#0}"), op("xʸ", "^{#0}"), op("π", "\\pi"), op("e", "e"), op("x!", "!")],
      [op("a/b", "\\frac{#0}{#?}"), op("x", "x"), op("y", "y"), op(",", ","), op("|a|", "\\left|#0\\right|")],
      ...NUMBER_PAD,
    ],
  },
  {
    id: "trig",
    label: "三角",
    cols: 3,
    keys: [
      [op("sin", "\\sin("), op("cos", "\\cos("), op("tan", "\\tan(")],
      [op("sin⁻¹", "\\arcsin("), op("cos⁻¹", "\\arccos("), op("tan⁻¹", "\\arctan(")],
      [op("sinh", "\\sinh("), op("cosh", "\\cosh("), op("tanh", "\\tanh(")],
      [op("sinh⁻¹", "\\operatorname{asinh}("), op("cosh⁻¹", "\\operatorname{acosh}("), op("tanh⁻¹", "\\operatorname{atanh}(")],
    ],
  },
  {
    id: "log",
    label: "log・組合せ",
    cols: 5,
    keys: [
      [op("log", "\\log("), op("ln", "\\ln("), op("eˣ", "\\exp("), op("|a|", "\\left|#0\\right|"), op(",", ",")],
      [op("nPr", "\\operatorname{nPr}("), op("nCr", "\\operatorname{nCr}("), op("nHr", "\\operatorname{nHr}("), op("nVr", "\\operatorname{nVr}("), op("i", "i")],
    ],
  },
  {
    id: "calculus",
    label: "微積分",
    cols: 4,
    keys: [
      // 積分・微分・極限・総和は表示上の記号だけ入れる（評価は未対応、将来Phase Dで対応）
      [op("∫", "\\int"), op("d/dx", "\\frac{d}{dx}"), op("lim", "\\lim"), op("Σ", "\\sum")],
      [op("Π", "\\prod"), op("dx", "dx"), op("∞", "\\infty"), op("f'", "'")],
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
      ["y", "z", "α", "β", "γ", "δ"].map((c, i) => ins(c, ["y", "z", "\\alpha", "\\beta", "\\gamma", "\\delta"][i])),
      ["ε", "θ", "λ", "μ", "σ", "ω"].map((c, i) => ins(c, ["\\epsilon", "\\theta", "\\lambda", "\\mu", "\\sigma", "\\omega"][i])),
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
function pickFractionDisplay(linearExpr: string, value: number): string | null {
  const rational = tryEvaluateRational(linearExpr);
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

// 方程式・微積分・複素数・文字式（Compute Engine経由）の結果は厳密値(π・√・分数を保持)と
// 小数近似の両方を持ちうる。どちらを見せるかも分数トグルと同じくlocalStorageに永続化する。
const DECIMAL_DISPLAY_KEY = "goatask-calc-decimal-display";

function loadDecimalDisplayPref(): boolean {
  try {
    return localStorage.getItem(DECIMAL_DISPLAY_KEY) === "1";
  } catch {
    return false;
  }
}

export function CalculatorView() {
  const isMobile = useIsMobile();
  const [subMode, setSubMode] = useState<CalcSubMode>("calc");
  const [analysisOpened, setAnalysisOpened] = useState(false);
  // 入力中の式は LaTeX 文字列で保持する（評価時に latexToLinear で線形化して既存パイプに渡す）
  const [latex, setLatex] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [resultLatex, setResultLatex] = useState<string | null>(null);
  // 数値のみの式かつ厳密な有理数として計算できたときだけ入る（詳細はrationalEngine.ts）
  const [resultFractionLatex, setResultFractionLatex] = useState<string | null>(null);
  // 分数⇄小数の表示モード。ユーザーの好みとして計算をまたいで維持し、localStorageに永続化する
  // （直前の結果に分数が無いときは自然にresultFraction===nullで小数表示にフォールバックする）。
  const [showFraction, setShowFraction] = useState(loadFractionDisplayPref);
  // Compute Engine経由（方程式・微積分・複素数・文字式）の結果が厳密値と数値上異なるときだけ入る
  const [resultDecimalLatex, setResultDecimalLatex] = useState<string | null>(null);
  // 厳密値⇄小数近似の表示モード。上記と同じ理由でlocalStorageに永続化する。
  const [showDecimal, setShowDecimal] = useState(loadDecimalDisplayPref);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [angleMode, setAngleMode] = useState<AngleMode>("DEG");
  const [activePageId, setActivePageId] = useState(KEY_PAGES[0].id);
  const [memory, setMemory] = useState<number | null>(null);
  // 方程式・微積分・複素数・展開・因数分解はCompute Engineの動的import待ちが発生しうるため、その間の表示用フラグ
  const [isCalculating, setIsCalculating] = useState(false);
  // =直後に数字を打ったら新しい式を始める（実機電卓と同じ挙動）
  const justEvaluated = useRef(false);
  const mathRef = useRef<MathFieldHandle | null>(null);

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

  const toggleDecimalDisplay = useCallback(() => {
    setShowDecimal((v) => {
      const next = !v;
      try {
        localStorage.setItem(DECIMAL_DISPLAY_KEY, next ? "1" : "0");
      } catch {
        // プライベートブラウジング等でlocalStorageが使えない場合は今回だけの切替に留める
      }
      return next;
    });
  }, []);

  // =直後の入力開始処理。演算子（や指数）なら直前の結果に続けて計算し、
  // それ以外は新しい式を始める（実機電卓と同じ挙動）。呼び出し前に必ず MathField をリセットする。
  const beginOrContinue = useCallback((continueFromResult: boolean) => {
    if (!justEvaluated.current) return;
    justEvaluated.current = false;
    if (continueFromResult && result !== null) {
      const startLatex = numberToLatex(result);
      mathRef.current?.setLatex(startLatex);
      setLatex(startLatex);
      return;
    }
    mathRef.current?.setLatex("");
    setLatex("");
    setResult(null);
    setResultLatex(null);
    setResultFractionLatex(null);
    setResultDecimalLatex(null);
  }, [result]);

  const isOperatorLatex = (s: string) => s.length === 1 && "+-*/%!".includes(s) || s === "\\times" || s === "\\div" || s.startsWith("^");

  const insertKey = useCallback((latexSnippet: string) => {
    setError(null);
    beginOrContinue(isOperatorLatex(latexSnippet));
    mathRef.current?.insert(latexSnippet);
  }, [beginOrContinue]);

  const backspace = useCallback(() => {
    setError(null);
    justEvaluated.current = false;
    mathRef.current?.executeCommand("deleteBackward");
  }, []);

  const clearAll = useCallback(() => {
    mathRef.current?.setLatex("");
    setLatex("");
    setResult(null);
    setResultLatex(null);
    setResultFractionLatex(null);
    setResultDecimalLatex(null);
    setError(null);
    justEvaluated.current = false;
  }, []);

  const moveCursor = useCallback((dir: "left" | "right") => {
    justEvaluated.current = false;
    mathRef.current?.executeCommand(dir === "left" ? "moveToPreviousChar" : "moveToNextChar");
  }, []);

  // 数値のみの式は既存の同期エンジンで即座に評価する（従来通り、カーソル位置エラー表示も維持）。
  // 方程式(=)・微積分記法・文字式はcalcDispatch経由でCompute Engineに回す。
  // latexToLinearが解釈できないLaTeX（∫/Σ/Π/lim等）はUnsupportedLatexErrorとして即エラー表示せず、
  // Compute Engineが直接LaTeXを解釈できるようそのまま渡す（linear=nullでadvanced分岐へフォールスルー）。
  const equals = useCallback(() => {
    const currentLatex = mathRef.current?.getLatex() ?? latex;
    if (currentLatex.trim() === "" || isCalculating) return;

    let linear: string | null;
    try {
      linear = latexToLinear(currentLatex);
    } catch {
      linear = null;
    }

    if (linear !== null && linear.trim() !== "" && isPlainNumeric(linear)) {
      try {
        const value = evaluate(linear, { angleMode });
        const formatted = formatResult(value);
        const formattedLatex = numberToLatex(formatted);
        const fracStr = pickFractionDisplay(linear, value);
        const fracLatex = fracStr ? fractionToLatex(fracStr) : null;
        setResult(formatted);
        setResultLatex(formattedLatex);
        setResultFractionLatex(fracLatex);
        setResultDecimalLatex(null);
        setError(null);
        setHistory((prev) => [{ latex: currentLatex, resultLatex: fracLatex && showFraction ? fracLatex : formattedLatex }, ...prev].slice(0, 20));
        justEvaluated.current = true;
      } catch (e) {
        if (e instanceof CalcError) {
          // エラー位置は線形化後の文字列上の位置でMathFieldへ逆写像できないため、メッセージのみ表示する
          setError(e.message);
        } else {
          setError("計算に失敗しました");
        }
      }
      return;
    }
    setError(null);
    setIsCalculating(true);
    setResultFractionLatex(null);
    evaluateAdvanced(currentLatex, angleMode)
      .then(({ exact, decimal }) => {
        // Compute Engineの戻り値はすでにLaTeXなのでnumberToLatexは不要
        setResult(exact);
        setResultLatex(exact);
        setResultDecimalLatex(decimal);
        setHistory((prev) => [{ latex: currentLatex, resultLatex: decimal && showDecimal ? decimal : exact }, ...prev].slice(0, 20));
        justEvaluated.current = true;
      })
      .catch((e) => setError(e instanceof Error ? e.message : "計算に失敗しました"))
      .finally(() => setIsCalculating(false));
  }, [latex, angleMode, isCalculating, showFraction, showDecimal]);

  // 現在の式を展開/因数分解する（=とは独立したアクション）。数値のみの式判定は行わず常にCompute Engineへ渡す
  // （calculatorEngineに展開/因数分解の概念はないため）。非対応の式はCompute Engine側が無変化で返す。
  const expandOrFactor = useCallback((kind: "expand" | "factor") => {
    const currentLatex = mathRef.current?.getLatex() ?? latex;
    if (currentLatex.trim() === "" || isCalculating) return;
    setError(null);
    setIsCalculating(true);
    setResultFractionLatex(null);
    setResultDecimalLatex(null);
    const task = kind === "expand" ? expandExpression(currentLatex) : factorExpression(currentLatex);
    task
      .then((resultLatexStr) => {
        setResult(resultLatexStr);
        setResultLatex(resultLatexStr);
        setHistory((prev) => [{ latex: currentLatex, resultLatex: resultLatexStr }, ...prev].slice(0, 20));
        justEvaluated.current = true;
      })
      .catch((e) => setError(e instanceof Error ? e.message : "計算に失敗しました"))
      .finally(() => setIsCalculating(false));
  }, [latex, isCalculating]);

  // M+/M-: 表示中の結果（なければ現在の式を評価した値）をメモリに加減算する
  const memoryAdd = useCallback((sign: 1 | -1) => {
    let value: number;
    // resultはCompute Engine経由の結果だとLaTeX文字列（例: "\frac{1}{2}"）のことがあり、
    // parseFloatでは数値化できないためNaNチェックでガードする。
    if (result !== null && !Number.isNaN(parseFloat(result))) {
      value = parseFloat(result);
    } else {
      try {
        value = evaluate(latexToLinear(mathRef.current?.getLatex() ?? latex), { angleMode });
      } catch {
        setError("メモリに保存する値を計算できません");
        return;
      }
    }
    setMemory((m) => (m ?? 0) + sign * value);
  }, [result, latex, angleMode]);

  const handleKey = useCallback((key: Key) => {
    if (key.type === "insert") {
      insertKey(key.latex);
      return;
    }
    switch (key.action) {
      case "clear": clearAll(); break;
      case "backspace": backspace(); break;
      case "equals": equals(); break;
      case "left": moveCursor("left"); break;
      case "right": moveCursor("right"); break;
    }
  }, [insertKey, clearAll, backspace, equals, moveCursor]);

  // MathField が focus 中でないときだけ物理キーボードで補助入力を受ける
  // （focus 中は MathLive 本体が正しく処理してくれる）。
  useEffect(() => {
    if (subMode !== "calc") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      const target = e.target as HTMLElement | null;
      if (target && target.tagName === "MATH-FIELD") return;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter" || e.key === "=") { e.preventDefault(); equals(); return; }
      if (e.key === "Escape") { e.preventDefault(); clearAll(); return; }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [subMode, equals, clearAll]);

  const displayedResultLatex = useMemo(() => {
    if (showFraction && resultFractionLatex) return resultFractionLatex;
    if (showDecimal && resultDecimalLatex) return resultDecimalLatex;
    return resultLatex;
  }, [showFraction, resultFractionLatex, showDecimal, resultDecimalLatex, resultLatex]);

  const display = (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${isMobile ? "p-3" : "p-4"}`}>
      <div className="mb-1 flex min-h-8 items-center gap-2 text-[11px] font-semibold text-slate-400">
        <div className="flex items-center gap-2">
          <span title="三角関数の角度モード">角度 {angleMode}</span>
          {memory !== null && <span title={`メモリ: ${formatResult(memory)}`}>M</span>}
        </div>
        <div className="ml-auto flex gap-1" aria-label="式のカーソル移動">
          <button onClick={() => moveCursor("left")} className="min-h-8 min-w-9 rounded-md bg-slate-100 text-sm text-slate-600 hover:bg-slate-200" aria-label="カーソルを左へ">←</button>
          <button onClick={() => moveCursor("right")} className="min-h-8 min-w-9 rounded-md bg-slate-100 text-sm text-slate-600 hover:bg-slate-200" aria-label="カーソルを右へ">→</button>
        </div>
      </div>
      {/* 編集中の式は MathLive の math-field。分数・√・上付き指数・|·|・カーソル・空スロット
          プレースホルダを全部組込みで扱う。 */}
      <div className="min-h-[2rem] break-all text-left text-xl text-slate-800">
        <MathField
          ref={mathRef}
          value={latex}
          onChange={(v) => {
            justEvaluated.current = false;
            setLatex(v);
          }}
          onSubmit={equals}
          className="w-full"
          ariaLabel="数式入力"
        />
      </div>
      <div className={`${isMobile ? "mt-1 min-h-[2.25rem]" : "mt-2 min-h-[2.5rem]"} flex items-center justify-end gap-2`}>
        {error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : isCalculating ? (
          <p className="text-sm text-slate-400">計算中…</p>
        ) : (
          <>
            {resultFractionLatex && (
              <button
                onClick={toggleFractionDisplay}
                className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200"
                title="分数⇄小数を切替"
              >
                {showFraction ? "0.x" : "a/b"}
              </button>
            )}
            {resultDecimalLatex && (
              <button
                onClick={toggleDecimalDisplay}
                className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200"
                title="厳密値⇄小数近似を切替"
              >
                {showDecimal ? "exact" : "0.x"}
              </button>
            )}
            <p className={`break-all font-bold text-slate-900 ${isMobile ? "text-2xl" : "text-3xl"}`}>
              {displayedResultLatex ? (
                <>
                  <span>= </span>
                  <MathExpression expression={displayedResultLatex} />
                </>
              ) : (
                " "
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );

  const renderPage = (page: KeyPage) => {
    const rows = page.id === "main" ? page.keys : [...page.keys, CONTROL_ROW];
    return (
      <div className="space-y-2">
        {rows.map((row, rowIdx) => (
          <div
            key={rowIdx}
            className={`grid gap-2 ${row === CONTROL_ROW ? "grid-cols-4" : PAGE_COLS_CLASS[page.cols]}`}
          >
            {row.map((key, i) => (
              <button
                key={i}
                onClick={() => handleKey(key)}
                className={`min-h-11 rounded-lg px-1 py-2 text-base font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 ${key.className ?? KEY_NUM}`}
              >
                {key.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    );
  };

  const activePage = KEY_PAGES.find((p) => p.id === activePageId) ?? KEY_PAGES[0];

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
      <button
        onClick={() => expandOrFactor("expand")}
        className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-300"
        title="式を展開する"
      >
        展開
      </button>
      <button
        onClick={() => expandOrFactor("factor")}
        className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-300"
        title="式を因数分解する"
      >
        因数分解
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
          onClick={() => { if (memory !== null) insertKey(formatResult(memory)); }}
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
                mathRef.current?.setLatex(entry.resultLatex);
                setLatex(entry.resultLatex);
                setResult(null);
                setResultLatex(null);
                setResultFractionLatex(null);
                setResultDecimalLatex(null);
                setError(null);
                justEvaluated.current = false;
              }}
              className="w-full rounded px-2 py-1 text-right text-sm hover:bg-slate-100"
              title="結果を式に読み込む"
            >
              <span className="text-slate-400"><MathExpression expression={entry.latex} /> =</span>{" "}
              <span className="font-semibold text-slate-800"><MathExpression expression={entry.resultLatex} /></span>
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
                  MathField 直接タイプ対応: 数字・演算子・関数名(sinなど)・Enter(=)・カーソル移動。フォーカスが外れているときは Enter/Esc のみ受け付け。
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
