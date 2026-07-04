// 自由入力の方程式（例: "2x^2+3x=5"）から1変数・次数2以下の多項式係数を抽出し、
// equationSolver.tsの解の公式（solveQuadratic）へ橋渡しする「係数抽出層」。
// nerdamerのsolveは複素数解で精度ノイズが出るバグがあるため使わず、自作で解く方針を維持する。
// 対応範囲: 1変数・次数2以下の多項式方程式のみ。関数呼び出し（sin(x)等）・複数変数・
// 3次以上・指数や根号の中に変数を含む式は「現在未対応」として明確なエラーを返す。
import { tokenize, isFunctionName, CONSTANT_NAMES, formatResult, CalcError } from "./calculatorEngine";
import { solveQuadratic } from "./equationSolver";

type Token = ReturnType<typeof tokenize>[number];

/** [x^0係数, x^1係数, x^2係数] */
type Poly = [number, number, number];

function addPoly(a: Poly, b: Poly, sign: 1 | -1): Poly {
  return [a[0] + sign * b[0], a[1] + sign * b[1], a[2] + sign * b[2]];
}

function scalePoly(a: Poly, k: number): Poly {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function mulPoly(a: Poly, b: Poly, pos: number): Poly {
  const degA = a[2] !== 0 ? 2 : a[1] !== 0 ? 1 : 0;
  const degB = b[2] !== 0 ? 2 : b[1] !== 0 ? 1 : 0;
  if (degA + degB > 2) throw new CalcError("3次以上の方程式は現在未対応です", pos);
  return [
    a[0] * b[0],
    a[0] * b[1] + a[1] * b[0],
    a[0] * b[2] + a[1] * b[1] + a[2] * b[0],
  ];
}

function constantOf(p: Poly, pos: number, message: string): number {
  if (p[1] !== 0 || p[2] !== 0) throw new CalcError(message, pos);
  return p[0];
}

// 数値エンジンのParserと同じ文法（優先順位: 加減 < 乗除・暗黙乗算 < 単項 < 累乗 < 後置 < 基本項）を
// たどるが、値としてPoly（多項式係数）を積み上げる点だけが異なる。
class PolyParser {
  private tokens: Token[];
  private index = 0;
  private variable: string;

  constructor(tokens: Token[], variable: string) {
    this.tokens = tokens;
    this.variable = variable;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private next(): Token | undefined {
    return this.tokens[this.index++];
  }

  parse(): Poly {
    if (this.tokens.length === 0) return [0, 0, 0];
    const value = this.parseAdditive();
    const rest = this.peek();
    if (rest) throw new CalcError("式の解釈に失敗しました", rest.pos);
    return value;
  }

  private parseAdditive(): Poly {
    let left = this.parseMultiplicative();
    for (;;) {
      const t = this.peek();
      if (t?.kind === "op" && (t.value === "+" || t.value === "-")) {
        this.next();
        const right = this.parseMultiplicative();
        left = addPoly(left, right, t.value === "+" ? 1 : -1);
      } else {
        return left;
      }
    }
  }

  private parseMultiplicative(): Poly {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t?.kind === "op" && (t.value === "*" || t.value === "/")) {
        this.next();
        const right = this.parseUnary();
        if (t.value === "*") {
          left = mulPoly(left, right, t.pos);
        } else {
          const divisor = constantOf(right, t.pos, "分母に変数を含む方程式は現在未対応です");
          if (divisor === 0) throw new CalcError("0で割ることはできません", t.pos);
          left = scalePoly(left, 1 / divisor);
        }
      } else if (
        // 暗黙の乗算: 2x, 2(x+1), 2√3 など
        t &&
        (t.kind === "lparen" || t.kind === "ident" || (t.kind === "op" && t.value === "√"))
      ) {
        const right = this.parseUnary();
        left = mulPoly(left, right, t.pos);
      } else {
        return left;
      }
    }
  }

  private parseUnary(): Poly {
    const t = this.peek();
    if (t?.kind === "op" && (t.value === "-" || t.value === "+")) {
      this.next();
      const value = this.parseUnary();
      return t.value === "-" ? scalePoly(value, -1) : value;
    }
    return this.parsePower();
  }

  private parsePower(): Poly {
    const base = this.parsePostfix();
    const t = this.peek();
    if (t?.kind === "op" && t.value === "^") {
      this.next();
      const exponent = this.parseUnary();
      const n = constantOf(exponent, t.pos, "指数に変数を含む方程式は現在未対応です");
      if (!Number.isInteger(n) || n < 0)
        throw new CalcError("方程式の指数は0以上の整数のみ対応しています", t.pos);
      let result: Poly = [1, 0, 0];
      for (let i = 0; i < n; i++) result = mulPoly(result, base, t.pos);
      return result;
    }
    return base;
  }

  private parsePostfix(): Poly {
    const value = this.parsePrimary();
    const t = this.peek();
    if (t?.kind === "op" && (t.value === "!" || t.value === "%")) {
      throw new CalcError("方程式ではこの記号は使えません", t.pos);
    }
    return value;
  }

  private parsePrimary(): Poly {
    const t = this.next();
    if (!t) throw new CalcError("式が途中で終わっています");
    if (t.kind === "number") return [t.value, 0, 0];
    if (t.kind === "lparen") {
      const value = this.parseAdditive();
      const close = this.next();
      if (!close || close.kind !== "rparen") throw new CalcError("閉じ括弧が足りません", t.pos);
      return value;
    }
    if (t.kind === "op" && t.value === "√") {
      const operand = this.parsePostfix();
      const c = constantOf(operand, t.pos, "根号の中に変数を含む方程式は現在未対応です");
      if (c < 0) throw new CalcError("負の数の平方根は計算できません", t.pos);
      return [Math.sqrt(c), 0, 0];
    }
    if (t.kind === "ident") {
      if (t.value === this.variable) return [0, 1, 0];
      if (t.value === "pi" || t.value === "π") return [Math.PI, 0, 0];
      if (t.value === "e") return [Math.E, 0, 0];
      throw new CalcError(`${t.value}を含む方程式（関数・別の文字など）は現在未対応です`, t.pos);
    }
    throw new CalcError("式の解釈に失敗しました", t.pos);
  }
}

