import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AngleMode } from "./engine/computeEngineEvaluate";
import { approximate, evaluateExpression, expandExpression, factorExpression } from "./engine/calcDispatch";
import { useIsMobile } from "../../shared/lib/useIsMobile";
import { MathField, type MathFieldHandle } from "./components/MathField";
import { MathExpression } from "./components/MathExpression";
import { CALCULATOR_KEYBOARD_LAYOUTS } from "./keyboardLayouts";

interface HistoryEntry {
  /** 入力式の LaTeX（履歴クリックで復元できる） */
  latex: string;
  /** 表示用に整形済みの結果 LaTeX */
  resultLatex: string;
}

// Step 2: 自前キーパッド（KEY_PAGES/NUMBER_PAD等）は撤去し、編集操作はMathLive純正の
// 仮想キーボード（keyboardLayouts.tsのCALCULATOR_KEYBOARD_LAYOUTS）に一本化した。
// ここに残すのはAC/DEG/展開/因数分解/メモリ等の非編集系ツールバーのみ。

// 厳密値⇄小数近似の表示モードはユーザーの好みなので計算のたびにリセットせず、
// localStorageに永続化して次回起動後も覚えておく。9-B以前は分数トグルと2種類の
// スイッチがあったが、9-Cで有理数評価をCompute Engineに一本化したため単一トグルに集約。
const DECIMAL_DISPLAY_KEY = "goatask-calc-decimal-display";
const HISTORY_KEY = "goatask-calc-history";
const ANGLE_MODE_KEY = "goatask-calc-angle-mode";
const MEMORY_KEY = "goatask-calc-memory";

function loadDecimalDisplayPref(): boolean {
  try {
    return localStorage.getItem(DECIMAL_DISPLAY_KEY) === "1";
  } catch {
    return false;
  }
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as HistoryEntry[]).filter((e) =>
      typeof e === "object" && e !== null && typeof e.latex === "string" && typeof e.resultLatex === "string"
    ).slice(0, 20);
  } catch {
    return [];
  }
}

function loadAngleMode(): AngleMode {
  try {
    const v = localStorage.getItem(ANGLE_MODE_KEY);
    return v === "RAD" ? "RAD" : "DEG";
  } catch {
    return "DEG";
  }
}

function loadMemory(): number | null {
  try {
    const v = localStorage.getItem(MEMORY_KEY);
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function saveToStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* ignore */ }
}

// メモリ表示・MR挿入用の軽量な数値整形（12桁精度、末尾ゼロ除去）。旧calculatorEngine.formatResult
// を電卓の中で使い続けるためだけに残していたが、9-Cでその依存を切るためこちらに移した。
function formatNumber(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return value.toString();
  return parseFloat(value.toPrecision(12)).toString();
}

// 演算子キーの直後入力を検知して「=直後に演算子を打ったら結果に続けて計算」を有効化する。
// LaTeXスニペットで演算子相当のものだけをtrueにする（分数キー\frac{#0}{#?}などは対象外）。
function isOperatorLatex(s: string): boolean {
  if (s.length === 1 && "+-*/%!<>=,".includes(s)) return true;
  if (s === "\\times" || s === "\\div" || s === "\\ge" || s === "\\le" || s === "\\ne") return true;
  if (s.startsWith("^")) return true;
  return false;
}

interface CalculatorViewProps {
  /** モバイルの下部タブバーと仮想キーボードが重なるのを避けるため、
   *  MathLive仮想キーボードの表示状態が変わるたびに呼ばれる（App.tsx側でnav表示を切替）。 */
  onKeyboardVisibleChange?: (visible: boolean) => void;
}

