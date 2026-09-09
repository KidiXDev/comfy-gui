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
import { useOverlayLayer } from '@/composables/useOverlayLayer';
import { shallowRef } from 'vue';

defineProps<{ disabled?: boolean; compact?: boolean }>();
const aiStore = useAiStore();
const menuOpen = shallowRef(false);
const { style: overlayStyle } = useOverlayLayer(menuOpen);
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
      v-model:open="menuOpen"
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
      <Teleport defer to="#app-content">
        <div
          v-if="menuOpen"
          class="absolute inset-0 z-50"
          :style="overlayStyle"
          @pointerdown.prevent.stop="menuOpen = false"
          @wheel.prevent.stop
        />
      </Teleport>
      <SelectContent class="z-50" :style="overlayStyle">
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
