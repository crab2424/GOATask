// MathLive の LaTeX 出力を Compute Engine（@cortex-js/compute-engine）へ直接渡し、
// 方程式・微積分・複素数・文字式（数値のみの式以外すべて）を評価する。
// 数値のみの式は呼び出し元（CalculatorView）が既存の同期 calculatorEngine で先に処理するため、
// ここに渡ってくるのは =・変数・∫/Σ/Π/lim 等の記法を含む式のみ。
//
// 旧実装（equationParser の自作解の公式 + nerdamer 経由の analysisEngine）はここで完全に置き換える。
// latexBridge.ts（自作の線形文字列変換）も経由しない — Compute Engine は LaTeX を直接パースできるため、
// 独自の中間表現に落とす手間と、そこで生じる非対応コマンドの誤爆リスクを避けられる。
import { ComputeEngine, expand as ceExpand, factor as ceFactor } from "@cortex-js/compute-engine";
import type { AngleMode } from "./calculatorEngine";

export class ComputeEngineError extends Error {}

let engine: ComputeEngine | null = null;

function getEngine(): ComputeEngine {
  if (!engine) {
    engine = new ComputeEngine();
    // 既存 calculatorEngine の formatResult は桁区切りを入れないため表記を揃える
    engine.latexOptions.digitGroupSeparator = "";
    // 積の記号は既存キーパッド（×キー = \times）と揃え、暗黙の積は自然表記（2x）のまま
    // にする（デフォルト値だがバージョン更新での既定値変化に備えて明示しておく）。
    engine.latexOptions.multiply = "\\times";
    engine.latexOptions.invisibleMultiply = "";
    // N()（小数近似）の表記ポリシー: 循環小数のvinculum表記(0.\overline{3})は電卓の表示として
    // 見慣れないため無効化し、既存calculatorEngineのformatResult(12桁)と揃うよう12桁に統一する。
    engine.latexOptions.repeatingDecimal = "none";
    engine.latexOptions.fractionalDigits = 12;
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

/** 表示フォーマット層の評価結果。exactは厳密値（分数・√・π等を保持したLaTeX）、
 * decimalはN()による小数近似のLaTeX。厳密値と数値上一致する場合（整数解など）は
 * トグルを出す意味がないためnullにする（rationalEngineのpickFractionDisplayと同じ考え方）。 */
export interface ComputeResult {
  exact: string;
  decimal: string | null;
}

function withDecimal(exact: string, exprForDecimal: BoxedExpression): ComputeResult {
  try {
    const decimalLatex = exprForDecimal.N().latex;
    return { exact, decimal: decimalLatex === exact ? null : decimalLatex };
  } catch {
    // N()が失敗しても厳密値は既に得られているので、小数トグルなしで表示は続行する
    return { exact, decimal: null };
  }
}

/** =を含む式（方程式）を解く。未知数0個は恒等式/矛盾の真偽値、1個は解、2個以上は非対応。 */
function solveEquation(expr: BoxedExpression): ComputeResult {
  const unknowns = expr.unknowns;
  if (unknowns.length === 0) {
    const evaluated = expr.evaluate();
    assertValid(evaluated, "式を評価できませんでした");
    // \top(恒等式)/\bot(矛盾)の真偽値には小数近似の概念がない
    return { exact: evaluated.latex, decimal: null };
  }
  if (unknowns.length > 1) {
    throw new ComputeEngineError("複数の未知数を含む方程式は計算タブでは未対応です");
  }
  const solutions = expr.solve(unknowns[0]);
  if (!Array.isArray(solutions) || solutions.length === 0) {
    throw new ComputeEngineError("解が見つかりませんでした");
  }
  // solve()の型は複数変数(配列で渡した場合)のRecord<string,Expression>[]も含むが、
  // ここではunknowns[0]という文字列1つだけを渡しているため実際は常にExpression[]が返る。
  const roots = solutions as unknown as ReadonlyArray<BoxedExpression>;
  const exact = roots.map((s) => s.latex).join(",\\ ");
  try {
    const decimal = roots.map((s) => s.N().latex).join(",\\ ");
    return { exact, decimal: decimal === exact ? null : decimal };
  } catch {
    return { exact, decimal: null };
  }
}

/**
 * LaTeX を評価し、厳密値と小数近似の両方をLaTeX文字列で返す（すでに組版済みの形なのでそのまま表示に使える）。
 * 方程式（=を含む）は solve、それ以外は evaluate（厳密評価）し、まだ変数が残っていれば
 * simplify も試みる（sin²+cos²=1 のような恒等式はevaluateだけでは畳み込まれないため）。
 */
export function evaluateWithComputeEngine(latex: string, angleMode: AngleMode): ComputeResult {
  const ce = getEngine();
  ce.angularUnit = angleMode === "DEG" ? "deg" : "rad";

  const expr = ce.parse(latex);
  assertValid(expr, "式を解釈できませんでした");

  if (expr.operator === "Equal") return solveEquation(expr);

  const evaluated = expr.evaluate();
  assertValid(evaluated, "計算できませんでした");
  const result = evaluated.unknowns.length > 0 ? evaluated.simplify() : evaluated;
  assertValid(result, "計算できませんでした");
  return withDecimal(result.latex, result);
}

/**
 * 式を展開する（(x+1)^2 → x^2+2x+1 等）。展開できない式（数値のみ・関数呼び出し等）は
 * 無変化のまま返る（Compute Engine自体がno-opとして扱うため、ここでは例外を投げない）。
 * expand/factorはデフォルトエンジン（getDefaultEngine）を使う自由関数だが、既にboxed済みの
 * 式を渡すとその式が属するエンジン（=getEngine()）の設定（桁区切り等）がそのまま使われる。
 */
export function expandWithComputeEngine(latex: string): string {
  const ce = getEngine();
  const expr = ce.parse(latex);
  assertValid(expr, "式を解釈できませんでした");
  const result = ceExpand(expr);
  assertValid(result, "展開できませんでした");
  return result.latex;
}

/** 式を因数分解する（x^2-1 → (x-1)(x+1) 等）。展開できない式と同様、非対応の式は無変化で返る。 */
export function factorWithComputeEngine(latex: string): string {
  const ce = getEngine();
  const expr = ce.parse(latex);
  assertValid(expr, "式を解釈できませんでした");
  const result = ceFactor(expr);
  assertValid(result, "因数分解できませんでした");
  return result.latex;
}
