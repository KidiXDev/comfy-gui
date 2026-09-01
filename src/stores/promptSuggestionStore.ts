import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  DEFAULT_PROMPT_CATEGORIES,
  type PromptCategory
} from '../data/promptSuggestions';
import { PromptSuggestionService } from '../services/promptSuggestionService';

const openSuggestionsFolder = () => PromptSuggestionService.openFolder();

export const usePromptSuggestionStore = defineStore('promptSuggestions', () => {
  const categories = ref<PromptCategory[]>(DEFAULT_PROMPT_CATEGORIES);
  const isLoading = ref(false);
  const hasLoaded = ref(false);
  const error = ref<string | null>(null);

  const categoryMap = computed<Record<string, PromptCategory>>(() =>
    Object.fromEntries(categories.value.map((c) => [c.id, c]))
  );

  const totalTagsCount = computed(() =>
    categories.value.reduce((acc, cat) => acc + (cat.tags?.length ?? 0), 0)
  );

  async function loadSuggestions() {
    isLoading.value = true;
    error.value = null;
    try {
      const loaded = await PromptSuggestionService.loadSuggestions();
      categories.value = loaded;
      hasLoaded.value = true;
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Failed to load suggestions';
    } finally {
      isLoading.value = false;
    }
  }

  async function init() {
    if (!hasLoaded.value) {
      await loadSuggestions();
    }
  }

  async function reload() {
    await loadSuggestions();
  }

  return {
    categories,
    isLoading,
    hasLoaded,
    error,
    categoryMap,
    totalTagsCount,
    init,
    reload,
    openFolder: openSuggestionsFolder
  };
});
