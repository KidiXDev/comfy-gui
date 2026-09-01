<script setup lang="ts">
import { Images, Loader2, RotateCw, Settings, Sparkles } from '@lucide/vue';
import ProcessControlBar from '@/components/common/ProcessControlBar.vue';
import ServerStatusBadge from '@/components/common/ServerStatusBadge.vue';
import { Button } from '@/components/ui/button';
import { useComfyStore } from '../../stores/comfyStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useLauncherStore } from '../../stores/launcherStore';

const comfyStore = useComfyStore();
const historyStore = useHistoryStore();
const launcherStore = useLauncherStore();
</script>

<template>
  <header
    class="border-border bg-card/90 sticky top-0 z-40 flex items-center justify-between border-b px-5 py-2.5 backdrop-blur-md"
  >
    <!-- Brand / Title -->
    <div class="flex items-center gap-3">
      <div
        class="border-border bg-secondary text-primary flex h-8 w-8 items-center justify-center rounded-lg border shadow-2xs"
      >
        <Sparkles class="h-4 w-4" />
      </div>
      <div>
        <div class="flex items-center gap-2">
          <span class="text-foreground text-sm font-bold tracking-tight">
            ComfyUI Studio
          </span>
          <span
            class="border-primary/30 bg-primary/10 text-primary rounded border px-1.5 py-0.5 text-xs font-semibold"
          >
            v1.0
          </span>
        </div>
      </div>
    </div>

    <!-- Center Status & Process Controls -->
    <div class="flex items-center gap-3">
      <ProcessControlBar />
      <ServerStatusBadge />
      <Button
        v-if="comfyStore.isConnected"
        size="iconSm"
        variant="ghost"
        :disabled="comfyStore.isChecking"
        title="Refresh Models & LoRAs"
        class="text-muted-foreground hover:text-foreground"
        @click="comfyStore.fetchDiscovery"
      >
        <Loader2
          v-if="comfyStore.isChecking"
          class="h-3.5 w-3.5 animate-spin"
        />
        <RotateCw v-else class="h-3.5 w-3.5" />
      </Button>
    </div>

    <!-- Right Actions -->
    <div class="flex items-center gap-2">
      <!-- History Drawer Toggle -->
      <Button
        size="sm"
        variant="outline"
        class="border-border bg-secondary text-foreground hover:bg-accent relative text-xs"
        @click="historyStore.isDrawerOpen = true"
      >
        <Images class="h-3.5 w-3.5" />
        <span>Gallery</span>
        <span
          v-if="historyStore.items.length > 0"
          class="py-0.2 bg-primary text-primary-foreground ml-1 rounded-full px-1.5 text-xs font-bold"
        >
          {{ historyStore.items.length }}
        </span>
      </Button>

      <!-- Settings Button -->
      <Button
        size="iconSm"
        variant="outline"
        title="Launcher & Server Settings"
        class="border-border bg-secondary text-foreground hover:bg-accent"
        @click="launcherStore.isSettingsOpen = true"
      >
        <Settings class="h-3.5 w-3.5" />
      </Button>
    </div>
  </header>
</template>
