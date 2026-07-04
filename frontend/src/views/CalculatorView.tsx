import { useCallback, useEffect, useRef, useState } from "react";
import { CalcError, evaluate, formatResult, type AngleMode } from "../lib/calculatorEngine";
import { useIsMobile } from "../lib/useIsMobile";

// 電卓内のサブモード。1画面に詰め込まず、モードごとにキーパッドを切り替える。
// standard以外は今後のセッションで実装する。
type CalcSubMode = "standard" | "function" | "equation" | "analysis";

const SUB_MODES: { id: CalcSubMode; label: string; ready: boolean }[] = [
  { id: "standard", label: "基本", ready: true },
  { id: "function", label: "関数", ready: true },
  { id: "equation", label: "方程式", ready: false },
  { id: "analysis", label: "解析", ready: false },
];

interface HistoryEntry {
  expression: string;
  result: string;
}

// キーパッド定義。insertは式に挿入する文字列。
type Key =
  | { type: "insert"; label: string; text: string; className?: string }
  | { type: "action"; label: string; action: "clear" | "backspace" | "equals" | "left" | "right"; className?: string };

const KEY_OP = "bg-slate-200 hover:bg-slate-300 text-slate-800";
const KEY_NUM = "bg-white hover:bg-slate-100 text-slate-900 border border-slate-200";
const KEY_ACCENT = "bg-slate-900 hover:bg-slate-700 text-white";

const STANDARD_KEYS: Key[][] = [
  [
    { type: "action", label: "AC", action: "clear", className: "bg-rose-100 hover:bg-rose-200 text-rose-700" },
    { type: "insert", label: "(", text: "(", className: KEY_OP },
    { type: "insert", label: ")", text: ")", className: KEY_OP },
    { type: "action", label: "⌫", action: "backspace", className: KEY_OP },
  ],
  [
    { type: "insert", label: "√", text: "√", className: KEY_OP },
    { type: "insert", label: "x^y", text: "^", className: KEY_OP },
    { type: "insert", label: "%", text: "%", className: KEY_OP },
    { type: "insert", label: "÷", text: "÷", className: KEY_OP },
  ],
  [
    { type: "insert", label: "7", text: "7", className: KEY_NUM },
    { type: "insert", label: "8", text: "8", className: KEY_NUM },
    { type: "insert", label: "9", text: "9", className: KEY_NUM },
    { type: "insert", label: "×", text: "×", className: KEY_OP },
  ],
  [
    { type: "insert", label: "4", text: "4", className: KEY_NUM },
    { type: "insert", label: "5", text: "5", className: KEY_NUM },
    { type: "insert", label: "6", text: "6", className: KEY_NUM },
    { type: "insert", label: "−", text: "-", className: KEY_OP },
  ],
  [
    { type: "insert", label: "1", text: "1", className: KEY_NUM },
    { type: "insert", label: "2", text: "2", className: KEY_NUM },
    { type: "insert", label: "3", text: "3", className: KEY_NUM },
    { type: "insert", label: "＋", text: "+", className: KEY_OP },
  ],
  [
    { type: "insert", label: "0", text: "0", className: KEY_NUM },
    { type: "insert", label: ".", text: ".", className: KEY_NUM },
    { type: "action", label: "←", action: "left", className: KEY_OP },
    { type: "action", label: "→", action: "right", className: KEY_OP },
  ],
  [
    { type: "action", label: "=", action: "equals", className: `${KEY_ACCENT} col-span-4` },
  ],
];

