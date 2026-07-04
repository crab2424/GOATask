// 「計算」画面の結果を既約分数でも表示するための補助エンジン。
// floatの結果を後から分数に近似変換するのはNG（誤差を含むため）なので、
// 同じ式をtokenizeし直し、bigintの厳密な分数（Rational）で並行評価する。
// sin/log/pi/eなど本質的に無理数になりうる演算に出会ったら NotRationalError で
// bailし、呼び出し側は null を受け取って小数表示のみにフォールバックする。

import { tokenize } from "./calculatorEngine";

class NotRationalError extends Error {}

function gcd(a: bigint, b: bigint): bigint {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}

function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

export class Rational {
  readonly num: bigint;
  readonly den: bigint;

  constructor(num: bigint, den: bigint) {
    if (den === 0n) throw new NotRationalError();
    if (den < 0n) {
      num = -num;
      den = -den;
    }
    const g = gcd(num, den);
    this.num = num / g;
    this.den = den / g;
  }

  add(o: Rational): Rational {
    return new Rational(this.num * o.den + o.num * this.den, this.den * o.den);
  }
  sub(o: Rational): Rational {
    return new Rational(this.num * o.den - o.num * this.den, this.den * o.den);
  }
  mul(o: Rational): Rational {
    return new Rational(this.num * o.num, this.den * o.den);
  }
  div(o: Rational): Rational {
    if (o.num === 0n) throw new NotRationalError();
    return new Rational(this.num * o.den, this.den * o.num);
  }
  neg(): Rational {
    return new Rational(-this.num, this.den);
  }
  isInt(): boolean {
    return this.den === 1n;
  }
  toNumber(): number {
    return Number(this.num) / Number(this.den);
  }

  // 累乗は指数が整数のときだけ厳密に計算できる（負の指数は逆数、非整数はbail）
  pow(exponent: Rational): Rational {
    if (!exponent.isInt()) throw new NotRationalError();
    let e = exponent.num;
    if (e === 0n) return new Rational(1n, 1n);
    const negative = e < 0n;
    if (negative) e = -e;
    if (e > 2000n) throw new NotRationalError();
    let result = new Rational(1n, 1n);
    for (let i = 0n; i < e; i++) result = result.mul(this);
    return negative ? new Rational(1n, 1n).div(result) : result;
  }

  // 分子・分母がともに完全平方のときだけ厳密な有理数の平方根になる（既約分数なのでこれで十分）
  sqrt(): Rational {
    if (this.num < 0n) throw new NotRationalError();
    const rn = isqrt(this.num);
    const rd = isqrt(this.den);
    if (rn * rn !== this.num || rd * rd !== this.den) throw new NotRationalError();
    return new Rational(rn, rd);
  }

  factorial(): Rational {
    if (!this.isInt() || this.num < 0n) throw new NotRationalError();
    if (this.num > 170n) throw new NotRationalError();
    let result = 1n;
    for (let i = 2n; i <= this.num; i++) result *= i;
    return new Rational(result, 1n);
  }
}

function parseNumberLiteral(value: number): Rational {
  const text = value.toString();
  const dot = text.indexOf(".");
  if (dot === -1) return new Rational(BigInt(text), 1n);
  const intPart = text.slice(0, dot) || "0";
  const fracPart = text.slice(dot + 1);
  const den = 10n ** BigInt(fracPart.length);
  const num = BigInt(intPart) * den + BigInt(fracPart);
  return new Rational(num, den);
}

type Token = ReturnType<typeof tokenize>[number];

// calculatorEngineのParserと同じ文法をたどるが、数値の代わりにRationalを積み上げる。
// 関数呼び出し・定数(pi/e)などその場で無理数化しうる箇所に到達したら例外でbailする。
class RationalParser {
  private tokens: Token[];
  private index = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }
  private next(): Token | undefined {
    return this.tokens[this.index++];
  }

  parse(): Rational {
    if (this.tokens.length === 0) throw new NotRationalError();
    const value = this.parseAdditive();
    if (this.peek()) throw new NotRationalError();
    return value;
  }

  private parseAdditive(): Rational {
    let left = this.parseMultiplicative();
    for (;;) {
      const t = this.peek();
      if (t?.kind === "op" && (t.value === "+" || t.value === "-")) {
        this.next();
        const right = this.parseMultiplicative();
        left = t.value === "+" ? left.add(right) : left.sub(right);
      } else {
        return left;
      }
    }
  }

  private parseMultiplicative(): Rational {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t?.kind === "op" && (t.value === "*" || t.value === "/")) {
        this.next();
        const right = this.parseUnary();
        left = t.value === "*" ? left.mul(right) : left.div(right);
      } else if (t && (t.kind === "lparen" || t.kind === "ident" || (t.kind === "op" && t.value === "√"))) {
        const right = this.parseUnary();
        left = left.mul(right);
      } else {
        return left;
      }
    }
  }

  private parseUnary(): Rational {
    const t = this.peek();
    if (t?.kind === "op" && (t.value === "-" || t.value === "+")) {
      this.next();
      const value = this.parseUnary();
      return t.value === "-" ? value.neg() : value;
    }
    return this.parsePower();
  }

  private parsePower(): Rational {
    const base = this.parsePostfix();
    const t = this.peek();
    if (t?.kind === "op" && t.value === "^") {
      this.next();
      const exponent = this.parseUnary();
      return base.pow(exponent);
    }
    return base;
  }

  private parsePostfix(): Rational {
    let value = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (t?.kind === "op" && t.value === "!") {
        this.next();
        value = value.factorial();
      } else if (t?.kind === "op" && t.value === "%") {
        this.next();
        value = value.div(new Rational(100n, 1n));
      } else {
        return value;
      }
    }
  }

  private parsePrimary(): Rational {
    const t = this.next();
    if (!t) throw new NotRationalError();
    if (t.kind === "number") return parseNumberLiteral(t.value);
    if (t.kind === "lparen") {
      const value = this.parseAdditive();
      const close = this.next();
      if (!close || close.kind !== "rparen") throw new NotRationalError();
      return value;
    }
    if (t.kind === "op" && t.value === "√") {
      return this.parsePostfix().sqrt();
    }
    if (t.kind === "ident" && t.value === "sqrt") {
      const open = this.next();
      if (!open || open.kind !== "lparen") throw new NotRationalError();
      const arg = this.parseAdditive();
      const close = this.next();
      if (!close || close.kind !== "rparen") throw new NotRationalError();
      return arg.sqrt();
    }
    // pi/e等の定数、sqrt以外の関数（sin/log/nPr等）は無理数化しうるため非対応
    throw new NotRationalError();
  }
}

/** 式を厳密な有理数として再評価する。無理数を含みうる場合はnullを返す。 */
export function tryEvaluateRational(expression: string): Rational | null {
  try {
    return new RationalParser(tokenize(expression)).parse();
  } catch {
    return null;
  }
}

/** 既約分数を "num/den" 形式の文字列にする（分子の符号のみ表に出す） */
export function formatFraction(r: Rational): string {
  const sign = r.num < 0n ? "-" : "";
  const num = r.num < 0n ? -r.num : r.num;
  return `${sign}${num}/${r.den}`;
}
