// 方程式サブモード用のソルバー。係数入力フォーム型なのでCASを使わず
// 解の公式・ガウスの消去法で直接解く（速くて正確、複素数解も扱える）。
import { formatResult } from "./calculatorEngine";

export interface QuadraticResult {
  discriminant: number;
  /** 解の文字列表現（実数解 or "p+qi" 形式の複素数解） */
  roots: [string, string];
  kind: "two-real" | "double" | "complex";
}

export function solveQuadratic(a: number, b: number, c: number): QuadraticResult {
  if (a === 0) throw new Error("a=0のときは二次方程式になりません（bx+c=0はb≠0でx=-c/b）");
  const d = b * b - 4 * a * c;
  if (d > 0) {
    const sqrtD = Math.sqrt(d);
    return {
      discriminant: d,
      roots: [formatResult((-b + sqrtD) / (2 * a)), formatResult((-b - sqrtD) / (2 * a))],
      kind: "two-real",
    };
  }
  if (d === 0) {
    const r = formatResult(-b / (2 * a));
    return { discriminant: d, roots: [r, r], kind: "double" };
  }
  const re = -b / (2 * a);
  const im = Math.sqrt(-d) / (2 * Math.abs(a));
  return {
    discriminant: d,
    roots: [formatComplex(re, im), formatComplex(re, -im)],
    kind: "complex",
  };
}

function formatComplex(re: number, im: number): string {
  const reStr = formatResult(re);
  const imAbs = formatResult(Math.abs(im));
  const imPart = imAbs === "1" ? "i" : `${imAbs}i`;
  if (re === 0) return im >= 0 ? imPart : `-${imPart}`;
  return `${reStr} ${im >= 0 ? "+" : "-"} ${imPart}`;
}

export type LinearSystemResult =
  | { kind: "unique"; values: string[] }
  | { kind: "none" }
  | { kind: "infinite" };

/**
 * 連立一次方程式をガウスの消去法（部分ピボット選択）で解く。
 * coefficients: n×n係数行列、constants: 右辺ベクトル
 */
export function solveLinearSystem(
  coefficients: number[][],
  constants: number[],
): LinearSystemResult {
  const n = constants.length;
  // 拡大係数行列を作る（元の配列は壊さない）
  const m = coefficients.map((row, i) => [...row, constants[i]]);

  for (let col = 0; col < n; col++) {
    // 部分ピボット選択: 絶対値最大の行を先頭に
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) continue; // この列は消去済み扱い
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = m[row][col] / m[col][col];
      for (let k = col; k <= n; k++) m[row][k] -= factor * m[col][k];
    }
  }

  // ランク判定: 係数が全て0の行をチェック
  for (let row = 0; row < n; row++) {
    const allZero = m[row].slice(0, n).every((v) => Math.abs(v) < 1e-12);
    if (allZero) {
      return Math.abs(m[row][n]) < 1e-12 ? { kind: "infinite" } : { kind: "none" };
    }
  }

  const values = new Array<string>(n);
  for (let row = 0; row < n; row++) {
    // 対角化済みなので各行の非ゼロ列が変数に対応する
    const col = m[row].findIndex((v, i) => i < n && Math.abs(v) >= 1e-12);
    values[col] = formatResult(roundNoise(m[row][n] / m[row][col]));
  }
  return { kind: "unique", values };
}

/** 消去法の浮動小数点ノイズ（1e-13程度）を落とす */
function roundNoise(v: number): number {
  const rounded = Math.round(v);
  return Math.abs(v - rounded) < 1e-10 ? rounded : v;
}