// 関数モードのキーパッド（5列）。数字・四則も含めて1画面に収める。
const FUNCTION_KEYS: Key[][] = [
  [
    { type: "insert", label: "sin", text: "sin(", className: KEY_OP },
    { type: "insert", label: "cos", text: "cos(", className: KEY_OP },
    { type: "insert", label: "tan", text: "tan(", className: KEY_OP },
    { type: "action", label: "AC", action: "clear", className: "bg-rose-100 hover:bg-rose-200 text-rose-700" },
    { type: "action", label: "⌫", action: "backspace", className: KEY_OP },
  ],
  [
    { type: "insert", label: "sin⁻¹", text: "asin(", className: KEY_OP },
    { type: "insert", label: "cos⁻¹", text: "acos(", className: KEY_OP },
    { type: "insert", label: "tan⁻¹", text: "atan(", className: KEY_OP },
    { type: "insert", label: "(", text: "(", className: KEY_OP },
    { type: "insert", label: ")", text: ")", className: KEY_OP },
  ],
  [
    { type: "insert", label: "log", text: "log(", className: KEY_OP },
    { type: "insert", label: "ln", text: "ln(", className: KEY_OP },
    { type: "insert", label: "√", text: "√", className: KEY_OP },
    { type: "insert", label: "x^y", text: "^", className: KEY_OP },
    { type: "insert", label: "x!", text: "!", className: KEY_OP },
  ],
  [
    { type: "insert", label: "nPr", text: "nPr(", className: KEY_OP },
    { type: "insert", label: "nCr", text: "nCr(", className: KEY_OP },
    { type: "insert", label: ",", text: ",", className: KEY_OP },
    { type: "insert", label: "π", text: "π", className: KEY_OP },
    { type: "insert", label: "e", text: "e", className: KEY_OP },
  ],
  [
    { type: "insert", label: "7", text: "7", className: KEY_NUM },
    { type: "insert", label: "8", text: "8", className: KEY_NUM },
    { type: "insert", label: "9", text: "9", className: KEY_NUM },
    { type: "insert", label: "÷", text: "÷", className: KEY_OP },
    { type: "insert", label: "%", text: "%", className: KEY_OP },
  ],
  [
    { type: "insert", label: "4", text: "4", className: KEY_NUM },
    { type: "insert", label: "5", text: "5", className: KEY_NUM },
    { type: "insert", label: "6", text: "6", className: KEY_NUM },
    { type: "insert", label: "×", text: "×", className: KEY_OP },
    { type: "action", label: "←", action: "left", className: KEY_OP },
  ],
  [
    { type: "insert", label: "1", text: "1", className: KEY_NUM },
    { type: "insert", label: "2", text: "2", className: KEY_NUM },
    { type: "insert", label: "3", text: "3", className: KEY_NUM },
    { type: "insert", label: "−", text: "-", className: KEY_OP },
    { type: "action", label: "→", action: "right", className: KEY_OP },
  ],
  [
    { type: "insert", label: "0", text: "0", className: KEY_NUM },
    { type: "insert", label: ".", text: ".", className: KEY_NUM },
    { type: "insert", label: "＋", text: "+", className: KEY_OP },
    { type: "action", label: "=", action: "equals", className: `${KEY_ACCENT} col-span-2` },
  ],
];

// 物理キーボード入力 → 挿入文字列の対応（PC向け）
const KEYBOARD_INSERT: Record<string, string> = {
  "0": "0", "1": "1", "2": "2", "3": "3", "4": "4",
  "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
  ".": ".", "+": "+", "-": "-", "*": "×", "/": "÷",
  "^": "^", "%": "%", "(": "(", ")": ")", "!": "!",
};

