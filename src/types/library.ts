// ---------------------------------------------------------------------------
// Library system — shared TypeScript types
// ---------------------------------------------------------------------------

export type LibraryCategory = 'prompts' | 'loras' | 'characters' | string;

// ---------------------------------------------------------------------------
// Data payloads per category
// ---------------------------------------------------------------------------

export interface PromptData {
  /** Which prompt fields this preset covers. */
  type: 'both' | 'positive' | 'negative';
  positive?: string;
  negative?: string;
}

export interface LoraData {
  loras: Array<{
    name: string;
    strength: number;
    enabled: boolean;
  }>;
}

export interface CharacterData {
  /** Series / franchise / copyright name, e.g. "Hololive" */
  series?: string;
  /** Primary trigger tag used in the prompt, e.g. "hatsune_miku" */
  trigger: string;
  /** Additional descriptive tags: hair, eyes, outfit, accessories, etc. */
  tags: string[];
  /** Where this entry originated — "local" | "animadex" | "manual" */
  source?: string;
  /** Animadex character slug if this was imported from there */
  animadexSlug?: string;
}

// ---------------------------------------------------------------------------
// Core item shape (full, with data payload)
// ---------------------------------------------------------------------------

export interface LibraryItem<T = unknown> {
  id: string;
  category: LibraryCategory;
  name: string;
  description?: string;
  /** Stem of the JPEG file in the thumbnails folder. */
  thumbnailId?: string;
  /** Resolved comfygui-library:// URL, populated client-side after fetch. */
  thumbnailUrl?: string;
  data: T;
  createdAt: number;
  updatedAt: number;
}

export type SaveLibraryItemPayload<T = unknown> = Omit<
  LibraryItem<T>,
  'id' | 'thumbnailUrl' | 'createdAt' | 'updatedAt'
> & {
  id?: string;
  createdAt?: number;
  updatedAt?: number;
};

// ---------------------------------------------------------------------------
// Lightweight list entry (no data payload — returned by library_list_items)
// ---------------------------------------------------------------------------

export interface LibraryListEntry {
  id: string;
  category: LibraryCategory;
  name: string;
  description?: string;
  thumbnailId?: string;
  thumbnailUrl?: string;
  createdAt: number;
  updatedAt: number;
}


// ---------------------------------------------------------------------------
// Convenience aliases that keep backward-compatibility with old preset types
// ---------------------------------------------------------------------------

export type PromptLibraryItem = LibraryItem<PromptData>;
export type LoraLibraryItem = LibraryItem<LoraData>;
export type CharacterLibraryItem = LibraryItem<CharacterData>;
