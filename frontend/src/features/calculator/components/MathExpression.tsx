// 読み取り専用の数式表示。結果・履歴などで使う。
// MathLive の convertLatexToMarkup で組版し、Editor と同じフォント・寸法で揃える。
import { useMemo } from "react";
import { convertLatexToMarkup } from "mathlive";
import "mathlive/fonts.css";

interface MathExpressionProps {
  /** LaTeX 文字列。単純な数字や式もそのまま LaTeX として組版可能 */
  expression: string;
  className?: string;
}

export function MathExpression({ expression, className = "" }: MathExpressionProps) {
  const html = useMemo(() => {
    try {
      return convertLatexToMarkup(expression ?? "");
    } catch {
      return expression;
    }
  }, [expression]);
  return (
    <span
      className={className}
      aria-label={expression}
      // MathLive が生成する信頼できる markup。ユーザー入力を含みうるが、
      // convertLatexToMarkup 自体がサニタイズ済みの LaTeX → HTML を返す。
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
