import { loadAppData, saveAppData } from '@/services/appStorage';
import type {
  FaceDetailerSettings,
  LoraItem,
  ModelSettings
} from '@/types/workflow';
import { useDebounceFn } from '@vueuse/core';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { DEFAULT_FACE_DETAILER } from './workflowStore';

interface DetailerPreferences {
  models: ModelSettings;
  loras: LoraItem[];
  settings: FaceDetailerSettings;
  seed: number;
}

export const useFaceDetailerStore = defineStore('face-detailer', () => {
  const state = ref<DetailerPreferences>({
    models: { unetName: '', clipName: '', vaeName: '', shift: 3 },
    loras: [],
    settings: { ...DEFAULT_FACE_DETAILER },
    seed: -1
  });
  const loaded = ref(false);
  const save = useDebounceFn(() => {
    void saveAppData('face_detailer_preferences', state.value).catch(
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
      const saved = await loadAppData<Partial<DetailerPreferences>>(
        'face_detailer_preferences'
      );
      if (saved)
        state.value = {
          models: { ...state.value.models, ...saved.models },
          settings: { ...DEFAULT_FACE_DETAILER, ...saved.settings },
          loras: Array.isArray(saved.loras) ? saved.loras : [],
          seed: typeof saved.seed === 'number' ? saved.seed : -1
        };
    } catch (error) {
      console.error('Could not load Face Detailer settings', error);
    } finally {
      loaded.value = true;
    }
  }
  void init();
  return { state, loaded };
});
