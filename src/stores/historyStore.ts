import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  deleteAppData,
  loadAppData,
  saveAppData
} from '../services/appStorage';
import type { HistoryItem, WorkflowState } from '../types/workflow';

const STORAGE_KEY = 'session_history';

export const useHistoryStore = defineStore('history', () => {
  const items = ref<HistoryItem[]>([]);
  const isPanelOpen = ref(true);
  const isDrawerOpen = ref(false);

  async function loadHistory() {
    try {
      const saved = await loadAppData<HistoryItem[]>(STORAGE_KEY);
      if (saved) {
        items.value = saved;
      }
    } catch {
      // ignore parse error
    }
  }

  async function saveHistory() {
    await saveAppData(STORAGE_KEY, items.value.slice(0, 50));
  }

  function addHistory(
    imageUrl: string,
    filename: string,
    subfolder: string,
    type: string,
    promptId: string,
    workflowState: WorkflowState,
    durationMs?: number
  ) {
    const newItem: HistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      imageUrl,
      filename,
      subfolder,
      type,
      promptId,
      workflowState: JSON.parse(JSON.stringify(workflowState)),
      durationMs
    };

    items.value.unshift(newItem);
    if (items.value.length > 50) {
      items.value.pop();
    }
    void saveHistory();
  }

  function removeHistory(id: string) {
    items.value = items.value.filter((i) => i.id !== id);
    void saveHistory();
  }

  function clearHistory() {
    items.value = [];
    void deleteAppData(STORAGE_KEY);
  }

  void loadHistory();

  return {
    items,
    isPanelOpen,
    isDrawerOpen,
    loadHistory,
    addHistory,
    removeHistory,
    clearHistory
  };
});
