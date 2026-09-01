<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import {
  ArrowDown,
  Code,
  Copy,
  Loader2,
  Pause,
  Play,
  RotateCw,
  Search,
  Square,
  Terminal,
  Trash2
} from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useComfyStore } from '../stores/comfyStore';
import { useLauncherStore } from '../stores/launcherStore';
import { getLogLevel, parseAnsiToSpans } from '../utils/logFormatter';

const launcherStore = useLauncherStore();
const comfyStore = useComfyStore();

const filterText = ref('');
const streamFilter = ref<'all' | 'stdout' | 'stderr' | 'system'>('all');
const autoScroll = ref(true);
const terminalContainer = ref<HTMLElement | null>(null);
const MAX_VISIBLE_LOGS = 500;

const filteredLogs = computed(() => {
  const hasFilter = streamFilter.value !== 'all' || filterText.value.trim();
  const logs = hasFilter
    ? launcherStore.logs
    : launcherStore.logs.slice(-MAX_VISIBLE_LOGS);
  return logs.filter((log) => {
    if (streamFilter.value !== 'all' && log.stream !== streamFilter.value) {
      return false;
    }
    if (filterText.value.trim()) {
      return log.message.toLowerCase().includes(filterText.value.toLowerCase());
    }
    return true;
  });
});

onMounted(scrollToBottom);

function scrollToBottom() {
  if (!autoScroll.value || !terminalContainer.value) return;
  nextTick(() => {
    if (terminalContainer.value) {
      terminalContainer.value.scrollTop = terminalContainer.value.scrollHeight;
    }
  });
}

watch(
  () => launcherStore.logs.length,
  () => {
    scrollToBottom();
  }
);

function copyAllLogs() {
  const text = launcherStore.logs
    .map(
      (l) =>
        `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.stream.toUpperCase()}] ${l.message}`
    )
    .join('\n');
  navigator.clipboard.writeText(text);
}
</script>

