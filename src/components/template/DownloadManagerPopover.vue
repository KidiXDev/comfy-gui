<script setup lang="ts">
import { computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import {
  CheckCircle2,
  CircleAlert,
  Download,
  FolderOpen,
  Loader2,
  Pause,
  Play,
  X
} from '@lucide/vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatFileSize, formatShortDate } from '@/utils/formatters';
import { useDownloadStore } from '@/stores/downloadStore';
import type { DownloadRecord } from '@/services/downloadManager';
import { isVideoMedia } from '@/services/civitai';

const downloadStore = useDownloadStore();
const orderedDownloads = computed(() => downloadStore.items);

function percent(item: DownloadRecord) {
  return item.totalLength
    ? Math.min(100, Math.round((item.completedLength / item.totalLength) * 100))
    : 0;
}

function statusLabel(item: DownloadRecord) {
  if (item.status === 'active')
    return `${formatFileSize(item.downloadSpeed)}/s`;
  if (item.status === 'complete') return 'Completed';
  if (item.status === 'paused') return 'Paused';
  if (item.status === 'waiting') return 'Queued';
  return item.errorMessage || 'Failed';
}
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        class="text-muted-foreground hover:text-foreground relative h-9 w-9"
        title="Download manager"
      >
        <Loader2
          v-if="downloadStore.items.some((item) => item.status === 'active')"
          class="h-4 w-4 animate-spin"
        />
        <Download v-else class="h-4 w-4" />
        <Badge
          v-if="downloadStore.activeCount"
          class="border-background absolute -top-1.5 -right-1.5 h-5 min-w-5 justify-center rounded-full border-2 px-1 text-xs"
        >
          {{ downloadStore.activeCount }}
        </Badge>
      </Button>
    </PopoverTrigger>
    <PopoverContent side="right" align="end" class="w-96 p-0">
      <div
        class="border-border flex items-center justify-between border-b px-4 py-3"
      >
        <div>
          <h2 class="text-sm font-semibold">Downloads</h2>
          <p class="text-muted-foreground text-xs">Managed by aria2</p>
        </div>
        <Badge variant="secondary" class="text-xs">
          {{ downloadStore.items.length }} items
        </Badge>
      </div>

      <div
        v-if="downloadStore.errorMessage"
        class="text-destructive border-border border-b px-4 py-2 text-xs"
      >
        {{ downloadStore.errorMessage }}
      </div>

      <div
        v-if="orderedDownloads.length === 0"
        class="text-muted-foreground flex h-32 flex-col items-center justify-center gap-2 text-xs"
      >
        <Download class="h-6 w-6 opacity-50" />
        No downloads yet
      </div>

      <ScrollArea v-else class="h-96">
        <div class="divide-border divide-y">
          <div
            v-for="item in orderedDownloads"
            :key="item.gid"
            class="flex gap-3 px-4 py-3"
          >
            <div
              class="bg-muted flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md"
            >
              <video
                v-if="item.previewUrl && isVideoMedia({ url: item.previewUrl })"
                :src="item.previewUrl"
                autoplay
                loop
                muted
                playsinline
                class="pointer-events-none h-full w-full object-cover"
              />
              <img
                v-else-if="item.previewUrl"
                :src="item.previewUrl"
                :alt="item.name"
                class="h-full w-full object-cover"
              />
              <CheckCircle2
                v-else-if="item.status === 'complete'"
                class="h-5 w-5 text-emerald-500"
              />
              <CircleAlert
                v-else-if="item.status === 'error'"
                class="text-destructive h-5 w-5"
              />
              <Download v-else class="text-muted-foreground h-5 w-5" />
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate text-xs font-semibold" :title="item.name">
                    {{ item.name }}
                  </p>
                  <p class="text-muted-foreground truncate text-xs">
                    {{ item.modelType }} · {{ item.baseModel }}
                  </p>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                  <Button
                    v-if="item.status === 'active' || item.status === 'waiting'"
                    variant="ghost"
                    size="iconSm"
                    title="Pause download"
                    @click="downloadStore.pause(item.gid)"
                  >
                    <Pause class="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    v-else-if="item.status === 'paused'"
                    variant="ghost"
                    size="iconSm"
                    title="Resume download"
                    @click="downloadStore.resume(item.gid)"
                  >
                    <Play class="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    v-else-if="item.status === 'complete'"
                    variant="ghost"
                    size="iconSm"
                    title="Show downloaded model"
                    @click="invoke('show_in_folder', { path: item.modelPath })"
                  >
                    <FolderOpen class="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    v-if="item.status !== 'complete'"
                    variant="ghost"
                    size="iconSm"
                    title="Cancel and clean up download"
                    @click="downloadStore.cancel(item.gid)"
                  >
                    <X class="text-destructive h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <Progress
                v-if="!['complete', 'error', 'removed'].includes(item.status)"
                :model-value="percent(item)"
                class="mt-2 h-1.5"
              />
              <div
                class="text-muted-foreground mt-1.5 flex justify-between text-xs"
              >
                <span>{{ statusLabel(item) }}</span>
                <span v-if="item.totalLength">
                  {{ formatFileSize(item.completedLength) }} /
                  {{ formatFileSize(item.totalLength) }}
                </span>
                <span v-else>{{ formatShortDate(item.createdAt) }}</span>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </PopoverContent>
  </Popover>
</template>
