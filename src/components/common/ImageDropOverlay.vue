<script setup lang="ts">
import { Upload } from '@lucide/vue';

defineProps<{ compact?: boolean }>();
</script>

<template>
  <div
    class="border-primary bg-primary/15 text-primary pointer-events-none absolute z-40 flex flex-col items-center justify-center gap-2 border-2 border-dashed backdrop-blur-xs"
    :class="compact ? 'inset-0 rounded-xl' : 'inset-3 rounded-xl'"
  >
    <Upload :class="compact ? 'h-6 w-6' : 'h-8 w-8'" class="animate-bounce" />
    <p :class="compact ? 'text-xs' : 'text-sm'" class="font-bold">
      Drop images to add to queue
    </p>
    <p class="text-muted-foreground text-xs">Multiple images supported</p>
  </div>
</template>
