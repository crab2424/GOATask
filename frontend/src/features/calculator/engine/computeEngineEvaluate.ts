// MathLive の LaTeX 出力を Compute Engine（@cortex-js/compute-engine）へ直接渡し、
// 数値式・方程式・連立方程式・微積分・複素数・文字式すべてを一本化して評価する。
// 9-Cで旧自作エンジン（calculatorEngine/rationalEngine/equationSolver/latexBridge）とnerdamerを廃止し、
// Compute Engineがフロント計算の唯一の入口になった。数値式の場合も同じパスを通る。
import { CancellationError, ComputeEngine, expand as ceExpand, factor as ceFactor } from "@cortex-js/compute-engine";
import type { ExpressionInput } from "@cortex-js/compute-engine";

/** 三角関数の角度モード。旧calculatorEngineから移設。 */
export type AngleMode = "DEG" | "RAD";

export class ComputeEngineError extends Error {}

let engine: ComputeEngine | null = null;

function getEngine(): ComputeEngine {
  if (!engine) {
    engine = new ComputeEngine();
    // 重い式で UI が長時間固まるのを避ける。Compute Engine 既定値も 2000ms だが、
    // GOATask 側の計算ポリシーとして明示し、CancellationError を下で専用メッセージへ変換する。
    engine.timeLimit = 2000;
    // 桁区切りは電卓表示には不要（旧formatResultの慣習を維持）
    engine.latexOptions.digitGroupSeparator = "";
    // 積の記号は既存キーパッド（×キー = \times）と揃え、暗黙の積は自然表記（2x）のまま
    // にする（デフォルト値だがバージョン更新での既定値変化に備えて明示しておく）。
    engine.latexOptions.multiply = "\\times";
    engine.latexOptions.invisibleMultiply = "";
    // N()（小数近似）の表記ポリシー: 循環小数のvinculum表記(0.\overline{3})は電卓の表示として
    // 見慣れないため無効化し、旧formatResult(12桁)と揃うよう12桁に統一する。
    engine.latexOptions.repeatingDecimal = "none";
    engine.latexOptions.fractionalDigits = 12;
  }
  return engine;
}

// ComputeEngine.parseはlatexにnullを渡すオーバーロードがExpression | nullを返すため、
// NonNullableで確実に非null版のBoxedExpression型を取る。
type BoxedExpression = NonNullable<ReturnType<ComputeEngine["parse"]>>;
type JsonValue = string | number | boolean | null | readonly JsonValue[];

function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function asOperator(value: JsonValue): string | null {
  return isJsonArray(value) && typeof value[0] === "string" ? value[0] : null;
}

function isStructurallyZero(value: JsonValue): boolean {
  if (value === 0) return true;
  if (!isJsonArray(value)) return false;
  const operator = asOperator(value);
  if (operator === "Negate") return isStructurallyZero(value[1]);
  if (operator === "Divide") return isStructurallyZero(value[1]);
  if (operator === "Multiply") return value.slice(1).some(isStructurallyZero);
  if (operator === "Power") return value[1] === 0;
  return false;
}

function normalizeAdditiveZeros(json: JsonValue): JsonValue {
  if (!isJsonArray(json)) return json;

  const operator = asOperator(json);
  const normalized = json.map(normalizeAdditiveZeros);
  if (operator !== "Add") return normalized;

  const terms = normalized.slice(1).filter((term) => !isStructurallyZero(term));
  if (terms.length === 0) return 0;
  if (terms.length === 1) return terms[0];
  return ["Add", ...terms];
}

function normalizeEvaluatedExpression(ce: ComputeEngine, expr: BoxedExpression): BoxedExpression {
  const normalizedJson = normalizeAdditiveZeros(expr.json as JsonValue);
  return ce.box(normalizedJson as ExpressionInput);
}

function withComputeEngineErrors<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof CancellationError) {
      throw new ComputeEngineError("計算がタイムアウトしました。式を分けるか、少し単純な形で入力してください");
    }
    throw e;
  }
}

function negateJson(value: JsonValue): JsonValue {
  return ["Negate", value];
}

function multiplyJson(...values: JsonValue[]): JsonValue {
  return ["Multiply", ...values];
}

function addJson(...values: JsonValue[]): JsonValue {
  return ["Add", ...values];
}

function powerJson(base: JsonValue, exponent: number): JsonValue {
  return ["Power", base, exponent];
}

function splitLeadingNegate(value: JsonValue): { sign: 1 | -1; value: JsonValue } {
  if (isJsonArray(value) && asOperator(value) === "Negate") return { sign: -1, value: value[1] };
  return { sign: 1, value };
}

