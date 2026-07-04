// MathEditorがネイティブMathML（math/mrow/mfrac/msqrt/mo/mspace）を直接描画するための
// JSX型宣言。@types/reactはMathMLタグをIntrinsicElementsに含まないため、使用する
// タグだけをここで補う。DOM側の型はlib.dom.d.tsのMathMLElementをそのまま使う。
import type { DetailedHTMLProps, HTMLAttributes } from "react";

type MathMLProps = DetailedHTMLProps<HTMLAttributes<MathMLElement>, MathMLElement>;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      math: MathMLProps;
      mrow: MathMLProps;
      mfrac: MathMLProps;
      msqrt: MathMLProps;
      mo: MathMLProps & { stretchy?: "true" | "false" };
      mspace: MathMLProps & { width?: string; height?: string; depth?: string };
    }
  }
}
