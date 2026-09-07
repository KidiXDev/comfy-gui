<script setup lang="ts">
import { AlertCircle } from '@lucide/vue';
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

type Tone = 'amber' | 'emerald' | 'destructive' | 'info';

const props = withDefaults(
  defineProps<{
    tone?: Tone;
    iconClass?: HTMLAttributes['class'];
  }>(),
  { tone: 'amber' }
);

const tones: Record<Tone, string> = {
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
  info: 'border-primary/30 bg-primary/10 text-primary'
};
</script>

<template>
  <div
    :class="
      cn(
        'flex gap-2.5 rounded-lg border p-3 text-xs',
        tones[props.tone],
        $slots.actions ? 'items-center justify-between' : 'items-start'
      )
    "
  >
    <slot name="icon">
      <AlertCircle :class="cn('h-4 w-4 shrink-0', props.iconClass)" />
    </slot>
    <span class="flex-1"><slot /></span>
    <slot name="actions" />
  </div>
</template>