function numericInteger(value: JsonValue): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function matchCube(value: JsonValue): JsonValue | null {
  const n = numericInteger(value);
  if (n !== null) {
    const root = Math.cbrt(n);
    return Number.isInteger(root) ? root : null;
  }
  if (isJsonArray(value) && asOperator(value) === "Power" && value[2] === 3) return value[1];
  return null;
}

function factorCubePairJson(json: JsonValue): JsonValue | null {
  if (!isJsonArray(json) || asOperator(json) !== "Add" || json.length !== 3) return null;

  const left = splitLeadingNegate(json[1]);
  const right = splitLeadingNegate(json[2]);
  const a = matchCube(left.value);
  const b = matchCube(right.value);
  if (!a || !b || left.sign !== 1) return null;

  if (right.sign === 1) {
    // a^3 + b^3 = (a+b)(a^2-ab+b^2)
    return multiplyJson(addJson(a, b), addJson(powerJson(a, 2), negateJson(multiplyJson(a, b)), powerJson(b, 2)));
  }

  // a^3 - b^3 = (a-b)(a^2+ab+b^2)
  return multiplyJson(addJson(a, negateJson(b)), addJson(powerJson(a, 2), multiplyJson(a, b), powerJson(b, 2)));
}

function matchFourthPowerTerm(value: JsonValue): { coefficient: number; base: JsonValue } | null {
  const n = numericInteger(value);
  if (n !== null) {
    if (n === 4) return { coefficient: 4, base: 1 };
    const root = Math.pow(n, 1 / 4);
    return Number.isInteger(root) ? { coefficient: 1, base: root } : null;
  }

  if (!isJsonArray(value)) return null;
  const operator = asOperator(value);
  if (operator === "Power" && value[2] === 4) return { coefficient: 1, base: value[1] };
  if (operator !== "Multiply") return null;

  let coefficient = 1;
  let base: JsonValue | null = null;
  for (const factor of value.slice(1)) {
    const nFactor = numericInteger(factor);
    if (nFactor !== null) {
      coefficient *= nFactor;
      continue;
    }
    if (isJsonArray(factor) && asOperator(factor) === "Power" && factor[2] === 4 && base === null) {
      base = factor[1];
      continue;
    }
    return null;
  }

  return base === null ? null : { coefficient, base };
}

function factorSophieGermainJson(json: JsonValue): JsonValue | null {
  if (!isJsonArray(json) || asOperator(json) !== "Add" || json.length !== 3) return null;

  const first = matchFourthPowerTerm(json[1]);
  const second = matchFourthPowerTerm(json[2]);
  if (!first || !second) return null;

  const pair =
    first.coefficient === 1 && second.coefficient === 4
      ? { u: first.base, v: second.base }
      : second.coefficient === 1 && first.coefficient === 4
        ? { u: second.base, v: first.base }
        : null;
  if (!pair) return null;

  const u2 = powerJson(pair.u, 2);
  const twoUv = multiplyJson(2, pair.u, pair.v);
  const twoV2 = multiplyJson(2, powerJson(pair.v, 2));
  // u^4 + 4v^4 = (u^2 - 2uv + 2v^2)(u^2 + 2uv + 2v^2)
  return multiplyJson(addJson(u2, negateJson(twoUv), twoV2), addJson(u2, twoUv, twoV2));
}

interface PolynomialTerm {
  degree: 0 | 1 | 2;
  coefficient: number;
}

function parsePolynomialTerm(value: JsonValue, variable: string): PolynomialTerm | null {
  const negated = splitLeadingNegate(value);
  const sign = negated.sign;
  const term = negated.value;

  const constant = numericInteger(term);
  if (constant !== null) return { degree: 0, coefficient: sign * constant };
  if (term === variable) return { degree: 1, coefficient: sign };

  if (isJsonArray(term) && asOperator(term) === "Power" && term[1] === variable && term[2] === 2) {
    return { degree: 2, coefficient: sign };
  }

  if (!isJsonArray(term) || asOperator(term) !== "Multiply") return null;

  let coefficient = sign;
  let degree: 0 | 1 | 2 = 0;
  for (const factor of term.slice(1)) {
    const n = numericInteger(factor);
    if (n !== null) {
      coefficient *= n;
      continue;
    }
    if (factor === variable && degree === 0) {
      degree = 1;
      continue;
    }
    if (isJsonArray(factor) && asOperator(factor) === "Power" && factor[1] === variable && factor[2] === 2 && degree === 0) {
      degree = 2;
      continue;
    }
    return null;
  }

  return { degree, coefficient };
}

function divisors(value: number): number[] {
  const abs = Math.abs(value);
  const result: number[] = [];
  for (let i = 1; i <= abs; i += 1) {
    if (abs % i === 0) result.push(i, -i);
  }
  return result;
}

