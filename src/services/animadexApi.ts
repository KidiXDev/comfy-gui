import { invoke } from '@tauri-apps/api/core';
import type {
  AnimaDexFacet,
  ArtistFacetsResponse,
  ArtistFilterParams,
  ArtistSearchResponse,
  CharacterFacetsResponse,
  CharacterFilterParams,
  CharacterSearchResponse,
  CopyrightFacetsResponse,
  CopyrightFilterParams,
  CopyrightSearchResponse
} from '../types/animadex';

export const ANIMADEX_BASE_URL = 'https://animadex.net';

export function resolveAnimadexMediaUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    return rawUrl;
  }
  const cleanPath = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
  return `${ANIMADEX_BASE_URL}${cleanPath}`;
}

async function requestAnimadex<T>(endpointUrl: string): Promise<T> {
  const isTauri =
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

  if (isTauri) {
    try {
      return await invoke<T>('animadex_request', { url: endpointUrl });
    } catch (err) {
      console.warn(
        'Tauri animadex_request failed, falling back to fetch:',
        err
      );
    }
  }

  const fullUrl = endpointUrl.startsWith('http')
    ? endpointUrl
    : `${ANIMADEX_BASE_URL}${endpointUrl.startsWith('/') ? endpointUrl : `/${endpointUrl}`}`;

  const res = await fetch(fullUrl);
  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(
      `AnimaDex request failed (${res.status}): ${errorText || res.statusText}`
    );
  }
  return (await res.json()) as T;
}

export async function searchCharacters(
  params: CharacterFilterParams
): Promise<CharacterSearchResponse> {
  const query = new URLSearchParams();

  if (params.q?.trim()) {
    query.set('q', params.q.trim());
  }
  if (params.page && params.page > 0) {
    query.set('page', params.page.toString());
  }
  query.set('sort', params.sort || 'count');
  if (params.sort === 'random' && params.seed !== undefined) {
    query.set('seed', params.seed.toString());
  }
  if (params.loras) {
    query.set('loras', '1');
  }

  const multiKeys: (keyof CharacterFilterParams)[] = [
    'character',
    'copyright',
    'hair_color',
    'hair_length',
    'eye_color',
    'gender'
  ];

  for (const key of multiKeys) {
    const values = params[key];
    if (Array.isArray(values)) {
      for (const val of values) {
        if (val) query.append(key, val);
      }
    }
  }

  const res = await requestAnimadex<CharacterSearchResponse>(
    `/api/characters/search?${query.toString()}`
  );

  return {
    ...res,
    results: (res.results || []).map((item) => ({
      ...item,
      thumb_url: resolveAnimadexMediaUrl(item.thumb_url),
      img_url: resolveAnimadexMediaUrl(item.img_url)
    }))
  };
}

export async function searchArtists(
  params: ArtistFilterParams
): Promise<ArtistSearchResponse> {
  const query = new URLSearchParams();

  if (params.q?.trim()) {
    query.set('q', params.q.trim());
  }
  if (params.page && params.page > 0) {
    query.set('page', params.page.toString());
  }
  query.set('sort', params.sort || 'count');
  if (params.sort === 'random' && params.seed !== undefined) {
    query.set('seed', params.seed.toString());
  }

  const multiKeys: (keyof ArtistFilterParams)[] = [
    'artist',
    'score',
    'category'
  ];

  for (const key of multiKeys) {
    const values = params[key];
    if (Array.isArray(values)) {
      for (const val of values) {
        if (val) query.append(key, val);
      }
    }
  }

  const res = await requestAnimadex<ArtistSearchResponse>(
    `/api/artists/search?${query.toString()}`
  );

  return {
    ...res,
    results: (res.results || []).map((item) => ({
      ...item,
      thumb_url: resolveAnimadexMediaUrl(item.thumb_url),
      img_url: resolveAnimadexMediaUrl(item.img_url)
    }))
  };
}

export async function searchCopyrights(
  params: CopyrightFilterParams
): Promise<CopyrightSearchResponse> {
  const query = new URLSearchParams();

  if (params.q?.trim()) {
    query.set('q', params.q.trim());
  }
  if (params.page && params.page > 0) {
    query.set('page', params.page.toString());
  }
  query.set('sort', params.sort || 'count');
  if (params.sort === 'random' && params.seed !== undefined) {
    query.set('seed', params.seed.toString());
  }

  const res = await requestAnimadex<CopyrightSearchResponse>(
    `/api/copyrights/search?${query.toString()}`
  );

  return {
    ...res,
    results: (res.results || []).map((item) => ({
      ...item,
      thumb_url: resolveAnimadexMediaUrl(item.thumb_url)
    }))
  };
}

export async function getCharacterFacets(): Promise<CharacterFacetsResponse> {
  return requestAnimadex<CharacterFacetsResponse>('/api/characters/facets');
}

export async function getArtistFacets(): Promise<ArtistFacetsResponse> {
  return requestAnimadex<ArtistFacetsResponse>('/api/artists/facets');
}

export async function getCopyrightFacets(): Promise<CopyrightFacetsResponse> {
  return requestAnimadex<CopyrightFacetsResponse>('/api/copyrights/facets');
}

export async function searchFacet(
  mode: 'characters' | 'artists',
  facet: string,
  searchQuery: string
): Promise<AnimaDexFacet> {
  const query = new URLSearchParams();
  if (searchQuery.trim()) {
    query.set('q', searchQuery.trim());
  }
  return requestAnimadex<AnimaDexFacet>(
    `/api/${mode}/facet/${facet}?${query.toString()}`
  );
}