export function CalculatorView({ onKeyboardVisibleChange }: CalculatorViewProps = {}) {
  const isMobile = useIsMobile();
  // 入力中の式は LaTeX 文字列で保持する（そのままCompute Engineに渡せる）
  const [latex, setLatex] = useState("");
  // 直近の結果（厳密値のLaTeX）。=直後の継続入力・メモリ加算・履歴表示で参照する。
  const [resultLatex, setResultLatex] = useState<string | null>(null);
  // Compute Engineの.N()で得た小数近似のLaTeX（厳密値と数値上一致する場合はnull）
  const [resultDecimalLatex, setResultDecimalLatex] = useState<string | null>(null);
  const [showDecimal, setShowDecimal] = useState(loadDecimalDisplayPref);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [angleMode, setAngleMode] = useState<AngleMode>(loadAngleMode);
  const [memory, setMemory] = useState<number | null>(loadMemory);
  // Compute Engineの動的import待ちが発生しうるため、その間の表示用フラグ
  const [isCalculating, setIsCalculating] = useState(false);
  // =直後に数字を打ったら新しい式を始める（実機電卓と同じ挙動）
  const justEvaluated = useRef(false);
  const mathRef = useRef<MathFieldHandle | null>(null);
  // 電卓の描画領域本体（サイドメニューを含まない範囲の実測に使う）
  const contentRef = useRef<HTMLDivElement | null>(null);
  // MathLive仮想キーボードのcontainer先。実際のレイアウトには関与しない
  // position:fixedの専用ホスト（詳細は下のuseEffectのコメント参照）
  const vkHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { saveToStorage(HISTORY_KEY, JSON.stringify(history)); }, [history]);
  useEffect(() => { saveToStorage(ANGLE_MODE_KEY, angleMode); }, [angleMode]);
  useEffect(() => { saveToStorage(MEMORY_KEY, memory !== null ? String(memory) : null); }, [memory]);

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
    if (continueFromResult && resultLatex !== null) {
      // 継続入力は「見た目そのまま」で行うため厳密値LaTeXをそのままmathfieldに戻す
      mathRef.current?.setLatex(resultLatex);
      setLatex(resultLatex);
      return;
    }
    mathRef.current?.setLatex("");
    setLatex("");
    setResultLatex(null);
    setResultDecimalLatex(null);
  }, [resultLatex]);

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
    setResultLatex(null);
    setResultDecimalLatex(null);
    setError(null);
    justEvaluated.current = false;
  }, []);

  const moveCursor = useCallback((dir: "left" | "right") => {
    justEvaluated.current = false;
    mathRef.current?.executeCommand(dir === "left" ? "moveToPreviousChar" : "moveToNextChar");
  }, []);

  // 現在の式を評価する。9-Cで旧数値式の同期高速パスを廃止し、全式をCompute Engine（動的import）に
  // 一本化した。数値式でも初回だけ動的importの遅延（数百ms）が発生するが、以後はキャッシュされる。
  const equals = useCallback(() => {
    const currentLatex = mathRef.current?.getLatex() ?? latex;
    if (currentLatex.trim() === "" || isCalculating) return;
    setError(null);
    setIsCalculating(true);
    evaluateExpression(currentLatex, angleMode)
      .then(({ exact, decimal }) => {
        setResultLatex(exact);
        setResultDecimalLatex(decimal);
        setHistory((prev) => [{ latex: currentLatex, resultLatex: decimal && showDecimal ? decimal : exact }, ...prev].slice(0, 20));
        justEvaluated.current = true;
      })
      .catch((e) => setError(e instanceof Error ? e.message : "計算に失敗しました"))
      .finally(() => setIsCalculating(false));
  }, [latex, angleMode, isCalculating, showDecimal]);

  // 現在の式を展開/因数分解する（=とは独立したアクション）。非対応の式はCompute Engine側が
  // 無変化で返す（例外にはならない設計）。
  const expandOrFactor = useCallback((kind: "expand" | "factor") => {
    const currentLatex = mathRef.current?.getLatex() ?? latex;
    if (currentLatex.trim() === "" || isCalculating) return;
    setError(null);
    setIsCalculating(true);
    setResultDecimalLatex(null);
    const task = kind === "expand" ? expandExpression(currentLatex) : factorExpression(currentLatex);
    task
      .then((resultLatexStr) => {
        setResultLatex(resultLatexStr);
        setHistory((prev) => [{ latex: currentLatex, resultLatex: resultLatexStr }, ...prev].slice(0, 20));
        justEvaluated.current = true;
      })
      .catch((e) => setError(e instanceof Error ? e.message : "計算に失敗しました"))
      .finally(() => setIsCalculating(false));
  }, [latex, isCalculating]);

  // M+/M-: 表示中の結果（なければ現在の式）をCompute Engineで数値化してメモリに加減算する。
  // Compute Engineは分数・π・√を含む厳密値も.N()で数値化できるため、旧nerdamerフォールバックは不要。
  const memoryAdd = useCallback(async (sign: 1 | -1) => {
    const target = resultLatex ?? mathRef.current?.getLatex() ?? latex;
    if (target.trim() === "") { setError("メモリに保存する値がありません"); return; }
    try {
      const value = await approximate(target, angleMode);
      setMemory((m) => (m ?? 0) + sign * value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "メモリに保存する値を計算できません");
    }
  }, [resultLatex, latex, angleMode]);

  // MathField が focus 中でないときだけ物理キーボードで補助入力を受ける
  // （focus 中は MathLive 本体が正しく処理してくれる）。
  useEffect(() => {
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
  }, [equals, clearAll]);

  // MathLiveの仮想キーボードはdocument.bodyへ全幅で追加されるのが既定のため、
  // PCレイアウトの左サイドメニューにまで被さって重なる不具合があった。
  // containerをdocument.body以外に差し替えると、MathLive側のCSSは
  // `.ML__keyboard { height: 100% }` をそのcontainerの実高さに依存して解決する。
  // 電卓の描画領域自体（相対配置div）をcontainerにする案は試したところ、
  // 祖先のflexレイアウトの都合でその領域の実高さが0扱いになり、キーボードが
  // 内部的にvisible=trueでも画面上は高さ0で完全に不可視になる不具合を実機再現した。
  // そのためcontainerは電卓の描画とは独立したposition:fixed（top/bottom:0で
  // ビューポート高さが常に確定する）専用のdivとし、幅と左端だけをResizeObserverで
  // 電卓の描画領域（サイドメニューを含まない範囲）に同期させる。
  useEffect(() => {
    const kb = window.mathVirtualKeyboard;
    const content = contentRef.current;
    const host = vkHostRef.current;
    if (!kb || !content || !host) return;
    kb.container = host;
    // 純正キーボードのタブ構成・キー配列だけをGOATask向けに差し替える
    // （筐体・スタイル・操作系はMathLive純正のまま）。グローバルシングルトンの
    // 設定なのでアンマウント時に既定へ戻す。
    kb.layouts = CALCULATOR_KEYBOARD_LAYOUTS;
    // PCはcontentRef（電卓の描画領域）の実測に幅・左端を同期させる。モバイルは
    // ページ外側の余白込みのcontentRef実測に合わせると狭くなる（体感の「キーボードが
    // 狭い」の原因）ため、ビューポート全幅に固定する。
    const sync = () => {
      if (isMobile) {
        host.style.left = "0px";
        host.style.width = "100%";
        return;
      }
      const rect = content.getBoundingClientRect();
      host.style.left = `${rect.left}px`;
      host.style.width = `${rect.width}px`;
    };
    sync();
    const resizeObserver = new ResizeObserver(sync);
    resizeObserver.observe(content);
    window.addEventListener("resize", sync);
    // キーボードの実際の表示/非表示（フォーカスによる自動表示・手動⌨トグル・
    // タブ離脱時のhideを含む）に同期してモバイル下部ナビの表示を切り替える。
    // フォーカス/blurではなくこのイベントに紐付けることで、⌨トグルで手動的に
    // 閉じたときにも正しくナビが復帰する（=ナビが消えたまま操作不能になる事故を防ぐ）。
    const handleToggle = () => onKeyboardVisibleChange?.(kb.visible);
    kb.addEventListener("virtual-keyboard-toggle", handleToggle);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", sync);
      kb.removeEventListener("virtual-keyboard-toggle", handleToggle);
      kb.container = null;
      kb.layouts = "default";
      onKeyboardVisibleChange?.(false);
    };
  }, [isMobile, onKeyboardVisibleChange]);

  const displayedResultLatex = useMemo(() => {
    if (showDecimal && resultDecimalLatex) return resultDecimalLatex;
    return resultLatex;
  }, [showDecimal, resultDecimalLatex, resultLatex]);

  const display = (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${isMobile ? "p-3" : "p-4"}`}>
      <div className="mb-1 flex min-h-8 items-center gap-2 text-[11px] font-semibold text-slate-400">
        <div className="flex items-center gap-2">
          <span title="三角関数の角度モード">角度 {angleMode}</span>
          {memory !== null && <span title={`メモリ: ${formatNumber(memory)}`}>M</span>}
        </div>
        <div className="ml-auto flex gap-1" aria-label="式のカーソル移動">
          <button onClick={() => moveCursor("left")} className="min-h-8 min-w-9 rounded-md bg-slate-100 text-sm text-slate-600 hover:bg-slate-200" aria-label="カーソルを左へ">←</button>
          <button onClick={() => moveCursor("right")} className="min-h-8 min-w-9 rounded-md bg-slate-100 text-sm text-slate-600 hover:bg-slate-200" aria-label="カーソルを右へ">→</button>
        </div>
      </div>
      {/* 編集中の式は MathLive の math-field。分数・√・上付き指数・|·|・カーソル・空スロット
          プレースホルダを全部組込みで扱う。Step 2で自前キーパッドを撤去した分、
          表示領域を広めに確保する（Phase 9-Dの「mathfield領域拡大」を吸収）。 */}
      <div className="min-h-[5rem] break-all text-left text-2xl text-slate-800 sm:min-h-[7rem] sm:text-3xl">
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
          onClick={() => { if (memory !== null) insertKey(formatNumber(memory)); }}
          disabled={memory === null}
          className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-300 disabled:opacity-40"
        >
          MR
        </button>
        <button
          onClick={() => void memoryAdd(1)}
          className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-300"
        >
          M+
        </button>
        <button
          onClick={() => void memoryAdd(-1)}
          className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-300"
        >
          M−
        </button>
      </div>
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
                mathRef.current?.setLatex(entry.latex);
                setLatex(entry.latex);
                setResultLatex(entry.resultLatex);
                setResultDecimalLatex(null);
                setError(null);
                justEvaluated.current = true;
              }}
              className="w-full rounded px-2 py-1 text-right text-sm hover:bg-slate-100"
              title="式と結果を復元"
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
    <div ref={contentRef} className="mx-auto max-w-5xl">
      {isMobile ? (
        <div className="space-y-2">
          {display}
          {calcToolbar}
          {mobileHistory}
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_240px] gap-4">
          <div className="space-y-3">
            {display}
            {calcToolbar}
            <p className="text-center text-[11px] text-slate-400">
              MathField 直接タイプ対応: 数字・演算子・関数名(sinなど)・Enter(=)・カーソル移動。フォーカスが外れているときは Enter/Esc のみ受け付け。
            </p>
          </div>
          <div>{historyPanel}</div>
        </div>
      )}
      {/* MathLive仮想キーボードの専用container。position:fixedでビューポート高さを
          確定させつつ、幅・左端だけをcontentRef実測値に同期する（詳細は上のuseEffect参照）。
          非表示中も含めpointer-events:noneなので他要素のクリックを妨げない
          （MathLive側が.MLK__plateにpointer-events:allを個別指定して上書きする）。 */}
      <div ref={vkHostRef} className="pointer-events-none fixed inset-y-0 z-40" />
    </div>
  );
}