function factorIntegerQuadraticJson(json: JsonValue, variable: string | null): JsonValue | null {
  if (!variable || !isJsonArray(json) || asOperator(json) !== "Add") return null;

  const coefficients = [0, 0, 0];
  for (const rawTerm of json.slice(1)) {
    const term = parsePolynomialTerm(rawTerm, variable);
    if (!term) return null;
    coefficients[term.degree] += term.coefficient;
  }

  const [c, b, a] = coefficients;
  if (a === 0 || b === 0 || c === 0) return null;

  for (const m of divisors(a)) {
    const p = a / m;
    for (const n of divisors(c)) {
      const q = c / n;
      if (m * q + n * p === b) {
        return multiplyJson(addJson(multiplyJson(m, variable), n), addJson(multiplyJson(p, variable), q));
      }
    }
  }

  return null;
}

function factorTemplateJson(json: JsonValue, variable: string | null): JsonValue | null {
  if (!isJsonArray(json)) return null;

  if (asOperator(json) === "Multiply") {
    let changed = false;
    const operands = json.slice(1).map((operand) => {
      const factored = factorTemplateJson(operand, variable);
      if (factored) changed = true;
      return factored ?? operand;
    });
    return changed ? multiplyJson(...operands) : null;
  }

  return factorIntegerQuadraticJson(json, variable) ?? factorCubePairJson(json) ?? factorSophieGermainJson(json);
}

function factorWithTemplates(ce: ComputeEngine, expr: BoxedExpression): BoxedExpression | null {
  const variable = expr.unknowns.length === 1 ? expr.unknowns[0] : null;
  const factoredJson = factorTemplateJson(expr.json as JsonValue, variable);
  return factoredJson ? ce.box(factoredJson as ExpressionInput) : null;
}

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
 * トグルを出す意味がないためnullにする。 */
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

