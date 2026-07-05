// MathLive の <math-field> Web Component を React から扱うための薄いラッパー。
// 自前キーパッド前提のため仮想キーボードは常に無効化する。値は LaTeX 文字列で扱う。
// executeCommand / insert / focus / getValue を ref 経由で公開し、
// CalculatorView 側の =・カーソル移動・関数キーからそのまま叩けるようにする。
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type { MathfieldElement, Selector } from "mathlive";
import "mathlive";
import "mathlive/fonts.css";

export interface MathFieldHandle {
  insert: (latex: string) => void;
  executeCommand: (command: string) => void;
  focus: () => void;
  clear: () => void;
  getLatex: () => string;
  setLatex: (latex: string) => void;
}

interface MathFieldProps {
  value: string;
  readOnly?: boolean;
  onChange?: (latex: string) => void;
  /** Enter / return を押したとき（＝キーに相当）に呼ばれる */
  onSubmit?: () => void;
  className?: string;
  ariaLabel?: string;
}

// React 19 は未宣言のカスタム要素を JSX で使うと型エラーになるため、
// mathfield 用の最小プロパティ宣言を追加する。
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "math-field": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          class?: string;
          readonly?: boolean | "";
          "math-virtual-keyboard-policy"?: "auto" | "manual" | "sandboxed";
        },
        HTMLElement
      >;
    }
  }
}

export const MathField = forwardRef<MathFieldHandle, MathFieldProps>(function MathField(
  { value, readOnly = false, onChange, onSubmit, className = "", ariaLabel },
  ref,
) {
  const elRef = useRef<MathfieldElement | null>(null);

  useImperativeHandle(ref, () => ({
    insert: (latex) => elRef.current?.insert(latex, { focus: true }),
    executeCommand: (command) => {
      elRef.current?.executeCommand(command as Selector);
      elRef.current?.focus();
    },
    focus: () => elRef.current?.focus(),
    clear: () => {
      if (elRef.current) elRef.current.value = "";
    },
    getLatex: () => elRef.current?.getValue("latex") ?? "",
    setLatex: (latex) => {
      if (elRef.current) elRef.current.value = latex;
    },
  }));

  // 初期化: 仮想キーボードは自前キーパッドに任せて完全に切る。
  // MathLive のインライン変換（"pi" → π 等）も電卓では邪魔になるのでオフにする。
  //
  // mathVirtualKeyboardPolicyはJSXのmath-virtual-keyboard-policy属性でも指定しているが、
  // タッチデバイスではMathLive内部のdocument"focusin"リスナー（isTouchCapable()時のみ有効）が
  // フォーカス後300msで`mf.mathVirtualKeyboardPolicy === "auto"`かどうかを見て仮想キーボードを
  // 自動表示する。属性は要素生成と同時にDOMへ反映されるためこのuseEffect（コミット後に非同期実行）
  // より確実に間に合うが、念のためプロパティでも重ねて設定し、既に表示されてしまっていた場合に
  // 備えて明示的にhide()も呼ぶ（グローバルシングルトンなので他のmath-fieldの状態と競合しないよう
  // 呼び出し自体は無害＝非表示化のみ）。
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    el.mathVirtualKeyboardPolicy = "manual";
    el.smartMode = false;
    el.smartFence = true;
    // MathLive の既定インライン省略記法は電卓の意図と衝突しやすいので絞る
    el.inlineShortcuts = {};
    // 括弧の暗黙補完（\left ... \right の自動追加）はさせず、素の () を保つ
    window.mathVirtualKeyboard?.hide();
    // window.mathVirtualKeyboardはdocument直下に生きるグローバルシングルトンで、
    // math-field自体がアンマウントされても連動して消えない。CalculatorViewから
    // 他のモードへ遷移した後もキーボードが開いたまま残る不具合を防ぐため、
    // アンマウント時に明示的にhideする。
    return () => {
      window.mathVirtualKeyboard?.hide();
    };
  }, []);

  // 編集中は常に純正仮想キーボードを開いておく。手動⌨トグルで閉じた後も
  // 再フォーカスすれば開き直る。blurでは閉じない（ツールバーボタンが内部で
  // focus()を呼び戻すため、blur連動にすると開閉のちらつきが起きるのを避ける）。
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const handleFocus = () => window.mathVirtualKeyboard?.show();
    el.addEventListener("focus", handleFocus);
    return () => el.removeEventListener("focus", handleFocus);
  }, []);

  // 双方向同期: 外部 value を反映（差分があるときだけ）。
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (el.value !== value) el.value = value;
  }, [value]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const handleInput = () => onChange?.(el.value);
    // MathLive は物理 Enter と仮想キーボードの commit（↩︎）の両方で change を発火する。
    // blur 時にも同じイベントが発火するため、フォーカスを保持した commit だけを計算に回す。
    const handleChange = () => {
      if (el.hasFocus()) onSubmit?.();
    };
    el.addEventListener("input", handleInput);
    el.addEventListener("change", handleChange);
    return () => {
      el.removeEventListener("input", handleInput);
      el.removeEventListener("change", handleChange);
    };
  }, [onChange, onSubmit]);

  return (
    <math-field
      ref={elRef as unknown as React.Ref<HTMLElement>}
      class={className}
      readonly={readOnly ? "" : undefined}
      aria-label={ariaLabel}
      math-virtual-keyboard-policy="manual"
    >
      {value}
    </math-field>
  );
});