function collectVariables(tokens: Token[]): Set<string> {
  const vars = new Set<string>();
  for (const t of tokens) {
    if (t.kind === "ident" && !isFunctionName(t.value) && !CONSTANT_NAMES.has(t.value)) vars.add(t.value);
  }
  return vars;
}

export interface EquationInfo {
  variable: string;
  degree: 0 | 1 | 2;
  /** [x^0係数, x^1係数, x^2係数]（移項後、combined = 0 の形） */
  coeffs: Poly;
}

/** 方程式文字列から変数・次数・係数を抽出する */
export function extractPolynomialEquation(expr: string): EquationInfo {
  const eqIdx = expr.indexOf("=");
  if (eqIdx === -1) throw new CalcError("方程式には=が必要です");
  const leftStr = expr.slice(0, eqIdx);
  const rightStr = expr.slice(eqIdx + 1);
  if (rightStr.includes("=")) throw new CalcError("=は1つだけ使えます", expr.indexOf("=", eqIdx + 1));

  const leftTokens = tokenize(leftStr);
  const rightTokens = tokenize(rightStr);
  const vars = new Set([...collectVariables(leftTokens), ...collectVariables(rightTokens)]);
  if (vars.size === 0) throw new CalcError("方程式に変数が見つかりません");
  if (vars.size > 1) {
    throw new CalcError(`複数の文字（${[...vars].join("・")}）を含む方程式は連立方程式タブをご利用ください`);
  }
  const variable = [...vars][0];

  const left = new PolyParser(leftTokens, variable).parse();
  const right = new PolyParser(rightTokens, variable).parse();
  const combined = addPoly(left, right, -1); // left - right = 0
  const degree: 0 | 1 | 2 = combined[2] !== 0 ? 2 : combined[1] !== 0 ? 1 : 0;
  return { variable, degree, coeffs: combined };
}

/** 方程式文字列を解いて表示用文字列を返す */
export function solveFreeEquation(expr: string): string {
  const { variable, degree, coeffs } = extractPolynomialEquation(expr);
  const [c0, c1, c2] = coeffs;
  if (degree === 2) {
    const r = solveQuadratic(c2, c1, c0);
    return r.kind === "double"
      ? `${variable} = ${r.roots[0]}`
      : `${variable} = ${r.roots[0]}, ${variable} = ${r.roots[1]}`;
  }
  if (degree === 1) return `${variable} = ${formatResult(-c0 / c1)}`;
  return c0 === 0 ? "解はすべての実数です（恒等式）" : "解はありません（矛盾する式です）";
}