/** =を含む式（単一方程式）を解く。未知数0個は恒等式/矛盾の真偽値、1個は解、2個以上は非対応（連立へ）。 */
function solveEquation(expr: BoxedExpression): ComputeResult {
  const unknowns = expr.unknowns;
  if (unknowns.length === 0) {
    const evaluated = expr.evaluate();
    assertValid(evaluated, "式を評価できませんでした");
    // \top(恒等式)/\bot(矛盾)の真偽値には小数近似の概念がない
    return { exact: evaluated.latex, decimal: null };
  }
  if (unknowns.length > 1) {
    throw new ComputeEngineError("複数の未知数を含む方程式は連立方程式（\\begin{cases}）で入力してください");
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

/** \begin{cases}...\end{cases}で入力された連立方程式を解く。
 * Compute Engineは`List`のEqual群としてパースし、solve(unknowns)で解ける（線形は単一Record、
 * 非線形は複数Recordの配列で返る）。 */
function solveSystem(expr: BoxedExpression, ce: ComputeEngine): ComputeResult {
  const unknowns = expr.unknowns;
  if (unknowns.length === 0) throw new ComputeEngineError("連立方程式に未知数がありません");

  // 直接expr.solve(vars)を呼ぶとundocumentedな挙動になる場合があるため、
  // Equalのリストをce.box(["List", ...])として作り直して渡すのが確実な経路。
  // 実際にはexpr.solve(unknowns)でも動くことを実測済みだが型を明確にするためisFunctionの
  // 中身を触らずに委譲する。
  const rawSolutions = expr.solve(unknowns);
  if (!rawSolutions) throw new ComputeEngineError("連立方程式を解けませんでした");

  // 単一解: {x: 3, y: 2} — Record<string, Expression>
  // 複数解: [{x:4,y:3}, {x:-3,y:-4}] — Array<Record<string, Expression>>
  // Expression[]（単変数のみで来た場合）は連立入力では現れない想定だがガードだけ入れる。
  if (Array.isArray(rawSolutions) && rawSolutions.length > 0 && "latex" in (rawSolutions[0] as object)) {
    throw new ComputeEngineError("連立方程式の解が想定外の形式でした");
  }

  const records = Array.isArray(rawSolutions)
    ? (rawSolutions as unknown as Array<Record<string, BoxedExpression>>)
    : [rawSolutions as unknown as Record<string, BoxedExpression>];

  if (records.length === 0) throw new ComputeEngineError("解が見つかりませんでした");

  const formatRecord = (rec: Record<string, BoxedExpression>, kind: "exact" | "decimal"): string => {
    const parts = unknowns.map((v) => {
      const val = rec[v];
      if (!val) return `${v}=?`;
      // BoxedExpressionとして扱えないRecord内Expressionはce.box()で再ラップする必要がある
      const boxed = ce.box(val);
      return `${v}=${kind === "exact" ? boxed.latex : boxed.N().latex}`;
    });
    return parts.join(",\\ ");
  };

  const exact = records.map((r) => formatRecord(r, "exact")).join(";\\ ");
  try {
    const decimal = records.map((r) => formatRecord(r, "decimal")).join(";\\ ");
    return { exact, decimal: decimal === exact ? null : decimal };
  } catch {
    return { exact, decimal: null };
  }
}

/**
 * LaTeX を評価し、厳密値と小数近似の両方をLaTeX文字列で返す（すでに組版済みの形なのでそのまま表示に使える）。
 * 連立方程式（List）は solveSystem、単一方程式（Equal）は solveEquation、それ以外は evaluate
 * （厳密評価）後に simplify も試みる。数値式にも通すことで二重根号外しを拾い、記号式では
 * sin²+cos²=1 のような恒等式を畳み込みやすくする。
 */
export function evaluateWithComputeEngine(latex: string, angleMode: AngleMode): ComputeResult {
  return withComputeEngineErrors(() => {
    const ce = getEngine();
    ce.angularUnit = angleMode === "DEG" ? "deg" : "rad";

    const expr = ce.parse(latex);
    assertValid(expr, "式を解釈できませんでした");

    if (expr.operator === "Equal") return solveEquation(expr);
    // \begin{cases}x+y=5\\x-y=1\end{cases} は Compute Engine 上で List のEqual群としてパースされる
    if (expr.operator === "List") {
      const items = "ops" in expr && Array.isArray(expr.ops) ? expr.ops : [];
      if (items.length > 0 && items.every((op) => op?.operator === "Equal")) return solveSystem(expr, ce);
    }

    const evaluated = normalizeEvaluatedExpression(ce, expr.evaluate());
    assertValid(evaluated, "計算できませんでした");
    // 数値式にも simplify を通す。これにより \sqrt{5+2\sqrt6} のような二重根号外しが効く。
    const result = evaluated.simplify();
    assertValid(result, "計算できませんでした");
    return withDecimal(result.latex, result);
  });
}

/**
 * 式を展開する（(x+1)^2 → x^2+2x+1 等）。展開できない式（数値のみ・関数呼び出し等）は
 * 無変化のまま返る（Compute Engine自体がno-opとして扱うため、ここでは例外を投げない）。
 * expand/factorはデフォルトエンジン（getDefaultEngine）を使う自由関数だが、既にboxed済みの
 * 式を渡すとその式が属するエンジン（=getEngine()）の設定（桁区切り等）がそのまま使われる。
 */
export function expandWithComputeEngine(latex: string): string {
  return withComputeEngineErrors(() => {
    const ce = getEngine();
    const expr = ce.parse(latex);
    assertValid(expr, "式を解釈できませんでした");
    const result = ceExpand(expr).simplify();
    assertValid(result, "展開できませんでした");
    return result.latex;
  });
}

/** 式を因数分解する（x^2-1 → (x-1)(x+1) 等）。展開できない式と同様、非対応の式は無変化で返る。 */
export function factorWithComputeEngine(latex: string): string {
  return withComputeEngineErrors(() => {
    const ce = getEngine();
    const expr = ce.parse(latex);
    assertValid(expr, "式を解釈できませんでした");
    const builtIn = ceFactor(expr);
    assertValid(builtIn, "因数分解できませんでした");
    const result = factorWithTemplates(ce, builtIn) ?? factorWithTemplates(ce, expr) ?? builtIn;
    assertValid(result, "因数分解できませんでした");
    return result.latex;
  });
}

/** メモリ加算のために式を数値として近似評価する。N()の結果をJS数値へ落として返す。 */
export function approximateAsNumber(latex: string, angleMode: AngleMode): number {
  return withComputeEngineErrors(() => {
    const ce = getEngine();
    ce.angularUnit = angleMode === "DEG" ? "deg" : "rad";
    const expr = ce.parse(latex);
    assertValid(expr, "式を解釈できませんでした");
    const value = expr.N();
    assertValid(value, "数値化できませんでした");
    // BoxedExpressionから数値を取り出す一番安全な経路: .re は複素数の実部（実数ならその値そのまま）
    const numeric = value.re;
    if (typeof numeric !== "number" || !Number.isFinite(numeric)) {
      throw new ComputeEngineError("数値として評価できませんでした");
    }
    return numeric;
  });
}

/** 数値をLaTeX文字列へ変換する（旧latexBridge.numberToLatexの代替）。指数表記は\times10^{}に整形。 */
export function numberToLatex(value: number): string {
  if (!Number.isFinite(value)) return "";
  // Compute EngineのserializeでLaTeX化するのが最も表記の統一に良いが、
  // 単純な数値変換だけならJSの.toString()にe→\times10^{}変換を掛けるだけで十分。
  const s = value.toString();
  const eIdx = s.indexOf("e");
  if (eIdx === -1) return s;
  const mantissa = s.slice(0, eIdx);
  const exponent = s.slice(eIdx + 1);
  return `${mantissa}\\times10^{${exponent}}`;
}
