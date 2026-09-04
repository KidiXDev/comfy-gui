export interface AnimaDexLora {
  name: string;
  url?: string;
  thumb?: string;
}

export interface AnimaDexCharacter {
  slug: string;
  name: string;
  copyright: string;
  copyright_name: string;
  trigger: string;
  tags: string[];
  count: number;
  url: string;
  thumb_url: string;
  img_url: string;
  has_image: boolean;
  loras?: AnimaDexLora[];
  fav_count?: number;
}

export interface AnimaDexArtist {
  slug: string;
  name: string;
  trigger: string;
  count: number;
  url: string;
  score: number | null;
  thumb_url: string;
  img_url: string;
  has_image: boolean;
  fav_count?: number;
}

export interface AnimaDexCopyright {
  slug: string;
  name: string;
  count: number;
  thumb_url: string;
  has_image: boolean;
}

export interface AnimaDexPaginatedResponse<T> {
  total: number;
  page: number;
  page_size: number;
  pages: number;
  results: T[];
}

export type CharacterSearchResponse =
  AnimaDexPaginatedResponse<AnimaDexCharacter>;
export type ArtistSearchResponse = AnimaDexPaginatedResponse<AnimaDexArtist>;
export type CopyrightSearchResponse =
  AnimaDexPaginatedResponse<AnimaDexCopyright>;

export interface AnimaDexFacetValue {
  value: string;
  label: string;
  count: number;
}

export interface AnimaDexFacet {
  label: string;
  total: number;
  values: AnimaDexFacetValue[];
}

export interface CharacterFacetsResponse {
  total: number;
  facets: {
    character: AnimaDexFacet;
    copyright: AnimaDexFacet;
    hair_color: AnimaDexFacet;
    hair_length: AnimaDexFacet;
    eye_color: AnimaDexFacet;
    gender: AnimaDexFacet;
  };
}

export interface ArtistFacetsResponse {
  total: number;
  facets: {
    artist: AnimaDexFacet;
    score: AnimaDexFacet;
    category: AnimaDexFacet;
  };
}

export interface CopyrightFacetsResponse {
  total: number;
  facets: Record<string, AnimaDexFacet>;
}

export type CharacterSortOption = 'count' | 'az' | 'random';
export type ArtistSortOption = 'count' | 'az' | 'random' | 'score';
export type CopyrightSortOption = 'count' | 'az' | 'random';

export interface CharacterFilterParams {
  q?: string;
  page?: number;
  sort?: CharacterSortOption;
  seed?: number | string;
  character?: string[];
  copyright?: string[];
  hair_color?: string[];
  hair_length?: string[];
  eye_color?: string[];
  gender?: string[];
  loras?: boolean;
}

export interface ArtistFilterParams {
  q?: string;
  page?: number;
  sort?: ArtistSortOption;
  seed?: number | string;
  artist?: string[];
  score?: string[];
  category?: string[];
}

export interface CopyrightFilterParams {
  q?: string;
  page?: number;
  sort?: CopyrightSortOption;
  seed?: number | string;
}
