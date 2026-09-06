import { defineStore } from 'pinia';
import { ref } from 'vue';
import { LibraryService } from '../services/libraryService';
import type {
  CharacterData,
  LibraryCategory,
  LibraryItem,
  LibraryListEntry,
  LoraData,
  PromptData,
  SaveLibraryItemPayload
} from '../types/library';

export const useLibraryStore = defineStore('library', () => {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /** Map from category key → list entries (no data payload) */
  const itemsByCategory = ref<Record<string, LibraryListEntry[]>>({});
  const loadingCategory = ref<Record<string, boolean>>({});

  // ---------------------------------------------------------------------------
  // Fetchers
  // ---------------------------------------------------------------------------

  async function fetchCategory(category: LibraryCategory): Promise<void> {
    loadingCategory.value[category] = true;
    try {
      itemsByCategory.value[category] = await LibraryService.listItems(category);
    } finally {
      loadingCategory.value[category] = false;
    }
  }

  function isLoading(category: LibraryCategory): boolean {
    return loadingCategory.value[category] === true;
  }

  function getEntries(category: LibraryCategory): LibraryListEntry[] {
    return itemsByCategory.value[category] ?? [];
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async function saveItem<T>(
    item: SaveLibraryItemPayload<T>
  ): Promise<LibraryItem<T>> {
    const saved = await LibraryService.saveItem<T>(item);
    // Refresh the category list
    await fetchCategory(item.category);
    return saved;
  }

  async function deleteItem(id: string, category: LibraryCategory): Promise<void> {
    await LibraryService.deleteItem(id, category);
    if (itemsByCategory.value[category]) {
      itemsByCategory.value[category] = itemsByCategory.value[category].filter(
        (e) => e.id !== id
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Thumbnail helpers (delegated directly to LibraryService)
  // ---------------------------------------------------------------------------

  const saveThumbnailFromPath = LibraryService.saveThumbnailFromPath.bind(LibraryService);
  const saveThumbnailFromDataUrl = LibraryService.saveThumbnailFromDataUrl.bind(LibraryService);


  // ---------------------------------------------------------------------------
  // Typed convenience getters
  // ---------------------------------------------------------------------------

  function getPromptEntries(): LibraryListEntry[] {
    return getEntries('prompts');
  }

  function getLoraEntries(): LibraryListEntry[] {
    return getEntries('loras');
  }

  function getCharacterEntries(): LibraryListEntry[] {
    return getEntries('characters');
  }

  return {
    itemsByCategory,
    loadingCategory,
    fetchCategory,
    isLoading,
    getEntries,
    saveItem,
    deleteItem,
    saveThumbnailFromPath,
    saveThumbnailFromDataUrl,
    getPromptEntries,
    getLoraEntries,
    getCharacterEntries
  };
});

// Re-export types for convenience
export type { LibraryCategory, LibraryItem, LibraryListEntry, PromptData, LoraData, CharacterData };
