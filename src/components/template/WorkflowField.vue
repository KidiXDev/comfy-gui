<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { Field, FieldLabel } from '@/components/ui/field';
import { cn } from '@/lib/utils';

const props = defineProps<{
  label: string;
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <Field :class="cn('gap-1.5', props.class)">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-1">
        <FieldLabel
          class="text-muted-foreground text-xs font-bold tracking-wider uppercase"
        >
          {{ label }}
        </FieldLabel>
        <slot name="label-extra" />
      </div>
      <slot name="action" />
    </div>
    <slot />
  </Field>
</template>
