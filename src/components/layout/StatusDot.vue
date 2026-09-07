<script setup lang="ts">
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Tone = 'emerald' | 'amber';

const props = withDefaults(
  defineProps<{
    tone?: Tone;
    pulse?: boolean;
    label: string;
  }>(),
  { tone: 'amber', pulse: false }
);
</script>

<template>
  <Badge
    variant="outline"
    :class="
      cn(
        props.tone === 'emerald'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-400',
        'text-xs font-medium'
      )
    "
  >
    <span
      :class="
        cn(
          'mr-1.5 inline-block h-1.5 w-1.5 rounded-full',
          props.tone === 'emerald' ? 'bg-emerald-400' : 'bg-amber-400',
          props.pulse && 'animate-pulse'
        )
      "
    />
    {{ props.label }}
  </Badge>
</template>
