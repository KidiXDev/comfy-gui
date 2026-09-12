<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{
  title: string;
  description?: string;
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
      <div class="flex min-w-0 items-center gap-3">
        <div
          v-if="$slots.icon"
          :class="
            cn(
              'border-border bg-secondary flex h-8 w-8 shrink-0 items-center justify-center rounded-md border',
              props.iconClass ?? 'text-primary'
            )
          "
        >
          <slot name="icon" />
        </div>
        <div class="min-w-0">
          <h2 class="text-foreground text-sm font-semibold">
            {{ props.title }}
          </h2>
          <p v-if="props.description" class="text-muted-foreground text-xs">
            {{ props.description }}
          </p>
        </div>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </div>

    <div :class="cn('flex flex-col gap-4', props.bodyClass)">
      <slot />
    </div>
  </section>
</template>
