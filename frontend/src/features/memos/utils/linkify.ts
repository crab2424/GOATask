export interface UrlSpan {
  start: number;
  end: number;
  url: string;
}

const URL_PATTERN = /https?:\/\/[^\s<>"'「」『』（）【】]+/g;
/** URL末尾に付きがちな句読点・閉じ括弧は文章側の文字とみなして除外する */
const TRAILING_PUNCT = /[.,;:!?)\]}、。！？]+$/;

/** 本文中の http(s) URL を出現順に返す。 */
export function findUrls(text: string): UrlSpan[] {
  const spans: UrlSpan[] = [];
  for (const m of text.matchAll(URL_PATTERN)) {
    const url = m[0].replace(TRAILING_PUNCT, "");
    if (url.length <= "https://".length) continue;
    spans.push({ start: m.index, end: m.index + url.length, url });
  }
  return spans;
}

/** 位置 pos（カーソル位置）を含むURL。URLの直後にカーソルがある場合も含む。 */
export function urlAt(text: string, pos: number): string | null {
  return findUrls(text).find((s) => s.start <= pos && pos <= s.end)?.url ?? null;
}

export function openUrl(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
