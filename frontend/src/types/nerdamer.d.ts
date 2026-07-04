// nerdamerは型定義未提供のため最小限の宣言を用意する
declare module "nerdamer" {
  interface NerdamerExpression {
    toString(): string;
    text(format?: "fractions" | "decimals"): string;
    evaluate(): NerdamerExpression;
    expand(): NerdamerExpression;
  }
  function nerdamer(expression: string): NerdamerExpression;
  export default nerdamer;
}

declare module "nerdamer/Calculus";
declare module "nerdamer/Algebra";
declare module "nerdamer/Solve";
