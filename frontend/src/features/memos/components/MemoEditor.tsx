import type { FormEvent, RefObject } from "react";
import type { Memo } from "../../../api/memos";
import { EXPORT_FORMATS, exportMemo } from "../utils/exportMemo";
import { PRESET_COLORS, isValidColor } from "../utils/memoColor";
import { FONT_SIZES, fontSizePx, type FontSize } from "../utils/memoFontSize";

interface EditorState {
  title: string;
  content: string;
  folderId: number | null;
  color: string;
  fontSize: FontSize;
  exportOpen: boolean;
  exportFlipUp: boolean;
  colorOpen: boolean;
  exportRef: RefObject<HTMLDivElement | null>;
  colorRef: RefObject<HTMLDivElement | null>;
  flatFolderOptions: { id: number; label: string }[];
  selected: Memo | null;
  /** 保存API呼び出し中。ボタン・入力を無効化して処理中を示す */
  saving: boolean;
  /** 保存直後の完了表示（一定時間で消える） */
  justSaved: boolean;
}

interface EditorActions {
  setTitle: (v: string) => void;
  setContent: (v: string) => void;
  setFolderId: (v: number | null) => void;
  setColor: (v: string) => void;
  setFontSize: (v: FontSize) => void;
  setExportOpen: (v: boolean) => void;
  setExportFlipUp: (v: boolean) => void;
  setColorOpen: (v: boolean) => void;
  onSubmit: (e: FormEvent) => void;
  onDelete: () => void;
}

export function renderMemoEditor(s: EditorState, a: EditorActions) {
  return (
    <form
      onSubmit={a.onSubmit}
      className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-opacity ${s.saving ? "pointer-events-none opacity-60" : ""}`}
      aria-busy={s.saving}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="text-sm text-slate-600">フォルダ:</label>
        <select
          value={s.folderId ?? ""}
          onChange={(e) =>
            a.setFolderId(e.target.value === "" ? null : Number(e.target.value))
          }
          className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
        >
          <option value="">（ルート）</option>
          {s.flatFolderOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>

        <label className="ml-2 text-sm text-slate-600">サイズ:</label>
        <select
          value={s.fontSize}
          onChange={(e) => a.setFontSize(e.target.value as FontSize)}
          className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
        >
          {FONT_SIZES.map((sz) => (
            <option key={sz.value} value={sz.value}>
              {sz.label}
            </option>
          ))}
        </select>

        <div ref={s.colorRef} className="relative ml-2">
          <button
            type="button"
            onClick={() => a.setColorOpen(!s.colorOpen)}
            className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100"
            title="色を選ぶ"
          >
            <span
              className="inline-block h-4 w-4 rounded border border-slate-300"
              style={{
                backgroundColor: isValidColor(s.color)
                  ? s.color
                  : "transparent",
                backgroundImage: isValidColor(s.color)
                  ? undefined
                  : "linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%), linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%)",
                backgroundSize: "8px 8px",
                backgroundPosition: "0 0, 4px 4px",
              }}
            />
            色 ▾
          </button>
          {s.colorOpen && (
            <div className="absolute left-0 z-10 mt-1 w-56 rounded border border-slate-200 bg-white p-2 shadow-lg">
              <div className="mb-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => {
                    a.setColor("");
                    a.setColorOpen(false);
                  }}
                  title="色なし"
                  className={`h-6 w-6 rounded border ${
                    s.color === ""
                      ? "border-slate-900 ring-1 ring-slate-900"
                      : "border-slate-300"
                  } flex items-center justify-center text-xs text-slate-500`}
                >
                  ×
                </button>
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => {
                      a.setColor(c.value);
                      a.setColorOpen(false);
                    }}
                    title={c.label}
                    style={{ backgroundColor: c.value }}
                    className={`h-6 w-6 rounded border ${
                      s.color === c.value
                        ? "border-slate-900 ring-1 ring-slate-900"
                        : "border-slate-300"
                    }`}
                  />
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                カスタム:
                <input
                  type="color"
                  value={isValidColor(s.color) ? s.color : "#cccccc"}
                  onChange={(e) => a.setColor(e.target.value)}
                  className="h-6 w-10 cursor-pointer rounded border border-slate-300 p-0"
                />
              </label>
            </div>
          )}
        </div>
      </div>
      <input
        value={s.title}
        onChange={(e) => a.setTitle(e.target.value)}
        placeholder="タイトル"
        style={{
          borderLeft: isValidColor(s.color)
            ? `4px solid ${s.color}`
            : undefined,
          backgroundColor: isValidColor(s.color) ? `${s.color}22` : undefined,
        }}
        className="mb-2 w-full rounded border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
      />
      <textarea
        value={s.content}
        onChange={(e) => a.setContent(e.target.value)}
        placeholder="内容（プレーンテキスト）"
        rows={14}
        style={{ fontSize: `${fontSizePx(s.fontSize)}px`, lineHeight: 1.6 }}
        className="mb-2 w-full rounded border border-slate-300 px-3 py-2 font-mono focus:border-slate-500 focus:outline-none"
      />
      <div className="mb-2 text-right text-xs text-slate-500">
        {[...s.content].length}文字 /{" "}
        {s.content.trim() === ""
          ? 0
          : s.content.trim().split(/\s+/).length}
        単語
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 disabled:bg-slate-400"
          disabled={!s.title.trim() || s.saving}
        >
          {s.saving ? (s.selected ? "更新中..." : "作成中...") : s.selected ? "更新" : "作成"}
        </button>
        {s.justSaved && (
          <span className="save-flash flex items-center gap-1 text-sm font-medium text-green-600">
            ✓ 保存しました
          </span>
        )}
        {s.selected && (
          <button
            type="button"
            onClick={a.onDelete}
            className="rounded border border-rose-300 px-4 py-2 text-rose-700 hover:bg-rose-50"
          >
            削除
          </button>
        )}
        {s.selected && (
          <div ref={s.exportRef} className="relative ml-auto">
            <button
              type="button"
              onClick={() => {
                if (!s.exportOpen) {
                  const btn = s.exportRef.current?.querySelector("button");
                  if (btn) {
                    const rect = btn.getBoundingClientRect();
                    const estHeight = EXPORT_FORMATS.length * 40 + 16;
                    a.setExportFlipUp(
                      window.innerHeight - rect.bottom < estHeight &&
                        rect.top > estHeight,
                    );
                  }
                }
                a.setExportOpen(!s.exportOpen);
              }}
              className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
            >
              エクスポート ▾
            </button>
            {s.exportOpen && (
              <ul
                className={`absolute right-0 z-10 w-56 rounded border border-slate-200 bg-white py-1 text-sm shadow-lg ${
                  s.exportFlipUp ? "bottom-full mb-1" : "top-full mt-1"
                }`}
              >
                {EXPORT_FORMATS.map((fmt) => (
                  <li key={fmt.ext}>
                    <button
                      type="button"
                      onClick={() => {
                        if (s.selected) exportMemo(s.selected, fmt);
                        a.setExportOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-100"
                    >
                      {fmt.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
