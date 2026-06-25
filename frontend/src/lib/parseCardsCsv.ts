export interface ParsedCard {
  front: string;
  back: string;
}

export class CsvParseError extends Error {
  line: number;
  constructor(line: number, message: string) {
    super(`${line}行目: ${message}`);
    this.line = line;
  }
}

// RFC4180準拠の最小CSVパーサ（カンマ区切り固定，タブは普通の文字として扱わず明示エラー）
// 仕様:
//   - 各レコードは「表,裏」の2列
//   - "..." でクォート可，"" で " をエスケープ
//   - クォート内では改行を含めてよい
//   - 空行はスキップ
//   - タブ文字を含む行はエラー
//   - 列数が2でない行はエラー
export function parseCardsCsv(input: string): ParsedCard[] {
  const text = input.replace(/^﻿/, "");
  const rows: { fields: string[]; startLine: number }[] = [];
  let field = "";
  let fields: string[] = [];
  let inQuotes = false;
  let line = 1;
  let recordStartLine = 1;
  let recordHasContent = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      if (field.length === 0) {
        inQuotes = true;
      } else {
        throw new CsvParseError(line, '"" の使い方が不正です');
      }
      recordHasContent = true;
      continue;
    }
    if (ch === "\t") {
      throw new CsvParseError(line, "タブ文字は使用できません（カンマ区切りのみ）");
    }
    if (ch === ",") {
      fields.push(field);
      field = "";
      recordHasContent = true;
      continue;
    }
    if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      fields.push(field);
      if (recordHasContent) rows.push({ fields, startLine: recordStartLine });
      field = "";
      fields = [];
      line++;
      recordStartLine = line;
      recordHasContent = false;
      continue;
    }
    if (ch === "\n") {
      fields.push(field);
      if (recordHasContent) rows.push({ fields, startLine: recordStartLine });
      field = "";
      fields = [];
      line++;
      recordStartLine = line;
      recordHasContent = false;
      continue;
    }
    field += ch;
    recordHasContent = true;
  }
  if (inQuotes) {
    throw new CsvParseError(recordStartLine, "クォートが閉じられていません");
  }
  if (recordHasContent) {
    fields.push(field);
    rows.push({ fields, startLine: recordStartLine });
  }

  const result: ParsedCard[] = [];
  for (const row of rows) {
    if (row.fields.length !== 2) {
      throw new CsvParseError(
        row.startLine,
        `列数が2ではありません（${row.fields.length}列）`,
      );
    }
    const front = row.fields[0].trim();
    const back = row.fields[1].trim();
    if (front === "" || back === "") {
      throw new CsvParseError(row.startLine, "表または裏が空です");
    }
    result.push({ front, back });
  }
  return result;
}
