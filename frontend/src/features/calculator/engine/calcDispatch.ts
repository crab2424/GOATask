// 「計算」画面の入口。9-Cで旧自作エンジン(calculatorEngine/rationalEngine等)を全廃したため、
// 数値式・方程式・連立方程式・微積分・複素数・文字式すべてを Compute Engine 経由で評価する。
// このファイルは Compute Engine 実装（約400KB gzip）を動的importで遅延読み込みするための薄い
// ラッパー。電卓の初期表示速度を守るため、evaluateAdvanced/expand/factor が呼ばれた時点で
// はじめて computeEngineEvaluate.ts と @cortex-js/compute-engine が読み込まれる。
import type { AngleMode, ComputeResult } from "./computeEngineEvaluate";

export class DispatchError extends Error {}

/** 現在の式を評価する（数値式・方程式・連立・微積分・複素数・文字式すべて）。 */
export async function evaluateExpression(latex: string, angleMode: AngleMode): Promise<ComputeResult> {
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

/** メモリ加算のため、式を数値近似で得る。 */
export async function approximate(latex: string, angleMode: AngleMode): Promise<number> {
  if (latex.trim() === "") throw new DispatchError("式が空です");
  const { approximateAsNumber, ComputeEngineError } = await import("./computeEngineEvaluate");
  try {
    return approximateAsNumber(latex, angleMode);
  } catch (e) {
    if (e instanceof ComputeEngineError) throw new DispatchError(e.message);
    throw new DispatchError("数値化できませんでした");
  }
}
