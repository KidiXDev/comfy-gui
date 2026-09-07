<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{
  title: string;
  iconClass?: HTMLAttributes['class'];
  bodyClass?: HTMLAttributes['class'];
}>();
</script>

<template>
  <section
    class="border-border/80 bg-card/80 flex flex-col gap-4 rounded-xl border p-5 shadow-xs backdrop-blur-xs"
  >
    <div
      class="border-border/80 flex items-center justify-between gap-4 border-b pb-3"
    >
      <div class="flex items-center gap-2.5">
        <div
          v-if="$slots.icon"
          :class="
            cn(
              'border-border bg-secondary flex h-7 w-7 items-center justify-center rounded-md border',
              props.iconClass ?? 'text-primary'
            )
          "
        >
          <slot name="icon" />
        </div>
        <span class="text-xs font-bold tracking-wider uppercase">
          {{ props.title }}
        </span>
      </div>
      <div v-if="$slots.actions" class="flex items-center gap-2">
        <slot name="actions" />
      </div>
    </div>

    <div :class="cn('flex flex-col gap-4', props.bodyClass)">
      <slot />
    </div>
  </section>
</template>
