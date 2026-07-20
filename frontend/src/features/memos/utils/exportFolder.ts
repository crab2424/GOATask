import type { Folder } from "../../../api/folders";
import type { Memo } from "../../../api/memos";
import { sanitizeFilename } from "./exportMemo";

export type FolderExportFormat = "md" | "txt" | "zip";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const local: Uint8Array[] = [], central: Uint8Array[] = [];
  const encoder = new TextEncoder(); let offset = 0;
  const u16 = (v: number) => [v & 255, (v >>> 8) & 255];
  const u32 = (v: number) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  for (const entry of entries) {
    const name = encoder.encode(entry.name), crc = crc32(entry.data);
    const head = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(entry.data.length), ...u32(entry.data.length), ...u16(name.length), ...u16(0), ...name, ...entry.data]);
    local.push(head);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(entry.data.length), ...u32(entry.data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name]));
    offset += head.length;
  }
  const centralOffset = offset, centralBytes = central.reduce((n, x) => n + x.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(centralBytes), ...u32(centralOffset), ...u16(0)]);
  const out = new Uint8Array(offset + centralBytes + end.length); let pos = 0;
  for (const x of [...local, ...central, end]) { out.set(x, pos); pos += x.length; }
  return out;
}

export function exportFolderMemos(memos: Memo[], folders: Folder[], folderId: number | null, format: FolderExportFormat) {
  const selected = memos.filter((memo) => (memo.folder_id ?? null) === folderId);
  const folderName = folderId === null ? "root" : sanitizeFilename(folders.find((f) => f.id === folderId)?.name ?? "folder");
  if (format !== "zip") {
    const separator = "\n\n---\n\n";
    const text = selected.map((memo) => format === "md" ? `# ${memo.title}\n\n${memo.content}` : `${memo.title}\n${"=".repeat(Math.max(1, memo.title.length))}\n${memo.content}`).join(separator);
    download(new Blob([text], { type: format === "md" ? "text/markdown" : "text/plain" }), `${folderName}.${format}`);
    return;
  }
  const entries = selected.map((memo) => ({ name: `${folderName}/${sanitizeFilename(memo.title)}.md`, data: new TextEncoder().encode(memo.content ?? "") }));
  download(new Blob([zip(entries) as Uint8Array<ArrayBuffer>], { type: "application/zip" }), `${folderName}.zip`);
}
