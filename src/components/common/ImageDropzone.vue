<script setup lang="ts">
import { Upload } from '@lucide/vue';

withDefaults(
  defineProps<{
    compact?: boolean;
    fill?: boolean;
    dragging?: boolean;
  }>(),
  { compact: false, fill: false, dragging: false }
);

defineEmits<{ select: [] }>();
</script>

<template>
  <button
    type="button"
    class="border-border hover:border-primary/50 flex w-full cursor-pointer flex-col items-center justify-center border-dashed text-center transition-all"
    :class="[
      fill
        ? 'bg-secondary/30 hover:bg-secondary/50 min-h-0 flex-1 gap-2.5 rounded-xl border p-6'
        : compact
          ? 'bg-secondary/30 hover:bg-secondary/50 h-96 gap-2 rounded-xl border p-4'
          : 'bg-card/75 h-full gap-4 rounded-xl border-2 p-8 backdrop-blur-xs',
      dragging && 'border-primary bg-primary/10 scale-[0.99]'
    ]"
    @click="$emit('select')"
  >
    <span
      class="border-border bg-secondary flex items-center justify-center border shadow-xs"
      :class="
        fill
          ? 'bg-card h-12 w-12 rounded-xl'
          : compact
            ? 'h-10 w-10 rounded-lg'
            : 'h-16 w-16 rounded-2xl'
      "
    >
      <slot name="icon">
        <Upload
          class="text-primary"
          :class="fill ? 'h-5 w-5' : compact ? 'h-4 w-4' : 'h-8 w-8'"
        />
      </slot>
    </span>
    <span>
      <strong
        :class="
          compact || fill ? 'text-xs font-semibold' : 'text-base font-bold'
        "
      >
        Drop an image here or click to browse
      </strong>
      <span
        class="text-muted-foreground block text-xs"
        :class="fill ? 'mt-1' : compact ? 'mt-0.5' : 'mt-1.5'"
      >
        Support PNG, JPEG, and WebP
      </span>
    </span>
  </button>
</template>
