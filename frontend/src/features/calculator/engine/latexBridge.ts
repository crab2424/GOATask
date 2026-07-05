// MathLive の LaTeX 出力 → 既存 evaluate() が受け付ける線形文字列への変換橋。
// 既存の calculatorEngine.tokenize は `+ - * / ^ ! % √ × ÷` と `sqrt/abs/sin/...` の
// 関数呼び出し、`π`, `pi`, `e`, `∞` 等を受け付けるため、LaTeX からその形に落とせばよい。
//
// 目的は完全な LaTeX パーサではなく、MathLive が電卓 UI から出力しうる範囲だけ確実に
// 変換すること。未知のコマンドはドロップし、意味不明な残骸を評価器に渡さない方針。

const CMD_SYMBOL: Record<string, string> = {
  // ギリシャ文字と定数
  pi: "π", infty: "∞",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ",
  epsilon: "ε", varepsilon: "ε",
  theta: "θ", vartheta: "θ",
  lambda: "λ", mu: "μ", sigma: "σ", omega: "ω",
  // 演算子記号
  times: "×", cdot: "×", div: "÷",
  // MathLive の各種スペース系（評価上は無視）
  ",": "", "!": "", ";": "", ":": "", " ": "",
  quad: "", qquad: "",
  // 括弧・区切りの生記号
  "{": "", "}": "",
  "|": "|", lvert: "|", rvert: "|",
  lparen: "(", rparen: ")",
};

// 関数名（引数付き）を LaTeX コマンドから線形形式にマップ
const CMD_FUNC: Record<string, string> = {
  sin: "sin", cos: "cos", tan: "tan",
  arcsin: "asin", arccos: "acos", arctan: "atan",
  sinh: "sinh", cosh: "cosh", tanh: "tanh",
  log: "log", ln: "ln", exp: "exp",
};

type Token =
  | { kind: "cmd"; name: string }
  | { kind: "char"; ch: string }
  | { kind: "brace-open" }
  | { kind: "brace-close" }
  | { kind: "bracket-open" }
  | { kind: "bracket-close" }
  | { kind: "caret" }
  | { kind: "underscore" };

function tokenizeLatex(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      i++;
      // \name のような英字コマンド
      if (i < src.length && /[a-zA-Z]/.test(src[i])) {
        let name = "";
        while (i < src.length && /[a-zA-Z]/.test(src[i])) {
          name += src[i];
          i++;
        }
        tokens.push({ kind: "cmd", name });
        // コマンド直後の1個の空白は区切りとして消費する（LaTeXの慣習）
        if (src[i] === " ") i++;
        continue;
      }
      // \, \! \{ \} \| など1文字コマンド
      if (i < src.length) {
        tokens.push({ kind: "cmd", name: src[i] });
        i++;
      }
      continue;
    }
    if (ch === "{") { tokens.push({ kind: "brace-open" }); i++; continue; }
    if (ch === "}") { tokens.push({ kind: "brace-close" }); i++; continue; }
    if (ch === "[") { tokens.push({ kind: "bracket-open" }); i++; continue; }
    if (ch === "]") { tokens.push({ kind: "bracket-close" }); i++; continue; }
    if (ch === "^") { tokens.push({ kind: "caret" }); i++; continue; }
    if (ch === "_") { tokens.push({ kind: "underscore" }); i++; continue; }
    if (ch === " ") { i++; continue; }
    tokens.push({ kind: "char", ch });
    i++;
  }
  return tokens;
}

class Converter {
  private tokens: Token[];
  private i = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  convert(): string {
    return this.consumeUntil(() => false);
  }

  private peek(): Token | undefined {
    return this.tokens[this.i];
  }

  private next(): Token | undefined {
    return this.tokens[this.i++];
  }

  // 「グループ」= { ... } または直後の 1 原子
  private consumeGroup(): string {
    const t = this.peek();
    if (!t) return "";
    if (t.kind === "brace-open") {
      this.next();
      const inner = this.consumeUntil((tok) => tok.kind === "brace-close");
      if (this.peek()?.kind === "brace-close") this.next();
      return inner;
    }
    return this.consumeAtom();
  }

