import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 削除など破壊的操作のとき true（実行ボタンが赤になる） */
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface DialogContextValue {
  /** window.confirm の代替。OKで true */
  confirmDialog: (opts: ConfirmOptions) => Promise<boolean>;
  /** window.prompt の代替。キャンセルで null */
  promptDialog: (opts: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

type ActiveDialog =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOptions; resolve: (v: string | null) => void }
  | null;

export function DialogProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveDialog>(null);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const composingRef = useRef(false);

  const confirmDialog = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setActive({ kind: "confirm", opts, resolve });
    });
  }, []);

  const promptDialog = useCallback((opts: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setInputValue(opts.defaultValue ?? "");
      setActive({ kind: "prompt", opts, resolve });
    });
  }, []);

  const close = (result: boolean | string | null) => {
    if (!active) return;
    if (active.kind === "confirm") active.resolve(result === true);
    else active.resolve(typeof result === "string" ? result : null);
    setActive(null);
  };

  useEffect(() => {
    if (active?.kind === "prompt") {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [active]);

  return (
    <DialogContext.Provider value={{ confirmDialog, promptDialog }}>
      {children}
      {active && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => close(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="save-flash w-full max-w-sm space-y-3 rounded-lg bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-sm font-semibold text-slate-900">{active.opts.title}</h4>
            {active.opts.message && (
              <p className="whitespace-pre-wrap text-xs text-slate-600">{active.opts.message}</p>
            )}
            {active.kind === "prompt" && (
              <input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={active.opts.placeholder}
                onCompositionStart={() => {
                  composingRef.current = true;
                }}
                onCompositionEnd={() => {
                  // Safari は compositionend 後の確定 Enter keydown で isComposing が
                  // false になるため、フラグ解除を1フレーム遅らせて確定 Enter を無視する
                  requestAnimationFrame(() => {
                    composingRef.current = false;
                  });
                }}
                onKeyDown={(e) => {
                  const composing =
                    composingRef.current || e.nativeEvent.isComposing || e.keyCode === 229;
                  if (e.key === "Enter" && !composing && inputValue.trim()) {
                    close(inputValue);
                  }
                  if (e.key === "Escape" && !composing) close(null);
                }}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
              />
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => close(null)}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
              >
                {active.opts.cancelLabel ?? "キャンセル"}
              </button>
              <button
                onClick={() => close(active.kind === "prompt" ? inputValue : true)}
                disabled={active.kind === "prompt" && !inputValue.trim()}
                className={`rounded px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${
                  active.kind === "confirm" && active.opts.danger
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-slate-900 hover:bg-slate-700"
                }`}
              >
                {active.opts.confirmLabel ?? "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDialogs(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialogs must be used within DialogProvider");
  return ctx;
}
