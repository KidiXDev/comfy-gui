<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{
  title: string;
  subtitle?: string;
  headerClass?: HTMLAttributes['class'];
  contentClass?: HTMLAttributes['class'];
  noSelect?: boolean;
}>();
</script>

<template>
  <div
    class="bg-background flex h-full flex-col overflow-hidden"
    :class="{ 'select-none': !props.noSelect }"
  >
    <header
      :class="
        cn(
          'border-border/80 bg-card/70 flex h-14 shrink-0 items-center justify-between border-b px-6 backdrop-blur-md',
          props.headerClass
        )
      "
    >
      <div class="flex items-center gap-3">
        <div
          v-if="$slots.icon"
          class="border-primary/30 bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-lg border shadow-xs"
        >
          <slot name="icon" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-xs font-bold tracking-wider uppercase">
              {{ props.title }}
            </h1>
            <slot name="title-extra" />
          </div>
          <p v-if="props.subtitle" class="text-muted-foreground text-xs">
            {{ props.subtitle }}
          </p>
        </div>
      </div>

      <div v-if="$slots.actions" class="flex items-center gap-2.5">
        <slot name="actions" />
      </div>
    </header>

    <slot name="below-header" />

    <div :class="cn('flex-1 overflow-y-auto p-6', props.contentClass)">
      <slot />
    </div>
  </div>
</template>
