<script setup lang="ts">
import { Badge } from '@/components/ui/badge';
import { formatFileSize } from '@/utils/formatters';

defineProps<{
  width?: number;
  height?: number;
  fileSize: number;
  durationMs?: number;
  status: string;
}>();
</script>

<template>
  <div
    class="border-border bg-card/90 text-muted-foreground flex h-9 shrink-0 items-center justify-between border-t px-3 font-mono text-xs backdrop-blur-xs"
  >
    <div class="flex items-center gap-3">
      <span v-if="width && height">
        Dimensions:
        <strong class="text-foreground">{{ width }}×{{ height }}</strong>
        <slot name="dimensions-extra" />
      </span>
      <span class="text-border">|</span>
      <span>Size: {{ formatFileSize(fileSize) }}</span>
    </div>
    <div class="flex items-center gap-3">
      <span v-if="durationMs">
        Duration:
        <strong class="text-foreground"
          >{{ (durationMs / 1000).toFixed(1) }}s</strong
        >
      </span>
      <Badge variant="outline" class="font-mono text-xs capitalize">
        Status: {{ status }}
      </Badge>
    </div>
  </div>
</template>
