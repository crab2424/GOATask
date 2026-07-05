// 「計算」画面の入力欄1つで、方程式・微積分・複素数・文字式・数値式を自動判定して振り分ける
// （式判定の統合）。数値のみの式はCalculatorViewが既存の同期calculatorEngineで先に処理するため、
// evaluateAdvancedが呼ばれるのは =・文字式・微積分記法を含む場合のみ。
// Compute Engine（@cortex-js/compute-engine、約100〜200KB）は必要になった時だけ動的importし、
// 電卓の基本操作（数値のみの式）の初期表示速度を守る。
import { tokenize, isFunctionName, CONSTANT_NAMES, type AngleMode } from "./calculatorEngine";
import type { ComputeResult } from "./computeEngineEvaluate";

export class DispatchError extends Error {}

function collectFreeVariables(tokens: ReturnType<typeof tokenize>): Set<string> {
  const vars = new Set<string>();
  for (const t of tokens) {
    if (t.kind === "ident" && !isFunctionName(t.value) && !CONSTANT_NAMES.has(t.value)) vars.add(t.value);
  }
  return vars;
}

// linearに"∞"(\inftyの変換先)や"'"(プライム記法)が含まれる場合、既存の数値エンジン
// （calculatorEngineのトークナイザ）はこれらを解釈できないためCompute Engine側に回す。
// ∫/Σ/Π/lim等のLaTeXコマンドはlatexToLinearの時点でUnsupportedLatexErrorとして弾かれ
// （latexBridge.tsのCMD_FUNC/CMD_SYMBOLに未登録）、そもそもlinear文字列には現れない。
function hasUnsupportedNumericMarker(expr: string): boolean {
  return expr.includes("∞") || expr.includes("'");
}

/**
 * exprが数値式（=・文字式・∞・プライム記法を含まない）かどうかを判定する。
 * trueなら呼び出し元は既存の同期evaluate()をそのまま使ってよい。
 */
export function isPlainNumeric(expr: string): boolean {
  if (expr.includes("=") || hasUnsupportedNumericMarker(expr)) return false;
  try {
    return collectFreeVariables(tokenize(expr)).size === 0;
  } catch {
    // トークナイズできない式は既存の数値エンジンに渡し、そちらのエラー表示（位置情報付き）を再利用する
    return true;
  }
}

/**
 * 数値のみの式以外（方程式・微積分・複素数・文字式）を Compute Engine で評価する。
 * latexはMathFieldが出力する生のLaTeX（latexToLinearを経由しない）。
 * 戻り値は厳密値(exact)と小数近似(decimal、無意味なら null)の組（表示フォーマット層）。
 */
export async function evaluateAdvanced(latex: string, angleMode: AngleMode): Promise<ComputeResult> {
  if (latex.trim() === "") throw new DispatchError("式が空です");
  const { evaluateWithComputeEngine, ComputeEngineError } = await import("./computeEngineEvaluate");
  try {
    return evaluateWithComputeEngine(latex, angleMode);
  } catch (e) {
    if (e instanceof ComputeEngineError) throw new DispatchError(e.message);
    throw new DispatchError("計算に失敗しました");
  }
}

/** 現在の式を展開する（=ボタンとは別の明示的なアクション）。 */
export async function expandExpression(latex: string): Promise<string> {
  if (latex.trim() === "") throw new DispatchError("式が空です");
  const { expandWithComputeEngine, ComputeEngineError } = await import("./computeEngineEvaluate");
  try {
    return expandWithComputeEngine(latex);
  } catch (e) {
    if (e instanceof ComputeEngineError) throw new DispatchError(e.message);
    throw new DispatchError("展開に失敗しました");
  }
}

/** 現在の式を因数分解する。 */
export async function factorExpression(latex: string): Promise<string> {
  if (latex.trim() === "") throw new DispatchError("式が空です");
  const { factorWithComputeEngine, ComputeEngineError } = await import("./computeEngineEvaluate");
  try {
    return factorWithComputeEngine(latex);
  } catch (e) {
    if (e instanceof ComputeEngineError) throw new DispatchError(e.message);
    throw new DispatchError("因数分解に失敗しました");
  }
}
