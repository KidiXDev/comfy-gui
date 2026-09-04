import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  cancelDownload,
  clearDownloadHistory,
  listDownloads,
  pauseDownload,
  queueCivitaiDownload,
  resumeDownload,
  type DownloadRecord
} from '../services/downloadManager';

export const useDownloadStore = defineStore('downloads', () => {
  const items = ref<DownloadRecord[]>([]);
  const errorMessage = ref('');
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  const activeCount = computed(
    () =>
      items.value.filter((item) =>
        ['active', 'waiting', 'paused'].includes(item.status)
      ).length
  );

  async function refresh() {
    try {
      items.value = await listDownloads();
      errorMessage.value = '';
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : String(error);
    }
  }

  async function init() {
    if (refreshTimer) return;
    await refresh();
    refreshTimer = setInterval(() => void refresh(), 1000);
  }

  async function enqueueCivitai(options: {
    versionId: number;
    workingDir: string;
    apiKey: string;
  }) {
    const record = await queueCivitaiDownload(options);
    const index = items.value.findIndex((item) => item.gid === record.gid);
    if (index === -1) items.value.unshift(record);
    else items.value[index] = record;
    return record;
  }

  async function pause(gid: string) {
    await pauseDownload(gid);
    await refresh();
  }

  async function resume(gid: string) {
    await resumeDownload(gid);
    await refresh();
  }

  async function cancel(gid: string) {
    await cancelDownload(gid);
    items.value = items.value.filter((item) => item.gid !== gid);
  }

  async function clearHistory() {
    try {
      await clearDownloadHistory();
      items.value = items.value.filter((item) =>
        ['active', 'waiting', 'paused'].includes(item.status)
      );
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : String(error);
    }
  }

  function byVersion(versionId: number) {
    return items.value.find((item) => item.versionId === versionId);
  }

  function stop() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
  }

  return {
    items,
    errorMessage,
    activeCount,
    init,
    stop,
    refresh,
    enqueueCivitai,
    pause,
    resume,
    cancel,
    clearHistory,
    byVersion
  };
});