  private consumeAtom(): string {
    const t = this.next();
    if (!t) return "";
    if (t.kind === "char") return t.ch;
    if (t.kind === "cmd") return this.expandCommand(t.name);
    // 余った { } [ ] は無視
    return "";
  }

  private expandCommand(name: string): string {
    if (name === "frac" || name === "dfrac" || name === "tfrac") {
      const num = this.consumeGroup();
      const den = this.consumeGroup();
      return `(${num})/(${den})`;
    }
    if (name === "sqrt") {
      if (this.peek()?.kind === "bracket-open") {
        // \sqrt[n]{x} → x^(1/n)
        this.next();
        const n = this.consumeUntil((tok) => tok.kind === "bracket-close");
        if (this.peek()?.kind === "bracket-close") this.next();
        const rad = this.consumeGroup();
        return `(${rad})^(1/(${n}))`;
      }
      const rad = this.consumeGroup();
      return `√(${rad})`;
    }
    if (name === "left" || name === "right") {
      // 直後の 1 トークンが区切り記号
      const t = this.next();
      if (!t) return "";
      if (t.kind === "char") {
        // \left. \right. は非表示区切り → 空
        return t.ch === "." ? "" : t.ch;
      }
      if (t.kind === "cmd") return CMD_SYMBOL[t.name] ?? "";
      return "";
    }
    if (name === "operatorname" || name === "mathrm" || name === "mathit" || name === "text") {
      // \operatorname{foo} → foo（関数名や識別子）
      return this.consumeGroup();
    }
    if (name === "placeholder") {
      // MathLive の空スロット。中身も含めて捨てる。
      this.consumeGroup();
      return "";
    }
    if (name in CMD_FUNC) return CMD_FUNC[name];
    if (name in CMD_SYMBOL) return CMD_SYMBOL[name];
    // 未知コマンドはドロップ
    return "";
  }

  private consumeUntil(stop: (tok: Token) => boolean): string {
    const parts: string[] = [];
    while (this.i < this.tokens.length) {
      const t = this.peek();
      if (t && stop(t)) break;
      if (t?.kind === "caret") {
        this.next();
        const exp = this.consumeGroup();
        parts.push(`^(${exp})`);
        continue;
      }
      if (t?.kind === "underscore") {
        // 下付きは評価上は捨てる（識別子との区別が難しいため今回は非対応）
        this.next();
        this.consumeGroup();
        continue;
      }
      parts.push(this.consumeAtom());
    }
    return parts.join("");
  }
}

/**
 * 出現順の | を交互に abs( / ) に置換する。
 * MathLive の \left|...\right| は必ずペアで出力されるためこの単純な parity で足りる。
 * ネストした絶対値には未対応（電卓 UI からは通常起きない）。
 */
function convertAbs(s: string): string {
  let out = "";
  let open = false;
  for (const ch of s) {
    if (ch === "|") {
      out += open ? ")" : "abs(";
      open = !open;
    } else {
      out += ch;
    }
  }
  return out;
}

export function latexToLinear(latex: string): string {
  if (!latex) return "";
  const tokens = tokenizeLatex(latex);
  const raw = new Converter(tokens).convert();
  return convertAbs(raw);
}

/**
 * formatFraction が返す "num/den"（先頭に "-" が付きうる）を LaTeX の \frac に整形する。
 * "1/2" → "\\frac{1}{2}"、"-3/4" → "-\\frac{3}{4}"。
 */
export function fractionToLatex(text: string): string {
  const m = /^(-?)(\d+)\/(\d+)$/.exec(text.trim());
  if (!m) return text;
  const [, sign, num, den] = m;
  return `${sign}\\frac{${num}}{${den}}`;
}

/**
 * 電卓エンジンの結果文字列（"3.14" "1e-3" 等の単純な数値）を MathLive で組版できる
 * LaTeX に整える。指数表記は \times 10^{...} に置換して見栄えを良くする。
 */
export function numberToLatex(text: string): string {
  const m = /^(-?\d+(?:\.\d+)?)[eE]([+-]?\d+)$/.exec(text);
  if (m) return `${m[1]}\\times10^{${m[2].replace(/^\+/, "")}}`;
  return text;
}
