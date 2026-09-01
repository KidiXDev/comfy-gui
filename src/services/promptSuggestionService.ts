import { invoke } from '@tauri-apps/api/core';
import {
  DEFAULT_PROMPT_CATEGORIES,
  type PromptCategory
} from '../data/promptSuggestions';

export const PromptSuggestionService = {
  async loadSuggestions(): Promise<PromptCategory[]> {
    try {
      const categories = await invoke<PromptCategory[]>(
        'load_prompt_suggestions'
      );
      if (Array.isArray(categories) && categories.length > 0) {
        return categories;
      }
      return DEFAULT_PROMPT_CATEGORIES;
    } catch (err) {
      console.warn(
        '[PromptSuggestionService] Failed to load prompt suggestions from backend, using defaults:',
        err
      );
      return DEFAULT_PROMPT_CATEGORIES;
    }
  },

  async openFolder(): Promise<void> {
    try {
      await invoke('open_prompt_suggestions_folder');
    } catch (err) {
      console.warn(
        '[PromptSuggestionService] Failed to open prompt suggestions folder:',
        err
      );
    }
  }
};
