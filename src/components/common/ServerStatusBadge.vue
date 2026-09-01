```vue
<script setup lang="ts">
import { computed } from 'vue';
import { Loader2 } from '@lucide/vue';
import { useComfyStore } from '../../stores/comfyStore';
import { useLauncherStore } from '../../stores/launcherStore';

const comfyStore = useComfyStore();
const launcherStore = useLauncherStore();

const statusText = computed(() => {
  if (comfyStore.isConnected) return 'ComfyUI Online';
  if (launcherStore.processStatus === 'starting') return 'Starting...';
  if (launcherStore.processStatus === 'stopping') return 'Stopping...';
  if (launcherStore.processStatus === 'running') return 'Server Booting...';
  if (launcherStore.processStatus === 'error') return 'Launch Error';
  return 'Offline';
});
</script>

<template>
  <div
    class="border-border bg-secondary text-foreground inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-medium shadow-2xs"
  >
    <Loader2
      v-if="
        launcherStore.processStatus === 'starting' ||
        launcherStore.processStatus === 'stopping'
      "
      class="h-3.5 w-3.5 animate-spin text-amber-500"
    />

    <span
      v-else
      class="h-2 w-2 rounded-full transition-colors"
      :class="{
        'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]':
          comfyStore.isConnected,
        'animate-pulse bg-amber-500':
          !comfyStore.isConnected &&
          (launcherStore.processStatus === 'running' || comfyStore.isChecking),
        'bg-rose-500':
          !comfyStore.isConnected && launcherStore.processStatus === 'error',
        'bg-muted-foreground/40':
          !comfyStore.isConnected &&
          launcherStore.processStatus !== 'running' &&
          launcherStore.processStatus !== 'error'
      }"
    />

    <span class="text-foreground font-mono text-xs">
      {{ statusText }}
    </span>
  </div>
</template>
```
