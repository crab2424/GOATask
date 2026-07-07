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

// 電卓Editorの物理入力は半角ASCIIのみ許可する。
// 全角英数・全角記号・かな等のIME入力は MathLive に渡す前に破棄する。
const NON_ASCII_RE = /[^\x00-\x7F]/;

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

  // キーボードの開閉と入力可否（フォーカス）を1:1に対応させる: focus→show / blur→hide。
  // 遅延タイマーは使わない（ツールバー操作でのちらつき防止に200ms猶予を入れていたが、
  // 素早い連続操作と衝突して「押しても閉じない/閉じたままになる」不具合を起こしたため撤廃）。
  // ツールバー・履歴側のボタンは呼び出し元（CalculatorView）でmousedownのフォーカス
  // 移動自体をpreventDefaultして止めており、そもそもここでblurが起きない前提。
  //
  // MathLive純正の⌨トグルボタン（shadow DOM内、part="virtual-keyboard-toggle"）は
  // クリックされると自分でshow()/hide()を呼ぶので、こちらのfocus連動が重ねて反応すると
  // 「一瞬閉じてまた開く」「連打すると閉じたままになる」といった競合を起こしうる。
  // クリック対象がそのトグルボタン自身のときだけ、直後のfocusin 1回を無視する
  // （時間ではなく実際のクリック対象で判定するため、連打しても誤動作しない）。
  useEffect(() => {
    const el = elRef.current;
    const kb = window.mathVirtualKeyboard;
    if (!el || !kb) return;
    let ignoreNextFocus = false;
    const handlePointerDown = (e: PointerEvent) => {
      ignoreNextFocus = !!(e.target as Element | null)?.closest('[part="virtual-keyboard-toggle"]');
    };
    const handleFocusIn = () => {
      if (ignoreNextFocus) {
        ignoreNextFocus = false;
        return;
      }
      kb.show();
    };
    const handleFocusOut = () => kb.hide();
    el.addEventListener("pointerdown", handlePointerDown, true);
    el.addEventListener("focusin", handleFocusIn);
    el.addEventListener("focusout", handleFocusOut);
    return () => {
      el.removeEventListener("pointerdown", handlePointerDown, true);
      el.removeEventListener("focusin", handleFocusIn);
      el.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  // 全角入力の拒否。
  //
  // 方式: MathLiveからIME合成(composition)処理を完全に奪う。<math-field> host に
  // capture: true で composition系イベントを登録し stopImmediatePropagation することで、
  // MathLive内部のkeyboardSinkのリスナーには一切届かせない（captureは祖先→子孫の順に
  // 発火するため、hostで止めればsink側は実行されない）。これにより:
  // - MathLiveのCompositionAtom（全角の未確定プレビュー。macOSでは合成がEnter確定まで
  //   開きっぱなしになるため、これが「全角のまま表示され続ける」原因だった）が作られない
  // - MathLive自身による合成確定文字列の挿入も起きない＝二重入力が構造的に不可能
  // 変換挿入はせず、sinkに残った未確定テキストも即クリアする。
  //
  // 合成中の生keydown（isComposing/Process）と合成由来のbeforeinput/inputも
  // hostのcaptureで遮断する。前者はMathLiveが生キーとして誤処理する経路の遮断、後者は
  // MathLiveのinputハンドラが合成中にsinkのtextContentをクリアしてIMEを乱す事故の予防
  // （MathLive自身が発火するinputイベントはisComposing=falseなので素通りし、onChange同期
  // には影響しない）。sinkに残る合成テキストはこちらでクリアする（shadow rootはopenなので
  // composedPath()[0]で実ターゲット＝sinkに届く）。
  //
  // 合成を経由しない非ASCIIの1文字keydown（Windowsの直接入力等）やペーストも拒否する。
  // リスナーは <math-field> 自身にのみ付けるため、他の入力欄（メモ等）には一切影響しない
  // ＝電卓Editor外では通常のIME入力のまま（「モード切り替え時には戻す」相当）。
  //
  // 注意: MathLive内部のイベント配線（sinkのcapture登録・compositionInProgressフラグ・
  // inputハンドラのsinkクリア）を外から遮断する実装のため、MathLiveのバージョン更新時は
  // この節の前提が変わっていないか要確認。
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const clearSink = (ev: Event) => {
      const sink = ev.composedPath()[0];
      if (sink instanceof HTMLElement && sink !== el) sink.textContent = "";
    };
    const rejectEvent = (ev: Event) => {
      if (ev.cancelable) ev.preventDefault();
      ev.stopImmediatePropagation();
      clearSink(ev);
    };
    const hasDisallowedText = (text: string | null | undefined) => {
      return text ? NON_ASCII_RE.test(text) : false;
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.key === "Process") {
        rejectEvent(e);
        return;
      }
      if (e.key.length === 1 && hasDisallowedText(e.key)) {
        rejectEvent(e);
      }
    };
    const handleComposition = (ev: CompositionEvent) => {
      rejectEvent(ev);
    };
    const handleBeforeInput = (ev: Event) => {
      const ie = ev as InputEvent;
      if (
        ie.isComposing ||
        ie.inputType === "insertCompositionText" ||
        hasDisallowedText(ie.data)
      ) {
        rejectEvent(ev);
      }
    };
    const handleInput = (ev: Event) => {
      const ie = ev as InputEvent;
      if (
        ie.isComposing ||
        ie.inputType === "insertCompositionText" ||
        hasDisallowedText(ie.data)
      ) {
        rejectEvent(ev);
      }
    };
    const handlePaste = (ev: ClipboardEvent) => {
      if (hasDisallowedText(ev.clipboardData?.getData("text"))) {
        rejectEvent(ev);
      }
    };
    el.addEventListener("keydown", handleKeyDown, true);
    el.addEventListener("compositionstart", handleComposition, true);
    el.addEventListener("compositionupdate", handleComposition, true);
    el.addEventListener("compositionend", handleComposition, true);
    el.addEventListener("beforeinput", handleBeforeInput, true);
    el.addEventListener("input", handleInput, true);
    el.addEventListener("paste", handlePaste, true);
    return () => {
      el.removeEventListener("keydown", handleKeyDown, true);
      el.removeEventListener("compositionstart", handleComposition, true);
      el.removeEventListener("compositionupdate", handleComposition, true);
      el.removeEventListener("compositionend", handleComposition, true);
      el.removeEventListener("beforeinput", handleBeforeInput, true);
      el.removeEventListener("input", handleInput, true);
      el.removeEventListener("paste", handlePaste, true);
    };
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