export function CalculatorView() {
  const isMobile = useIsMobile();
  const [subMode, setSubMode] = useState<CalcSubMode>("standard");
  const [expression, setExpression] = useState("");
  const [cursor, setCursor] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [angleMode, setAngleMode] = useState<AngleMode>("DEG");
  const [memory, setMemory] = useState<number | null>(null);
  // =直後に数字を打ったら新しい式を始める（実機電卓と同じ挙動）
  const justEvaluated = useRef(false);

  const insertText = useCallback((text: string) => {
    setError(null);
    if (justEvaluated.current) {
      justEvaluated.current = false;
      // 演算子なら結果に続けて計算、それ以外は新規入力
      if ("+-×÷^%!".includes(text) && result !== null) {
        setExpression(result + text);
        setCursor(result.length + text.length);
        return;
      }
      setResult(null);
      setExpression(text);
      setCursor(text.length);
      return;
    }
    setExpression(expression.slice(0, cursor) + text + expression.slice(cursor));
    setCursor(cursor + text.length);
  }, [expression, cursor, result]);

  const backspace = useCallback(() => {
    setError(null);
    justEvaluated.current = false;
    if (cursor === 0) return;
    setExpression((prev) => prev.slice(0, cursor - 1) + prev.slice(cursor));
    setCursor((c) => c - 1);
  }, [cursor]);

  const clearAll = useCallback(() => {
    setExpression("");
    setCursor(0);
    setResult(null);
    setError(null);
    justEvaluated.current = false;
  }, []);

  const moveCursor = useCallback((delta: number) => {
    justEvaluated.current = false;
    setCursor((c) => Math.max(0, Math.min(expression.length, c + delta)));
  }, [expression.length]);

  const equals = useCallback(() => {
    if (expression.trim() === "") return;
    try {
      const value = evaluate(expression, { angleMode });
      const formatted = formatResult(value);
      setResult(formatted);
      setError(null);
      setHistory((prev) => [{ expression, result: formatted }, ...prev].slice(0, 20));
      justEvaluated.current = true;
    } catch (e) {
      if (e instanceof CalcError) {
        setError(e.message);
        if (e.position !== undefined) setCursor(Math.min(e.position, expression.length));
      } else {
        setError("計算に失敗しました");
      }
    }
  }, [expression, angleMode]);

  // M+/M-: 表示中の結果（なければ現在の式を評価した値）をメモリに加減算する
  const memoryAdd = useCallback((sign: 1 | -1) => {
    let value: number;
    if (result !== null) {
      value = parseFloat(result);
    } else {
      try {
        value = evaluate(expression, { angleMode });
      } catch {
        setError("メモリに保存する値を計算できません");
        return;
      }
    }
    setMemory((m) => (m ?? 0) + sign * value);
  }, [result, expression, angleMode]);

  const handleKey = useCallback((key: Key) => {
    if (key.type === "insert") {
      insertText(key.text);
      return;
    }
    switch (key.action) {
      case "clear": clearAll(); break;
      case "backspace": backspace(); break;
      case "equals": equals(); break;
      case "left": moveCursor(-1); break;
      case "right": moveCursor(1); break;
    }
  }, [insertText, clearAll, backspace, equals, moveCursor]);

  // PC: 物理キーボード対応。他の入力欄にフォーカスがあるときは奪わない。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key in KEYBOARD_INSERT) {
        e.preventDefault();
        insertText(KEYBOARD_INSERT[e.key]);
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
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [insertText, equals, backspace, clearAll, moveCursor]);

  const display = (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-slate-400">
        {subMode === "function" && <span>{angleMode}</span>}
        {memory !== null && <span title={`メモリ: ${formatResult(memory)}`}>M</span>}
      </div>
      {/* 式表示: カーソル位置を自前描画して途中編集に対応 */}
      <div className="min-h-[2rem] break-all text-right font-mono text-xl text-slate-800">
        {expression === "" && <span className="text-slate-300">0</span>}
        <span>{expression.slice(0, cursor)}</span>
        <span className="inline-block h-5 w-0.5 animate-pulse rounded bg-slate-900 align-middle" />
        <span>{expression.slice(cursor)}</span>
      </div>
      <div className="mt-2 min-h-[2.5rem] text-right">
        {error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : (
          <p className="break-all font-mono text-3xl font-bold text-slate-900">
            {result !== null ? `= ${result}` : " "}
          </p>
        )}
      </div>
    </div>
  );

  const renderKeypad = (keys: Key[][], cols: 4 | 5) => (
    <div className={`grid gap-2 ${cols === 4 ? "grid-cols-4" : "grid-cols-5"}`}>
      {keys.flat().map((key, i) => (
        <button
          key={i}
          onClick={() => handleKey(key)}
          className={`rounded-lg py-3 font-medium transition-colors ${
            cols === 4 ? "text-lg" : "text-base"
          } ${key.className ?? KEY_NUM}`}
        >
          {key.label}
        </button>
      ))}
    </div>
  );

  // 関数モード専用: DEG/RAD切替とメモリ操作のツールバー
  const functionToolbar = (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setAngleMode((m) => (m === "DEG" ? "RAD" : "DEG"))}
        className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-300"
        title="角度モード切替"
      >
        {angleMode === "DEG" ? "DEG⇄" : "RAD⇄"}
      </button>
      <div className="ml-auto flex gap-1">
        <button
          onClick={() => setMemory(null)}
          disabled={memory === null}
          className="rounded-lg bg-slate-200 px-3 py-2 text-sm text-slate-800 hover:bg-slate-300 disabled:opacity-40"
        >
          MC
        </button>
        <button
          onClick={() => { if (memory !== null) insertText(formatResult(memory)); }}
          disabled={memory === null}
          className="rounded-lg bg-slate-200 px-3 py-2 text-sm text-slate-800 hover:bg-slate-300 disabled:opacity-40"
        >
          MR
        </button>
        <button
          onClick={() => memoryAdd(1)}
          className="rounded-lg bg-slate-200 px-3 py-2 text-sm text-slate-800 hover:bg-slate-300"
        >
          M+
        </button>
        <button
          onClick={() => memoryAdd(-1)}
          className="rounded-lg bg-slate-200 px-3 py-2 text-sm text-slate-800 hover:bg-slate-300"
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
                setExpression(entry.result);
                setCursor(entry.result.length);
                setResult(null);
                setError(null);
                justEvaluated.current = false;
              }}
              className="w-full rounded px-2 py-1 text-right font-mono text-sm hover:bg-slate-100"
              title="結果を式に読み込む"
            >
              <span className="text-slate-400">{entry.expression} =</span>{" "}
              <span className="font-semibold text-slate-800">{entry.result}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center gap-1 overflow-x-auto">
        {SUB_MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setSubMode(m.id)}
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

      {subMode === "standard" || subMode === "function" ? (
        (() => {
          const keypad =
            subMode === "standard" ? (
              renderKeypad(STANDARD_KEYS, 4)
            ) : (
              <>
                {functionToolbar}
                {renderKeypad(FUNCTION_KEYS, 5)}
              </>
            );
          return isMobile ? (
            <div className="space-y-3">
              {display}
              {keypad}
              {historyPanel}
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_240px] gap-4">
              <div className="space-y-3">
                {display}
                {keypad}
                <p className="text-center text-[11px] text-slate-400">
                  キーボード入力対応: 数字・演算子・関数名(sinなど)・Enter(=)・Backspace・Esc(AC)・←→(カーソル移動)
                </p>
              </div>
              <div>{historyPanel}</div>
            </div>
          );
        })()
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          「{SUB_MODES.find((m) => m.id === subMode)?.label}」モードは次回実装予定です
        </div>
      )}
    </div>
  );
}
