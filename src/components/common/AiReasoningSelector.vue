<script setup lang="ts">
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Brain } from '@lucide/vue';
import { Field, FieldLabel } from '@/components/ui/field';
import { supportsReasoning } from '@/services/aiService';
import { useAiStore } from '@/stores/aiStore';

defineProps<{ disabled?: boolean; compact?: boolean }>();
const aiStore = useAiStore();
const efforts = [
  'default',
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh'
] as const;
</script>

<template>
  <Field
    v-if="supportsReasoning(aiStore.selectedModelInfo)"
    :class="compact ? 'w-auto shrink-0' : 'gap-1.5'"
  >
    <FieldLabel v-if="!compact" class="text-xs">Reasoning Effort</FieldLabel>
    <Select
      v-model="aiStore.config.reasoningEffort"
      :disabled="disabled"
      @update:model-value="aiStore.saveConfig()"
    >
      <SelectTrigger
        size="sm"
        class="bg-background/50 hover:bg-accent hover:text-accent-foreground gap-1.5 text-xs shadow-none"
        :class="
          compact ? 'w-auto px-2 py-0 data-[size=sm]:h-7' : 'w-full px-2.5'
        "
        aria-label="Reasoning effort"
        title="Reasoning effort; uses the response token budget"
      >
        <span class="flex min-w-0 items-center gap-1.5">
          <Brain v-if="compact" class="text-muted-foreground size-3.5" />
          <SelectValue placeholder="Default" />
        </span>
      </SelectTrigger>
      <SelectContent class="z-150">
        <SelectGroup class="max-h-40 overflow-y-auto">
          <SelectItem
            v-for="effort in efforts"
            :key="effort"
            :value="effort"
            class="text-xs"
          >
            {{
              effort === 'xhigh'
                ? 'Extra High'
                : effort.charAt(0).toUpperCase() + effort.slice(1)
            }}
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </Field>
</template>
