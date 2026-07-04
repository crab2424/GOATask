// 「計算」画面の入力欄1つで、方程式・微積分・複素数・文字式・数値式を自動判定して振り分ける
// （式判定の統合）。数値のみの式はCalculatorViewが既存の同期calculatorEngineで先に処理するため、
// evaluateAdvancedが呼ばれるのは =・文字式・微積分記法を含む場合のみ。
// nerdamer（約400KB）は必要になった時だけ動的importし、電卓の基本操作の初期表示速度を守る。
import { tokenize, isFunctionName, CONSTANT_NAMES } from "./calculatorEngine";
import { solveFreeEquation } from "./equationParser";

export class DispatchError extends Error {}

// lim/Σ/Π/∞/'（微分記法）は入力のみ対応で、計算ロジックは未実装。
// これらの記号はcalculatorEngineのトークナイザが認識できないため、
// 数値エンジンに渡す前に必ずここで弾く必要がある。
function hasCalculusMarker(expr: string): boolean {
  return (
    expr.includes("∫") ||
    expr.includes("Σ") ||
    expr.includes("Π") ||
    expr.includes("∞") ||
    expr.includes("lim(") ||
    expr.includes("d/dx(") ||
    expr.includes("'")
  );
}

function collectFreeVariables(tokens: ReturnType<typeof tokenize>): Set<string> {
  const vars = new Set<string>();
  for (const t of tokens) {
    if (t.kind === "ident" && !isFunctionName(t.value) && !CONSTANT_NAMES.has(t.value)) vars.add(t.value);
  }
  return vars;
}

/**
 * exprが数値式（=・文字式・微積分記法を含まない）かどうかを判定する。
 * trueなら呼び出し元は既存の同期evaluate()をそのまま使ってよい。
 */
export function isPlainNumeric(expr: string): boolean {
  if (expr.includes("=") || hasCalculusMarker(expr)) return false;
  try {
    return collectFreeVariables(tokenize(expr)).size === 0;
  } catch {
    // トークナイズできない式は既存の数値エンジンに渡し、そちらのエラー表示（位置情報付き）を再利用する
    return true;
  }
}

/** prefix( ... )suffix の中身を取り出す。括弧の対応が取れなければnull */
function unwrap(expr: string, prefix: string, suffix: string): string | null {
  if (!expr.startsWith(prefix)) return null;
  let depth = 0;
  for (let i = prefix.length - 1; i < expr.length; i++) {
    if (expr[i] === "(") depth++;
    else if (expr[i] === ")") {
      depth--;
      if (depth === 0) return expr.slice(i) === suffix ? expr.slice(prefix.length, i) : null;
    }
  }
  return null;
}

/** 数値以外（=・文字式・微積分記法）の式を判定し、適切なエンジンで評価する */
export async function evaluateAdvanced(expr: string): Promise<string> {
  const trimmed = expr.trim();
  if (trimmed === "") throw new DispatchError("式が空です");

  if (trimmed.includes("=")) {
    if (trimmed.indexOf("=") !== trimmed.lastIndexOf("=")) throw new DispatchError("=は1つだけ使えます");
    return solveFreeEquation(trimmed);
  }

  const diffInner = unwrap(trimmed, "d/dx(", ")");
  if (diffInner !== null) {
    const { differentiate } = await import("./analysisEngine");
    return differentiate(diffInner, "x");
  }

  const integralInner = unwrap(trimmed, "∫(", ")dx");
  if (integralInner !== null) {
    const { integrateIndefinite } = await import("./analysisEngine");
    return integrateIndefinite(integralInner, "x");
  }

  if (hasCalculusMarker(trimmed)) {
    throw new DispatchError("この記法（極限・総和・階乗微分など）はまだ入力のみ対応で、計算は未実装です");
  }

  let vars: Set<string>;
  try {
    vars = collectFreeVariables(tokenize(trimmed));
  } catch {
    vars = new Set(); // トークナイズできない式はnerdamer側の解釈に委ねる
  }

  if (vars.size === 1 && (vars.has("i") || vars.has("j"))) {
    const { calculateComplex } = await import("./analysisEngine");
    return calculateComplex(trimmed.replace(/j/g, "i"));
  }

  const { simplifyExpression } = await import("./analysisEngine");
  return simplifyExpression(trimmed);
}
