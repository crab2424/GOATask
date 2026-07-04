import { useMemo } from "react";
import { parseLinear } from "../engine/linearize";
import { MathEditor } from "./MathEditor";

interface MathExpressionProps {
  expression: string;
  className?: string;
}

/**
 * 計算用文字列を変更せず、表示だけを数学組版に整える（結果・履歴用の読み取り専用表示）。
 * parseLinearで編集ツリーに復元してMathEditorで描画するため、(1)/(2)や3/10のような
 * 分数は縦組み、√はoverline、^は上付きで表示される。復元できない並びは
 * charの列のままmathTypographyの整形（× ÷ sin⁻¹など）だけが適用される。
 */
export function MathExpression({ expression, className = "" }: MathExpressionProps) {
  const tree = useMemo(() => parseLinear(expression), [expression]);
  return (
    <span className={className} aria-label={expression}>
      <MathEditor tree={tree} />
    </span>
  );
}