<template>
  <div class="bg-background flex h-full flex-col overflow-hidden">
    <!-- Header Control Bar -->
    <header
      class="border-border bg-card flex h-12 shrink-0 items-center justify-between border-b px-5"
    >
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2.5">
          <div
            class="border-border bg-secondary text-primary flex h-8 w-8 items-center justify-center rounded-lg border shadow-2xs"
          >
            <Terminal class="h-4 w-4" />
          </div>
          <div>
            <h1
              class="text-foreground text-xs font-bold tracking-wide uppercase"
            >
              ComfyUI Server & Terminal
            </h1>
            <p class="text-muted-foreground font-mono text-xs">
              {{ launcherStore.config.serverUrl }}
            </p>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2">
        <Button
          v-if="
            launcherStore.processStatus !== 'running' &&
            launcherStore.processStatus !== 'stopping'
          "
          size="sm"
          :disabled="launcherStore.processStatus === 'starting'"
          class="border border-emerald-600/30 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500"
          @click="launcherStore.startServer"
        >
          <Loader2
            v-if="launcherStore.processStatus === 'starting'"
            class="h-3.5 w-3.5 animate-spin"
          />
          <Play v-else class="h-3.5 w-3.5" />
          <span>Start ComfyUI</span>
        </Button>

        <Button
          v-else-if="launcherStore.processStatus === 'running'"
          size="sm"
          variant="destructive"
          class="text-destructive-foreground px-3 py-1.5 text-xs font-semibold shadow-xs"
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
          size="sm"
          variant="outline"
          class="border-border bg-secondary text-foreground hover:bg-accent text-xs"
          @click="launcherStore.restartServer"
        >
          <RotateCw class="h-3.5 w-3.5" />
          <span>Restart</span>
        </Button>

        <Button
          size="sm"
          variant="outline"
          :disabled="comfyStore.isChecking"
          class="border-border bg-secondary text-foreground hover:bg-accent text-xs"
          @click="comfyStore.fetchDiscovery"
        >
          <Loader2
            v-if="comfyStore.isChecking"
            class="h-3.5 w-3.5 animate-spin"
          />
          <RotateCw v-else class="h-3.5 w-3.5" />
          <span>Ping API</span>
        </Button>
      </div>
    </header>

    <!-- Terminal Toolbar -->
    <div
      class="border-border bg-card flex shrink-0 items-center justify-between border-b px-5 py-2"
    >
      <div class="flex items-center gap-3">
        <div class="relative w-64">
          <Search
            class="text-muted-foreground pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5"
          />
          <Input
            v-model="filterText"
            placeholder="Search terminal logs..."
            class="border-border bg-secondary text-foreground h-7 w-full py-1 pl-8 text-xs"
          />
        </div>

        <ToggleGroup
          type="single"
          :model-value="streamFilter"
          class="gap-1"
          @update:model-value="
            (val: any) => {
              if (val)
                streamFilter = val as 'all' | 'stdout' | 'stderr' | 'system';
            }
          "
        >
          <ToggleGroupItem
            value="all"
            size="sm"
            class="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-6 px-2 text-xs"
          >
            All
          </ToggleGroupItem>
          <ToggleGroupItem
            value="stdout"
            size="sm"
            class="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-6 px-2 text-xs"
          >
            Stdout
          </ToggleGroupItem>
          <ToggleGroupItem
            value="stderr"
            size="sm"
            class="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-6 px-2 text-xs"
          >
            Stderr
          </ToggleGroupItem>
          <ToggleGroupItem
            value="system"
            size="sm"
            class="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-6 px-2 text-xs"
          >
            System
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div class="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          :class="autoScroll ? 'text-primary' : 'text-muted-foreground'"
          class="text-xs"
          @click="autoScroll = !autoScroll"
        >
          <ArrowDown v-if="autoScroll" class="h-3.5 w-3.5" />
          <Pause v-else class="h-3.5 w-3.5" />
          <span>{{ autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF' }}</span>
        </Button>

        <Button
          size="sm"
          variant="ghost"
          class="text-muted-foreground hover:text-foreground text-xs"
          @click="copyAllLogs"
        >
          <Copy class="h-3.5 w-3.5" />
          <span>Copy</span>
        </Button>

        <Button
          size="sm"
          variant="ghost"
          class="text-muted-foreground hover:text-destructive text-xs"
          @click="launcherStore.clearLogs"
        >
          <Trash2 class="h-3.5 w-3.5" />
          <span>Clear</span>
        </Button>
      </div>
    </div>

    <!-- Terminal Output Stream -->
    <div
      ref="terminalContainer"
      class="bg-background flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed select-text"
    >
      <div
        v-if="filteredLogs.length === 0"
        class="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 italic"
      >
        <Code class="text-muted-foreground/40 h-8 w-8" />
        <p>
          No terminal output. Click "Start ComfyUI" above to launch the server.
        </p>
      </div>

      <div
        v-for="log in filteredLogs"
        :key="log.id"
        class="border-border/20 hover:bg-muted/40 flex items-start gap-2.5 border-b py-0.5"
      >
        <span class="text-muted-foreground shrink-0 pt-0.5 font-mono text-xs">
          {{ new Date(log.timestamp).toLocaleTimeString() }}
        </span>
        <span
          class="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold uppercase"
          :class="{
            'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400':
              getLogLevel(log.stream, log.message) === 'stdout',
            'border border-sky-500/30 bg-sky-500/10 text-sky-400':
              getLogLevel(log.stream, log.message) === 'info',
            'border border-amber-500/30 bg-amber-500/10 text-amber-400':
              getLogLevel(log.stream, log.message) === 'warn',
            'border border-rose-500/30 bg-rose-500/10 text-rose-400':
              getLogLevel(log.stream, log.message) === 'error',
            'border-primary/30 bg-primary/10 text-primary border':
              getLogLevel(log.stream, log.message) === 'system'
          }"
        >
          {{ getLogLevel(log.stream, log.message).toUpperCase() }}
        </span>
        <span class="text-foreground flex-1 break-all whitespace-pre-wrap">
          <span
            v-for="(span, spanIndex) in parseAnsiToSpans(log.message)"
            :key="spanIndex"
            :class="
              span.className ||
              (getLogLevel(log.stream, log.message) === 'error'
                ? 'text-destructive font-semibold'
                : getLogLevel(log.stream, log.message) === 'warn'
                  ? 'text-amber-300'
                  : getLogLevel(log.stream, log.message) === 'system'
                    ? 'text-primary font-semibold'
                    : '')
            "
            >{{ span.text }}</span
          >
        </span>
      </div>
    </div>
  </div>
</template>
