import { useState } from "react";
import {
  ANALYSIS_OPERATIONS,
  AnalysisError,
  calculateComplex,
  differentiate,
  expandExpression,
  integrateDefinite,
  integrateIndefinite,
  simplifyExpression,
  type AnalysisOperation,
} from "../lib/analysisEngine";

const INPUT_CLASS =
  "w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm focus:border-slate-500 focus:outline-none";

// 解析サブモード: 記号計算（微積分・展開・簡約・複素数）。nerdamerに委譲。
export function CalculatorAnalysisPanel() {
  const [operation, setOperation] = useState<AnalysisOperation>("diff");
  const [expression, setExpression] = useState("");
  const [variable, setVariable] = useState("x");
  const [lower, setLower] = useState("");
  const [upper, setUpper] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needsVariable = operation === "diff" || operation === "integrate" || operation === "defint";
  const opInfo = ANALYSIS_OPERATIONS.find((o) => o.id === operation)!;

  const calculate = () => {
    setError(null);
    setResult(null);
    if (expression.trim() === "") {
      setError("式を入力してください");
      return;
    }
    try {
      switch (operation) {
        case "diff": setResult(differentiate(expression, variable)); break;
        case "integrate": setResult(integrateIndefinite(expression, variable)); break;
        case "defint": setResult(integrateDefinite(expression, lower, upper, variable)); break;
        case "expand": setResult(expandExpression(expression)); break;
        case "simplify": setResult(simplifyExpression(expression)); break;
        case "complex": setResult(calculateComplex(expression)); break;
      }
    } catch (e) {
      setError(e instanceof AnalysisError ? e.message : "計算に失敗しました");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto">
        {ANALYSIS_OPERATIONS.map((op) => (
          <button
            key={op.id}
            onClick={() => { setOperation(op.id); setError(null); setResult(null); }}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              operation === op.id
                ? "bg-slate-200 font-semibold text-slate-900"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {op.label}
          </button>
        ))}
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">式</label>
          <input
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") calculate(); }}
            placeholder={opInfo.hint}
            className={INPUT_CLASS}
          />
        </div>

        <div className="flex gap-3">
          {needsVariable && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">変数</label>
              <input
                value={variable}
                onChange={(e) => setVariable(e.target.value)}
                className={`${INPUT_CLASS} w-16 text-center`}
                maxLength={1}
              />
            </div>
          )}
          {operation === "defint" && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">下端 a</label>
                <input
                  value={lower}
                  onChange={(e) => setLower(e.target.value)}
                  placeholder="0"
                  className={`${INPUT_CLASS} w-20 text-center`}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">上端 b</label>
                <input
                  value={upper}
                  onChange={(e) => setUpper(e.target.value)}
                  placeholder="π"
                  className={`${INPUT_CLASS} w-20 text-center`}
                />
              </div>
            </>
          )}
        </div>

        <button
          onClick={calculate}
          className="w-full rounded-lg bg-slate-900 py-2.5 font-medium text-white transition-colors hover:bg-slate-700"
        >
          計算
        </button>

        <p className="text-[11px] text-slate-400">
          記法: x^2（累乗）、sin(x)・cos(x)・log(x)・sqrt(x)、π、複素数はi（例: 2+3i）。
          3xのような暗黙の乗算にも対応。
        </p>
      </div>

      {(error || result !== null) && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {error ? (
            <p className="text-sm text-rose-600">{error}</p>
          ) : (
            <p className="break-all font-mono text-lg font-semibold text-slate-900">{result}</p>
          )}
        </div>
      )}
    </div>
  );
}
