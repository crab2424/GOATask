// 電卓の式評価エンジン（トークナイザ＋再帰下降パーサー）
// UIから独立させ、関数電卓の関数追加はFUNCTIONSへの登録だけで済む構成にする。

export type AngleMode = "DEG" | "RAD";

export interface EvalOptions {
  angleMode?: AngleMode;
}

export class CalcError extends Error {
  /** 式文字列中のエラー位置（0始まり）。不明な場合はundefined */
  position?: number;
  constructor(message: string, position?: number) {
    super(message);
    this.name = "CalcError";
    this.position = position;
  }
}

type Token =
  | { kind: "number"; value: number; pos: number }
  | { kind: "op"; value: string; pos: number }
  | { kind: "lparen"; pos: number }
  | { kind: "rparen"; pos: number }
  | { kind: "ident"; value: string; pos: number };

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  "π": Math.PI,
  e: Math.E,
};

// 引数1つの関数テーブル。三角関数は角度モードの影響を受ける。
const FUNCTIONS: Record<string, (x: number, opts: Required<EvalOptions>) => number> = {
  sqrt: (x) => {
    if (x < 0) throw new CalcError("負の数の平方根は計算できません");
    return Math.sqrt(x);
  },
  abs: (x) => Math.abs(x),
  sin: (x, o) => Math.sin(toRadians(x, o.angleMode)),
  cos: (x, o) => Math.cos(toRadians(x, o.angleMode)),
  tan: (x, o) => Math.tan(toRadians(x, o.angleMode)),
  log: (x) => {
    if (x <= 0) throw new CalcError("logの引数は正の数が必要です");
    return Math.log10(x);
  },
  ln: (x) => {
    if (x <= 0) throw new CalcError("lnの引数は正の数が必要です");
    return Math.log(x);
  },
};

function toRadians(x: number, mode: AngleMode): number {
  return mode === "DEG" ? (x * Math.PI) / 180 : x;
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isIdentChar(ch: string): boolean {
  return /[a-zA-Zπ]/.test(ch);
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " ") {
      i++;
      continue;
    }
    if (isDigit(ch) || ch === ".") {
      const start = i;
      while (i < input.length && isDigit(input[i])) i++;
      if (input[i] === ".") {
        i++;
        while (i < input.length && isDigit(input[i])) i++;
      }
      const text = input.slice(start, i);
      if (text === ".") throw new CalcError("数値の形式が不正です", start);
      if (text.indexOf(".") !== text.lastIndexOf("."))
        throw new CalcError("小数点が重複しています", start);
      tokens.push({ kind: "number", value: parseFloat(text), pos: start });
      continue;
    }
    if (isIdentChar(ch)) {
      const start = i;
      // πは1文字で独立した定数として扱う（sinπのような連続に対応）
      if (ch === "π") {
        i++;
        tokens.push({ kind: "ident", value: "π", pos: start });
        continue;
      }
      while (i < input.length && /[a-zA-Z]/.test(input[i])) i++;
      tokens.push({ kind: "ident", value: input.slice(start, i), pos: start });
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen", pos: i });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen", pos: i });
      i++;
      continue;
    }
    if ("+-*/^!%√×÷".includes(ch)) {
      // 表示用記号は内部演算子に正規化する
      const op = ch === "×" ? "*" : ch === "÷" ? "/" : ch;
      tokens.push({ kind: "op", value: op, pos: i });
      i++;
      continue;
    }
    throw new CalcError(`解釈できない文字です: ${ch}`, i);
  }
  return tokens;
}

class Parser {
  private tokens: Token[];
  private index = 0;
  private opts: Required<EvalOptions>;

