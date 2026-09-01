export interface PromptTokenRange {
  start: number;
  end: number;
  query: string;
  mode: 'tag' | 'artist' | 'wildcard';
}

export function getPromptTokenRange(
  text: string,
  cursor: number
): PromptTokenRange | null {
  let start = cursor;
  while (start > 0 && ![',', '\n'].includes(text[start - 1])) start--;
  let end = cursor;
  while (end < text.length && ![',', '\n'].includes(text[end])) end++;
  const token = text.slice(start, cursor).trim();
  const mode = token.startsWith('@')
    ? 'artist'
    : token.startsWith('$')
      ? 'wildcard'
      : 'tag';
  const query = (mode === 'tag' ? token : token.slice(1))
    .toLowerCase()
    .replaceAll(' ', '_');
  return query || mode !== 'tag' ? { start, end, query, mode } : null;
}

export function replacePromptToken(
  text: string,
  range: PromptTokenRange,
  tag: string,
  replaceUnderscores = false,
  includeArtistPrefix = true
): { text: string; cursor: number } {
  const prefix = text.slice(0, range.start);
  const separator = prefix.endsWith(',')
    ? ' '
    : prefix && !/\s$/u.test(prefix)
      ? ' '
      : '';
  const value =
    range.mode !== 'wildcard' && replaceUnderscores
      ? tag.replaceAll('_', ' ')
      : tag;
  const marker = range.mode === 'artist' && includeArtistPrefix ? '@' : '';
  const inserted = `${separator}${marker}${value}, `;
  return {
    text: prefix + inserted + text.slice(range.end).replace(/^\s*,?\s*/u, ''),
    cursor: prefix.length + inserted.length
  };
}
