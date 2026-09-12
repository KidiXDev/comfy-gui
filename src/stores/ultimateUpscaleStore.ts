import { loadAppData, saveAppData } from '@/services/appStorage';
import type {
  LoraItem,
  ModelSettings,
  UltimateUpscaleSettings
} from '@/types/workflow';
import { useDebounceFn } from '@vueuse/core';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { DEFAULT_ULTIMATE_UPSCALE } from './workflowStore';

interface UltimateUpscalePreferences {
  models: ModelSettings;
  loras: LoraItem[];
  settings: UltimateUpscaleSettings;
  positivePrompt: string;
  negativePrompt: string;
  seed: number;
}

export const useUltimateUpscaleStore = defineStore('ultimate-upscale', () => {
  const state = ref<UltimateUpscalePreferences>({
    models: { unetName: '', clipName: '', vaeName: '', shift: 3 },
    loras: [],
    settings: { ...DEFAULT_ULTIMATE_UPSCALE, enabled: true },
    positivePrompt: '',
    negativePrompt: '',
    seed: -1
  });
  const loaded = ref(false);
  const save = useDebounceFn(() => {
    void saveAppData('ultimate_upscale_preferences', state.value).catch(
      console.error
    );
  }, 400);
  watch(
    state,
    () => {
      if (loaded.value) void save();
    },
    { deep: true }
  );
  async function init() {
    try {
      const saved = await loadAppData<Partial<UltimateUpscalePreferences>>(
        'ultimate_upscale_preferences'
      );
      if (saved)
        state.value = {
          models: { ...state.value.models, ...saved.models },
          settings: {
            ...DEFAULT_ULTIMATE_UPSCALE,
            ...saved.settings,
            enabled: true
          },
          loras: Array.isArray(saved.loras) ? saved.loras : [],
          positivePrompt: saved.positivePrompt ?? '',
          negativePrompt: saved.negativePrompt ?? '',
          seed: typeof saved.seed === 'number' ? saved.seed : -1
        };
    } catch (error) {
      console.error('Could not load Ultimate SD Upscale settings', error);
    } finally {
      loaded.value = true;
    }
  }
  void init();
  return { state, loaded };
});
