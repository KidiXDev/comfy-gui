import { useDebounceFn } from '@vueuse/core';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { loadAppData, saveAppData } from '../services/appStorage';
import { fetchCivitaiBaseModels } from '../services/civitai';

export interface CivitaiBrowserFilterState {
  modelType?: string;
  baseModel?: string;
  sort?: string;
  period?: string;
}

export const useCivitaiStore = defineStore('civitai', () => {
  const isLoaded = ref(false);
  const query = ref('');
  const modelType = ref('all');
  const baseModel = ref('all');
  const sort = ref('Most Downloaded');
  const period = ref('AllTime');
  const baseModels = ref<string[]>([]);

  const persistState = useDebounceFn(async () => {
    if (!isLoaded.value) return;
    try {
      await saveAppData('civitai_browser_state', {
        modelType: modelType.value,
        baseModel: baseModel.value,
        sort: sort.value,
        period: period.value
      });
    } catch (err) {
      console.error('Failed to save civitai browser state:', err);
    }
  }, 400);

  watch([modelType, baseModel, sort, period], () => {
    void persistState();
  });

  async function loadState() {
    try {
      const saved = await loadAppData<CivitaiBrowserFilterState>(
        'civitai_browser_state'
      );
      if (saved) {
        if (typeof saved.modelType === 'string')
          modelType.value = saved.modelType;
        if (typeof saved.baseModel === 'string')
          baseModel.value = saved.baseModel;
        if (typeof saved.sort === 'string') sort.value = saved.sort;
        if (typeof saved.period === 'string') period.value = saved.period;
      }
    } catch (err) {
      console.error('Failed to load civitai browser state:', err);
    } finally {
      isLoaded.value = true;
    }
  }

  async function loadBaseModels() {
    try {
      const list = await fetchCivitaiBaseModels();
      baseModels.value = list;
    } catch (err) {
      console.error('Failed to load civitai base models:', err);
    }
  }

  function resetFilters() {
    query.value = '';
    modelType.value = 'all';
    baseModel.value = 'all';
    sort.value = 'Most Downloaded';
    period.value = 'AllTime';
  }

  async function init() {
    await Promise.all([loadState(), loadBaseModels()]);
  }

  return {
    isLoaded,
    query,
    modelType,
    baseModel,
    sort,
    period,
    baseModels,
    init,
    loadState,
    loadBaseModels,
    resetFilters
  };
});
