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

// 全角英数記号（U+FF01〜FF5E）は半角（U+0021〜007E）と +0xFEE0 のオフセットで1対1対応する。
// 全角スペース（U+3000）のみ例外で半角スペースへ。ひらがな・漢字等はレンジ外なので変換しない。
const FULLWIDTH_RE = /[\uFF01-\uFF5E\u3000]/;
const FULLWIDTH_RE_G = /[\uFF01-\uFF5E\u3000]/g;
function toHalfWidth(text: string): string {
  return text.replace(FULLWIDTH_RE_G, (ch) =>
    ch === "\u3000" ? " " : String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
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

  // 全角入力の半角強制変換。
  //
  // 方式: MathLiveからIME合成(composition)処理を完全に奪う。<math-field> host に
  // capture: true で composition系イベントを登録し stopImmediatePropagation することで、
  // MathLive内部のkeyboardSinkのリスナーには一切届かせない（captureは祖先→子孫の順に
  // 発火するため、hostで止めればsink側は実行されない）。これにより:
  // - MathLiveのCompositionAtom（全角の未確定プレビュー。macOSでは合成がEnter確定まで
  //   開きっぱなしになるため、これが「全角のまま表示され続ける」原因だった）が作られない
  // - MathLive自身による合成確定文字列の挿入も起きない＝二重入力が構造的に不可能
  // 代わりに compositionupdate のたびに ev.data を半角変換し、前回挿入分との差分だけを
  // deleteBackward / insert() で反映する（合成中から半角の通常ノードとして表示され、
  // 「打った瞬間に半角で出る」を実現。insert()経由なので演算子も正しく認識される）。
  // バックスペースでの合成中削除・Escキャンセル（data空→全削除）も差分処理で吸収される。
  //
  // 合成中の生keydown（isComposing/Process）と合成由来のinput（insertCompositionText）も
  // hostのcaptureで遮断する。前者はMathLiveが生キーとして誤処理する経路の遮断、後者は
  // MathLiveのinputハンドラが合成中にsinkのtextContentをクリアしてIMEを乱す事故の予防
  // （MathLive自身が発火するinputイベントはisComposing=falseなので素通りし、onChange同期
  // には影響しない）。sinkに残る合成テキストはcompositionendでこちらがクリアする
  // （shadow rootはopenなのでcomposedPath()[0]で実ターゲット＝sinkに届く）。
  //
  // 合成を経由しない全角1文字keydown（Windowsの直接入力等）は従来通りその場で半角insert。
  // リスナーは <math-field> 自身にのみ付けるため、他の入力欄（メモ等）には一切影響しない
  // ＝電卓Editor外では通常のIME入力のまま（「モード切り替え時には戻す」相当）。
  //
  // 注意: MathLive内部のイベント配線（sinkのcapture登録・compositionInProgressフラグ・
  // inputハンドラのsinkクリア）を外から遮断する実装のため、MathLiveのバージョン更新時は
  // この節の前提が変わっていないか要確認。
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    // この合成セッションで挿入済みの（半角変換後の）テキスト
    let composedText = "";
    const applyComposition = (data: string) => {
      const next = toHalfWidth(data).replace(/ /g, "");
      let prefix = 0;
      while (
        prefix < composedText.length &&
        prefix < next.length &&
        composedText[prefix] === next[prefix]
      ) {
        prefix++;
      }
      for (let i = prefix; i < composedText.length; i++) {
        el.executeCommand("deleteBackward");
      }
      const suffix = next.slice(prefix);
      if (suffix.length > 0) el.insert(suffix, { focus: true });
      composedText = next;
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.key === "Process") {
        e.stopImmediatePropagation();
        return;
      }
      if (e.key.length === 1 && FULLWIDTH_RE.test(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const half = toHalfWidth(e.key);
        // 半角スペースはMathLiveでは意味を持たないので挿入しない
        if (half !== " ") el.insert(half, { focus: true });
      }
    };
    const handleCompositionStart = (ev: CompositionEvent) => {
      ev.stopImmediatePropagation();
      composedText = "";
    };
    const handleCompositionUpdate = (ev: CompositionEvent) => {
      ev.stopImmediatePropagation();
      applyComposition(ev.data ?? "");
    };
    const handleCompositionEnd = (ev: CompositionEvent) => {
      ev.stopImmediatePropagation();
      applyComposition(ev.data ?? "");
      composedText = "";
      const sink = ev.composedPath()[0];
      if (sink instanceof HTMLElement && sink !== el) sink.textContent = "";
    };
    const handleInput = (ev: Event) => {
      const ie = ev as InputEvent;
      if (ie.isComposing || ie.inputType === "insertCompositionText") {
        ev.stopImmediatePropagation();
      }
    };
    el.addEventListener("keydown", handleKeyDown, true);
    el.addEventListener("compositionstart", handleCompositionStart, true);
    el.addEventListener("compositionupdate", handleCompositionUpdate, true);
    el.addEventListener("compositionend", handleCompositionEnd, true);
    el.addEventListener("input", handleInput, true);
    return () => {
      el.removeEventListener("keydown", handleKeyDown, true);
      el.removeEventListener("compositionstart", handleCompositionStart, true);
      el.removeEventListener("compositionupdate", handleCompositionUpdate, true);
      el.removeEventListener("compositionend", handleCompositionEnd, true);
      el.removeEventListener("input", handleInput, true);
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
