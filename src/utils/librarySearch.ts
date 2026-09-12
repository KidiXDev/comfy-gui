import type {
  CharacterData,
  LibraryItem,
  LoraData,
  PromptData
} from '@/types/library';

/** Every searchable string on an item, lowercased. */
export function searchableText(item: LibraryItem): string {
  const parts: unknown[] = [item.name, item.description];
  const data = (item.data ?? {}) as Partial<
    CharacterData & PromptData & LoraData
  >;
  parts.push(
    data.series,
    data.trigger,
    data.notes,
    data.positive,
    data.negative
  );
  if (Array.isArray(data.tags)) parts.push(...data.tags);
  if (Array.isArray(data.loras)) parts.push(...data.loras.map((l) => l.name));
  return parts
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .join('\n')
    .toLowerCase();
}

/** Case-insensitive match; every whitespace-separated term must appear somewhere on the item. */
export function matchesQuery(item: LibraryItem, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/u).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = searchableText(item);
  return terms.every((t) => haystack.includes(t));
}

/** Name / trigger matches rank above tag / notes matches. */
export function searchCharacterEntries<T extends LibraryItem<CharacterData>>(
  entries: T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  const score = (e: T) => {
    const name = e.name.toLowerCase();
    const trigger = e.data.trigger?.toLowerCase() ?? '';
    if (name === q || trigger === q) return 3;
    if (name.includes(q) || trigger.includes(q)) return 2;
    return 1;
  };
  const matches = entries.filter((e) => matchesQuery(e, q));
  matches.sort((a, b) => score(b) - score(a));
  return matches;
}
