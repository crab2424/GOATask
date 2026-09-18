import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_KEYBINDINGS,
  fetchUserSettings,
  type KeyAction,
  type Keybindings,
} from "../../api/settings";

/**
 * 設定画面で記録した "Ctrl+Shift+K" 形式の割当と KeyboardEvent を照合する。
 * 記録側 (KeybindingsSection.keyEventToBinding) と同じ正規化を行う:
 * 修飾キーは Ctrl / Cmd / Alt / Shift の順、1文字キーは大文字化。
 */
interface ParsedBinding {
  ctrl: boolean;
  meta: boolean;
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
    ctrl: mods.has("Ctrl"),
    meta: mods.has("Cmd"),
    alt: mods.has("Alt"),
    shift: mods.has("Shift"),
    key: key.length === 1 ? key.toUpperCase() : key,
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
  return (
    key === parsed.key &&
    event.ctrlKey === parsed.ctrl &&
    event.metaKey === parsed.meta &&
    event.altKey === parsed.alt &&
    event.shiftKey === parsed.shift
  );
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

/** 割当表記を表示用に短く整える（設定画面・ツールチップ用）。 */
export function formatBinding(binding: string): string {
  return binding.replace("ArrowLeft", "←").replace("ArrowRight", "→").replace("ArrowUp", "↑").replace("ArrowDown", "↓");
}
