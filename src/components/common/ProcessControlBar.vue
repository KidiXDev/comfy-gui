<script setup lang="ts">
import { Loader2, Play, RotateCw, Square, Terminal } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { useLauncherStore } from '../../stores/launcherStore';

const launcherStore = useLauncherStore();
</script>

<template>
  <div
    class="border-border bg-secondary inline-flex items-center gap-1.5 rounded-lg border p-1 shadow-2xs"
  >
    <Button
      v-if="
        launcherStore.processStatus !== 'running' &&
        launcherStore.processStatus !== 'stopping'
      "
      size="sm"
      :disabled="launcherStore.processStatus === 'starting'"
      class="border border-emerald-600/30 bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
      @click="launcherStore.startServer"
    >
      <Loader2
        v-if="launcherStore.processStatus === 'starting'"
        class="h-3.5 w-3.5 animate-spin"
      />
      <Play v-else class="h-3.5 w-3.5" />
      <span>Start Server</span>
    </Button>

    <Button
      v-else-if="launcherStore.processStatus === 'running'"
      size="sm"
      variant="destructive"
      class="text-destructive-foreground px-2.5 py-1 text-xs font-semibold"
      @click="launcherStore.stopServer"
    >
      <Square class="h-3.5 w-3.5" />
      <span>Stop Server</span>
    </Button>

    <Button v-else size="sm" variant="destructive" disabled>
      <Loader2 class="h-3.5 w-3.5 animate-spin" />
      <span>Stopping...</span>
    </Button>

    <Button
      v-if="launcherStore.processStatus === 'running'"
      size="iconSm"
      variant="ghost"
      class="text-foreground hover:bg-accent hover:text-foreground"
      aria-label="Restart Server"
      @click="launcherStore.restartServer"
    >
      <RotateCw class="h-3.5 w-3.5" />
    </Button>

    <Button
      size="iconSm"
      variant="ghost"
      class="text-foreground hover:bg-accent hover:text-foreground relative"
      aria-label="Toggle Terminal Logs"
      @click="launcherStore.isTerminalOpen = !launcherStore.isTerminalOpen"
    >
      <Terminal class="h-3.5 w-3.5" />
      <span
        v-if="launcherStore.logs.length > 0"
        class="bg-primary text-primary-foreground absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-bold"
      >
        {{ launcherStore.logs.length }}
      </span>
    </Button>
  </div>
</template>
