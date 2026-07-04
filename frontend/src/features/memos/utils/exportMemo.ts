import type { Memo } from "../../../api/memos";

export interface ExportFormat {
  ext: string;
  mime: string;
  label: string;
}

export const EXPORT_FORMATS: ExportFormat[] = [
  { ext: "txt", mime: "text/plain", label: ".txt（プレーンテキスト）" },
  { ext: "md", mime: "text/markdown", label: ".md（Markdown）" },
];

const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;

export function sanitizeFilename(name: string): string {
  const trimmed = name.replace(INVALID_FILENAME_CHARS, "_").trim();
  return trimmed === "" ? "memo" : trimmed;
}

export function exportMemo(memo: Memo, format: ExportFormat): void {
  const blob = new Blob([memo.content ?? ""], {
    type: `${format.mime};charset=utf-8`,
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilename(memo.title)}.${format.ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
