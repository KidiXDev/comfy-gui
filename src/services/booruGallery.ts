const API_PATH = '/aaalice/booru-gallery';

export interface BooruSource {
  source: string;
  displayName: string;
  ratings: string[];
  sortValues: string[];
  maxPageSize: number;
  authFields: string[];
  authRequired: boolean;
  credentialsUrl: string;
}

export interface BooruPost {
  source: string;
  postId: string;
  postUrl: string;
  previewUrl: string;
  sampleUrl: string;
  width: number;
  height: number;
  rating: string;
  createdAt: string;
  favorite: boolean | null;
  score: number;
  favCount: number;
}

export interface BooruPostDetail extends BooruPost {
  mediaUrl: string;
  fileExt: string;
  fileSize: number;
  tags: Record<string, string[]>;
}

export interface BooruPage {
  posts: BooruPost[];
  nextCursor: string | null;
  ended: boolean;
  warnings: string[];
  page: number;
}

export interface BooruSettings {
  defaultSource: string;
  blacklist: string[];
  outputFilterTags: string[];
  promptDefaults: {
    categories: string[];
    replaceUnderscores: boolean;
    escapeParentheses: boolean;
  };
  timeout: number;
  cacheBudgetMiB: number;
  credentialStatus: Record<string, Record<string, boolean>>;
}

export interface BooruCredentials {
  danbooru: { username: string; apiKey: string };
  gelbooru: { userId: string; apiKey: string };
}

function apiUrl(serverUrl: string, path: string): string {
  return `${serverUrl.trim().replace(/\/+$/u, '')}${API_PATH}${path}`;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as
    (T & { message?: string }) | null;
  if (!response.ok) {
    throw new Error(
      payload?.message || `Booru request failed (${response.status})`
    );
  }
  if (!payload) throw new Error('Booru returned an empty response');
  return payload;
}

export async function fetchBooruSources(serverUrl: string) {
  return (
    await request<{ sources: BooruSource[] }>(apiUrl(serverUrl, '/sources'))
  ).sources;
}

export function searchBooru(
  serverUrl: string,
  options: {
    source: string;
    query: string;
    ratings: string[];
    sort: string;
    cursor?: string | null;
    limit?: number;
  }
) {
  const params = new URLSearchParams({
    source: options.source,
    query: options.query,
    sort: options.sort,
    limit: String(options.limit ?? 60)
  });
  if (options.cursor) params.set('cursor', options.cursor);
  for (const rating of options.ratings) params.append('rating', rating);
  return request<BooruPage>(apiUrl(serverUrl, `/search?${params}`));
}

export function fetchBooruDetail(
  serverUrl: string,
  source: string,
  postId: string
) {
  const params = new URLSearchParams({ source, postId });
  return request<BooruPostDetail>(apiUrl(serverUrl, `/detail?${params}`));
}

export function getBooruMediaUrl(
  serverUrl: string,
  source: string,
  url: string
) {
  const params = new URLSearchParams({ source, url });
  return apiUrl(serverUrl, `/media?${params}`);
}

export function fetchBooruSettings(serverUrl: string) {
  return request<BooruSettings>(apiUrl(serverUrl, '/settings'));
}

export interface BooruSettingsUpdate {
  defaultSource: string;
  blacklist: string[];
  outputFilterTags: string[];
  promptDefaults: BooruSettings['promptDefaults'];
  timeout: number;
  cacheBudgetMiB: number;
  credentials?: Partial<BooruCredentials>;
}

export function saveBooruSettings(
  serverUrl: string,
  update: BooruSettingsUpdate
) {
  return request<BooruSettings>(apiUrl(serverUrl, '/settings/save'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update)
  });
}

export function clearBooruCache(serverUrl: string) {
  return request<{ ok: boolean }>(apiUrl(serverUrl, '/cache/clear'), {
    method: 'POST'
  });
}

export function testBooruCredentials(
  serverUrl: string,
  source: keyof BooruCredentials,
  credentials: Record<string, string>
) {
  return request<{ ok: boolean }>(apiUrl(serverUrl, '/test'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, credentials })
  });
}

export function buildBooruPrompt(
  tags: Record<string, string[]>,
  defaults: BooruSettings['promptDefaults'],
  outputFilterTags: string[] = []
) {
  const excluded = new Set(outputFilterTags);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const category of defaults.categories) {
    for (const tag of tags[category] ?? []) {
      if (seen.has(tag) || excluded.has(tag)) continue;
      seen.add(tag);
      let value = defaults.replaceUnderscores ? tag.replaceAll('_', ' ') : tag;
      if (defaults.escapeParentheses) {
        value = value.replaceAll('(', '\\(').replaceAll(')', '\\)');
      }
      result.push(value);
    }
  }
  return result.join(', ');
}

export function formatBooruWarnings(warnings: string[]) {
  return warnings.flatMap((warning) => {
    if (warning === 'local-blacklist-filtered') return [];
    if (warning === 'restricted-media-hidden') {
      return ['Some restricted posts are unavailable for this account.'];
    }
    return [warning.replaceAll('-', ' ')];
  });
}
