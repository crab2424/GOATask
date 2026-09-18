import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_KEYBINDINGS,
  fetchUserSettings,
  type KeyAction,
  type Keybindings,
} from "../../api/settings";

/** Mac 系（macOS / iOS）か。修飾キーの解釈と表示に使う。 */
export const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/**
 * 割当文字列は "Ctrl+Shift+K" 形式。修飾キーの順は Ctrl / Control / Cmd / Alt / Shift、1文字キーは大文字。
 *
 * 修飾キートークンの意味（Windows と Mac で同じ設定を共有するため）:
 * - "Ctrl"    … 主修飾キー。Windows/Linux では Ctrl、Mac では ⌘(Command)
 * - "Control" … Mac の物理 Control キー（Mac で記録したときのみ生成される）
 * - "Cmd"     … 旧形式（Mac で ⌘ を記録した過去の保存値）。Mac では "Ctrl" と同じ扱い
 */
interface ParsedBinding {
  primary: boolean;
  control: boolean;
  cmd: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

function parseBinding(binding: string): ParsedBinding | null {
  const parts = binding.split("+");
  const key = parts.pop();
  if (!key) return null;
  const mods = new Set(parts);
  return {
    primary: mods.has("Ctrl"),
    control: mods.has("Control"),
    cmd: mods.has("Cmd"),
    alt: mods.has("Alt"),
    shift: mods.has("Shift"),
    key: key.length === 1 ? key.toUpperCase() : key,
  };
}

/** 割当が要求する ctrlKey / metaKey の組を、実行中のOSに合わせて解決する。 */
function expectedModifiers(parsed: ParsedBinding): { ctrlKey: boolean; metaKey: boolean } {
  if (IS_MAC) {
    return {
      metaKey: parsed.primary || parsed.cmd,
      ctrlKey: parsed.control,
    };
  }
  return {
    ctrlKey: parsed.primary || parsed.control,
    metaKey: parsed.cmd,
  };
}

export function matchesBinding(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
  binding: string | undefined,
): boolean {
  if (!binding) return false;
  const parsed = parseBinding(binding);
  if (!parsed) return false;
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  const expected = expectedModifiers(parsed);
  return (
    key === parsed.key &&
    event.ctrlKey === expected.ctrlKey &&
    event.metaKey === expected.metaKey &&
    event.altKey === parsed.alt &&
    event.shiftKey === parsed.shift
  );
}

/**
 * KeyboardEvent を割当文字列へ変換する（設定画面の記録用）。修飾キー単体は未確定として null。
 * Mac では ⌘ を主修飾キー "Ctrl" として記録し、物理 Control は "Control" として区別する。
 */
export function keyEventToBinding(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
): string | null {
  const key = event.key;
  if (key === "Control" || key === "Shift" || key === "Alt" || key === "Meta") return null;
  const parts: string[] = [];
  if (IS_MAC) {
    if (event.metaKey) parts.push("Ctrl");
    if (event.ctrlKey) parts.push("Control");
  } else {
    if (event.ctrlKey) parts.push("Ctrl");
    if (event.metaKey) parts.push("Cmd");
  }
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join("+");
}

/** IME変換中のキー入力か。変換中の Enter / Escape をショートカットとして扱わないために使う。 */
export function isComposingEvent(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}

/** テキスト入力系の要素にフォーカスがあるか。単発キー（Space, 矢印など）の誤爆防止に使う。 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true
  );
}

/** 確認ダイアログなどのモーダルが開いている間は画面側のショートカットを止める。 */
export function isModalOpen(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

/** サーバー保存済みのキー割当をデフォルトで補完して返す。設定画面と同じクエリキーを共有する。 */
export function useKeybindings(): Record<KeyAction, string> {
  const query = useQuery({
    queryKey: ["userSettings"],
    queryFn: fetchUserSettings,
    staleTime: 5 * 60 * 1000,
  });
  const saved: Keybindings | undefined = query.data?.keybindings;
  return useMemo(() => ({ ...DEFAULT_KEYBINDINGS, ...saved }), [saved]);
}

/**
 * document の keydown を購読する。handler は常に最新のクロージャが呼ばれるので、
 * 呼び出し側は依存配列を気にせず state を参照してよい。
 * モーダル表示中は呼ばれない。
 */
export function useGlobalKeydown(handler: (event: KeyboardEvent) => void, enabled = true) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isModalOpen()) return;
      ref.current(event);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

/** 割当表記を実行中のOS向けに整える（設定画面・ツールチップ用）。Mac では ⌘ ⌃ ⌥ ⇧ 表記。 */
export function formatBinding(binding: string): string {
  const arrows = (s: string) =>
    s.replace("ArrowLeft", "←").replace("ArrowRight", "→").replace("ArrowUp", "↑").replace("ArrowDown", "↓");
  if (!IS_MAC) return arrows(binding.replace("Control", "Ctrl"));
  return arrows(
    binding
      .split("+")
      .map((part) => {
        switch (part) {
          case "Ctrl":
          case "Cmd":
            return "⌘";
          case "Control":
            return "⌃";
          case "Alt":
            return "⌥";
          case "Shift":
            return "⇧";
          default:
            return part;
        }
      })
      .join("+"),
  );
}
