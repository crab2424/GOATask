import { useState } from "react";
import {
  solveQuadratic,
  solveLinearSystem,
  type QuadraticResult,
  type LinearSystemResult,
} from "../lib/equationSolver";

// 方程式サブモード: 係数入力フォーム型（式を打つのではなく係数を埋める方式）
type EquationType = "quadratic" | "linear2" | "linear3";

const EQUATION_TYPES: { id: EquationType; label: string }[] = [
  { id: "quadratic", label: "二次方程式" },
  { id: "linear2", label: "連立（2元）" },
  { id: "linear3", label: "連立（3元）" },
];

const VAR_NAMES = ["x", "y", "z"];

function parseCoef(s: string, name: string): number {
  const trimmed = s.trim();
  if (trimmed === "") throw new Error(`${name} を入力してください`);
  const v = Number(trimmed);
  if (Number.isNaN(v)) throw new Error(`${name} が数値ではありません`);
  return v;
}

const INPUT_CLASS =
  "w-16 rounded border border-slate-300 px-1.5 py-1 text-center font-mono text-sm focus:border-slate-500 focus:outline-none";

export function CalculatorEquationPanel() {
  const [eqType, setEqType] = useState<EquationType>("quadratic");
  // 二次方程式の係数 a,b,c
  const [quadCoefs, setQuadCoefs] = useState<string[]>(["", "", ""]);
  // 連立方程式の拡大係数（3元分確保して2元では左上2×2+右辺だけ使う）
  const [linCoefs, setLinCoefs] = useState<string[][]>(
    Array.from({ length: 3 }, () => ["", "", "", ""]),
  );
  const [quadResult, setQuadResult] = useState<QuadraticResult | null>(null);
  const [linResult, setLinResult] = useState<LinearSystemResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const size = eqType === "linear2" ? 2 : 3;

  const solve = () => {
    setError(null);
    setQuadResult(null);
    setLinResult(null);
    try {
      if (eqType === "quadratic") {
        const [a, b, c] = quadCoefs.map((s, i) => parseCoef(s, ["a", "b", "c"][i]));
        setQuadResult(solveQuadratic(a, b, c));
      } else {
        const coefficients = Array.from({ length: size }, (_, row) =>
          Array.from({ length: size }, (_, col) =>
            parseCoef(linCoefs[row][col], `${row + 1}番目の式の${VAR_NAMES[col]}の係数`),
          ),
        );
        const constants = Array.from({ length: size }, (_, row) =>
          parseCoef(linCoefs[row][3], `${row + 1}番目の式の右辺`),
        );
        setLinResult(solveLinearSystem(coefficients, constants));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "計算に失敗しました");
    }
  };

  const setLinCoef = (row: number, col: number, value: string) => {
    setLinCoefs((prev) => prev.map((r, i) => (i === row ? r.map((c, j) => (j === col ? value : c)) : r)));
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto">
        {EQUATION_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => { setEqType(t.id); setError(null); setQuadResult(null); setLinResult(null); }}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              eqType === t.id
                ? "bg-slate-200 font-semibold text-slate-900"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {eqType === "quadratic" ? (
          <div className="flex flex-wrap items-center gap-1 font-mono text-sm">
            <input value={quadCoefs[0]} onChange={(e) => setQuadCoefs([e.target.value, quadCoefs[1], quadCoefs[2]])} placeholder="a" className={INPUT_CLASS} inputMode="decimal" />
            <span>x² +</span>
            <input value={quadCoefs[1]} onChange={(e) => setQuadCoefs([quadCoefs[0], e.target.value, quadCoefs[2]])} placeholder="b" className={INPUT_CLASS} inputMode="decimal" />
            <span>x +</span>
            <input value={quadCoefs[2]} onChange={(e) => setQuadCoefs([quadCoefs[0], quadCoefs[1], e.target.value])} placeholder="c" className={INPUT_CLASS} inputMode="decimal" />
            <span>= 0</span>
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: size }, (_, row) => (
              <div key={row} className="flex flex-wrap items-center gap-1 font-mono text-sm">
                {Array.from({ length: size }, (_, col) => (
                  <span key={col} className="flex items-center gap-1">
                    {col > 0 && <span>+</span>}
                    <input
                      value={linCoefs[row][col]}
                      onChange={(e) => setLinCoef(row, col, e.target.value)}
                      placeholder={String.fromCharCode(97 + col)}
                      className={INPUT_CLASS}
                      inputMode="decimal"
                    />
                    <span>{VAR_NAMES[col]}</span>
                  </span>
                ))}
                <span>=</span>
                <input
                  value={linCoefs[row][3]}
                  onChange={(e) => setLinCoef(row, 3, e.target.value)}
                  placeholder="d"
                  className={INPUT_CLASS}
                  inputMode="decimal"
                />
              </div>
            ))}
          </div>
        )}

        <button
          onClick={solve}
          className="mt-4 w-full rounded-lg bg-slate-900 py-2.5 font-medium text-white transition-colors hover:bg-slate-700"
        >
          解く
        </button>
      </div>

      {(error || quadResult || linResult) && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {error && <p className="text-sm text-rose-600">{error}</p>}
          {quadResult && (
            <div className="space-y-1 font-mono text-sm">
              <p className="text-xs text-slate-400">
                判別式 D = {quadResult.discriminant}
                {quadResult.kind === "two-real" && "（異なる2つの実数解）"}
                {quadResult.kind === "double" && "（重解）"}
                {quadResult.kind === "complex" && "（共役な複素数解）"}
              </p>
              {quadResult.kind === "double" ? (
                <p className="text-lg font-semibold">x = {quadResult.roots[0]}</p>
              ) : (
                <>
                  <p className="text-lg font-semibold">x₁ = {quadResult.roots[0]}</p>
                  <p className="text-lg font-semibold">x₂ = {quadResult.roots[1]}</p>
                </>
              )}
            </div>
          )}
          {linResult && (
            <div className="font-mono text-sm">
              {linResult.kind === "unique" ? (
                <div className="space-y-1">
                  {linResult.values.map((v, i) => (
                    <p key={i} className="text-lg font-semibold">
                      {VAR_NAMES[i]} = {v}
                    </p>
                  ))}
                </div>
              ) : linResult.kind === "none" ? (
                <p className="text-slate-600">解なし（矛盾する方程式が含まれています）</p>
              ) : (
                <p className="text-slate-600">解が無数にあります（方程式が独立していません）</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