  constructor(tokens: Token[], opts: Required<EvalOptions>) {
    this.tokens = tokens;
    this.opts = opts;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private next(): Token | undefined {
    return this.tokens[this.index++];
  }

  parse(): number {
    if (this.tokens.length === 0) throw new CalcError("式が空です");
    const value = this.parseAdditive();
    const rest = this.peek();
    if (rest) throw new CalcError("式の解釈に失敗しました", rest.pos);
    return value;
  }

  private parseAdditive(): number {
    let left = this.parseMultiplicative();
    for (;;) {
      const t = this.peek();
      if (t?.kind === "op" && (t.value === "+" || t.value === "-")) {
        this.next();
        const right = this.parseMultiplicative();
        left = t.value === "+" ? left + right : left - right;
      } else {
        return left;
      }
    }
  }

  private parseMultiplicative(): number {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t?.kind === "op" && (t.value === "*" || t.value === "/")) {
        this.next();
        const right = this.parseUnary();
        if (t.value === "/" && right === 0) throw new CalcError("0で割ることはできません", t.pos);
        left = t.value === "*" ? left * right : left / right;
      } else if (
        // 暗黙の乗算: 2(3+4)、2π、3√2 など
        t &&
        (t.kind === "lparen" || t.kind === "ident" || (t.kind === "op" && t.value === "√"))
      ) {
        const right = this.parseUnary();
        left = left * right;
      } else {
        return left;
      }
    }
  }

  private parseUnary(): number {
    const t = this.peek();
    if (t?.kind === "op" && (t.value === "-" || t.value === "+")) {
      this.next();
      const value = this.parseUnary();
      return t.value === "-" ? -value : value;
    }
    return this.parsePower();
  }

  private parsePower(): number {
    const base = this.parsePostfix();
    const t = this.peek();
    if (t?.kind === "op" && t.value === "^") {
      this.next();
      // 累乗は右結合: 2^3^2 = 2^(3^2)。指数側は単項マイナスを許す
      const exponent = this.parseUnary();
      const result = Math.pow(base, exponent);
      if (Number.isNaN(result)) throw new CalcError("累乗の計算結果が定義できません", t.pos);
      return result;
    }
    return base;
  }

  private parsePostfix(): number {
    let value = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (t?.kind === "op" && t.value === "!") {
        this.next();
        value = factorial(value, t.pos);
      } else if (t?.kind === "op" && t.value === "%") {
        this.next();
        value = value / 100;
      } else {
        return value;
      }
    }
  }

  private parsePrimary(): number {
    const t = this.next();
    if (!t) throw new CalcError("式が途中で終わっています");
    if (t.kind === "number") return t.value;
    if (t.kind === "lparen") {
      const value = this.parseAdditive();
      const close = this.next();
      if (!close || close.kind !== "rparen")
        throw new CalcError("閉じ括弧が足りません", t.pos);
      return value;
    }
    if (t.kind === "op" && t.value === "√") {
      // √は直後の項に作用する: √9、√(1+3)、√9! は √9 の後に !
      const operand = this.parsePostfix();
      if (operand < 0) throw new CalcError("負の数の平方根は計算できません", t.pos);
      return Math.sqrt(operand);
    }
    if (t.kind === "ident") {
      if (t.value in CONSTANTS) return CONSTANTS[t.value];
      const fn = FUNCTIONS[t.value];
      if (fn) {
        const open = this.peek();
        let arg: number;
        if (open?.kind === "lparen") {
          this.next();
          arg = this.parseAdditive();
          const close = this.next();
          if (!close || close.kind !== "rparen")
            throw new CalcError("閉じ括弧が足りません", t.pos);
        } else {
          // sin30 のような括弧省略に対応
          arg = this.parseUnary();
        }
        try {
          return fn(arg, this.opts);
        } catch (e) {
          if (e instanceof CalcError && e.position === undefined) e.position = t.pos;
          throw e;
        }
      }
      throw new CalcError(`未定義の名前です: ${t.value}`, t.pos);
    }
    throw new CalcError("式の解釈に失敗しました", t.pos);
  }
}

function factorial(n: number, pos: number): number {
  if (!Number.isInteger(n) || n < 0)
    throw new CalcError("階乗は0以上の整数のみ計算できます", pos);
  if (n > 170) throw new CalcError("階乗が大きすぎます（170まで）", pos);
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

/** 式を評価して数値を返す。不正な式はCalcErrorを投げる */
export function evaluate(expression: string, options?: EvalOptions): number {
  const opts: Required<EvalOptions> = { angleMode: options?.angleMode ?? "DEG" };
  const tokens = tokenize(expression);
  const result = new Parser(tokens, opts).parse();
  if (!Number.isFinite(result)) throw new CalcError("計算結果が大きすぎます");
  return result;
}

/** 浮動小数点誤差を丸めて表示用文字列にする（0.1+0.2 → "0.3"） */
export function formatResult(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return value.toString();
  const rounded = parseFloat(value.toPrecision(12));
  return rounded.toString();
}
