// MathLive の LaTeX 出力を Compute Engine（@cortex-js/compute-engine）へ直接渡し、
// 方程式・微積分・複素数・文字式（数値のみの式以外すべて）を評価する。
// 数値のみの式は呼び出し元（CalculatorView）が既存の同期 calculatorEngine で先に処理するため、
// ここに渡ってくるのは =・変数・∫/Σ/Π/lim 等の記法を含む式のみ。
//
// 旧実装（equationParser の自作解の公式 + nerdamer 経由の analysisEngine）はここで完全に置き換える。
// latexBridge.ts（自作の線形文字列変換）も経由しない — Compute Engine は LaTeX を直接パースできるため、
// 独自の中間表現に落とす手間と、そこで生じる非対応コマンドの誤爆リスクを避けられる。
import { ComputeEngine } from "@cortex-js/compute-engine";
import type { AngleMode } from "./calculatorEngine";

export class ComputeEngineError extends Error {}

let engine: ComputeEngine | null = null;

function getEngine(): ComputeEngine {
  if (!engine) {
    engine = new ComputeEngine();
    // 既存 calculatorEngine の formatResult は桁区切りを入れないため表記を揃える
    engine.latexOptions.digitGroupSeparator = "";
  }
  return engine;
}

// ComputeEngine.parseはlatexにnullを渡すオーバーロードがExpression | nullを返すため、
// NonNullableで確実に非null版のBoxedExpression型を取る。
type BoxedExpression = NonNullable<ReturnType<ComputeEngine["parse"]>>;

function describeErrors(expr: BoxedExpression): string {
  return expr.errors.map((e) => e.toString()).join(", ");
}

function assertValid(expr: BoxedExpression, prefix: string): void {
  if (!expr.isValid) {
    const detail = describeErrors(expr);
    throw new ComputeEngineError(`${prefix}${detail ? `（${detail}）` : ""}`);
  }
}

/** =を含む式（方程式）を解く。未知数0個は恒等式/矛盾の真偽値、1個は解、2個以上は非対応。 */
function solveEquation(expr: BoxedExpression): string {
  const unknowns = expr.unknowns;
  if (unknowns.length === 0) {
    const evaluated = expr.evaluate();
    assertValid(evaluated, "式を評価できませんでした");
    return evaluated.latex;
  }
  if (unknowns.length > 1) {
    throw new ComputeEngineError("複数の未知数を含む方程式は計算タブでは未対応です");
  }
  const solutions = expr.solve(unknowns[0]);
  if (!Array.isArray(solutions) || solutions.length === 0) {
    throw new ComputeEngineError("解が見つかりませんでした");
  }
  return solutions.map((s) => s.latex).join(",\\ ");
}

/**
 * LaTeX を評価し、結果を LaTeX 文字列で返す（すでに組版済みの形なのでそのまま表示に使える）。
 * 方程式（=を含む）は solve、それ以外は evaluate（厳密評価）し、まだ変数が残っていれば
 * simplify も試みる（sin²+cos²=1 のような恒等式はevaluateだけでは畳み込まれないため）。
 */
export function evaluateWithComputeEngine(latex: string, angleMode: AngleMode): string {
  const ce = getEngine();
  ce.angularUnit = angleMode === "DEG" ? "deg" : "rad";

  const expr = ce.parse(latex);
  assertValid(expr, "式を解釈できませんでした");

  if (expr.operator === "Equal") return solveEquation(expr);

  const evaluated = expr.evaluate();
  assertValid(evaluated, "計算できませんでした");
  const result = evaluated.unknowns.length > 0 ? evaluated.simplify() : evaluated;
  assertValid(result, "計算できませんでした");
  return result.latex;
}
