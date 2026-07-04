import { renderLinearParts } from "./mathTypography";

interface MathExpressionProps {
  expression: string;
  className?: string;
}

/** 計算用文字列を変更せず、表示だけを数学記号に整える。 */
export function MathExpression({ expression, className = "" }: MathExpressionProps) {
  return (
    <span className={`tabular-nums ${className}`} aria-label={expression}>
      {renderLinearParts(expression)}
    </span>
  );
}
