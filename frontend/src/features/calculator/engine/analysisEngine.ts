// 解析サブモード用エンジン。記号計算（微積分・多項式・複素数）はnerdamerに委譲する。
// 電卓の基本・関数モードは自作のcalculatorEngineを使う（ハイブリッド方針）。
import nerdamer from "nerdamer";
import "nerdamer/Calculus";
import "nerdamer/Algebra";

export type AnalysisOperation =
  | "diff"
  | "integrate"
  | "defint"
  | "expand"
  | "simplify"
  | "complex";

export const ANALYSIS_OPERATIONS: { id: AnalysisOperation; label: string; hint: string }[] = [
  { id: "diff", label: "微分", hint: "例: x^3+sin(x) → 3x^2+cos(x)" },
  { id: "integrate", label: "不定積分", hint: "例: x^2 → x^3/3 + C" },
  { id: "defint", label: "定積分", hint: "例: x^2 を 0〜1 → 1/3" },
  { id: "expand", label: "展開", hint: "例: (x+1)^3 → x^3+3x^2+3x+1" },
  { id: "simplify", label: "簡約", hint: "例: (x^2-1)/(x-1) → x+1" },
  { id: "complex", label: "複素数", hint: "例: (2+3i)(1-i) → 5+i" },
];

export class AnalysisError extends Error {}

/** ユーザー入力をnerdamerが解釈できる形式に正規化する */
function preprocess(expr: string): string {
  let s = expr
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/π/g, "pi")
    .replace(/√/g, "sqrt");
  // 暗黙の乗算を補う: 3x → 3*x, 2( → 2*(, )( → )*(
  s = s.replace(/(\d)([a-zA-Z(])/g, "$1*$2").replace(/\)(\d|[a-zA-Z(])/g, ")*$1");
  return s;
}

/** nerdamerの出力を読みやすく整える */
function postprocess(result: string): string {
  return result.replace(/\*/g, "·");
}

function run(input: string): string {
  try {
    return nerdamer(input).toString();
  } catch (e) {
    throw new AnalysisError(
      `式を計算できませんでした（${e instanceof Error ? e.message : "不明なエラー"}）`,
    );
  }
}

function validateVariable(variable: string): string {
  const v = variable.trim() || "x";
  if (!/^[a-zA-Z]$/.test(v)) throw new AnalysisError("変数は英字1文字で指定してください");
  if (v === "i" || v === "e") throw new AnalysisError(`${v}は定数のため変数に使えません`);
  return v;
}

export function differentiate(expr: string, variable: string): string {
  const v = validateVariable(variable);
  return postprocess(run(`diff(${preprocess(expr)}, ${v})`));
}

export function integrateIndefinite(expr: string, variable: string): string {
  const v = validateVariable(variable);
  const result = run(`integrate(${preprocess(expr)}, ${v})`);
  if (result.includes("integrate")) {
    throw new AnalysisError("この式の不定積分は求められませんでした");
  }
  return `${postprocess(result)} + C`;
}

export function integrateDefinite(
  expr: string,
  lower: string,
  upper: string,
  variable: string,
): string {
  const v = validateVariable(variable);
  const a = preprocess(lower.trim());
  const b = preprocess(upper.trim());
  if (a === "" || b === "") throw new AnalysisError("積分区間を入力してください");
  const input = `defint(${preprocess(expr)}, ${a}, ${b}, ${v})`;
  const symbolic = run(input);
  if (!symbolic.includes("defint")) return postprocess(symbolic);
  // 記号的に解けない場合は数値積分の結果にフォールバック
  try {
    const numeric = nerdamer(input).evaluate().text("decimals");
    if (numeric.includes("defint")) throw new AnalysisError("この定積分は計算できませんでした");
    return `≈ ${numeric}`;
  } catch (e) {
    if (e instanceof AnalysisError) throw e;
    throw new AnalysisError("この定積分は計算できませんでした");
  }
}

export function expandExpression(expr: string): string {
  return postprocess(run(`expand(${preprocess(expr)})`));
}

export function simplifyExpression(expr: string): string {
  return postprocess(run(`simplify(${preprocess(expr)})`));
}

/** 複素数式を a+bi 形式に整理する */
export function calculateComplex(expr: string): string {
  return postprocess(run(`expand(simplify(${preprocess(expr)}))`));
}
