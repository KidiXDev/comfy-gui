<script setup lang="ts">
import { ChevronsUpDown } from '@lucide/vue';
import type { HTMLAttributes } from 'vue';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxAnchor,
  ComboboxTrigger,
  ComboboxInput,
  ComboboxList,
  ComboboxGroup,
  ComboboxItem,
  ComboboxEmpty
} from '@/components/ui/combobox';
import { cn } from '@/lib/utils';

const model = defineModel<string>({ default: '' });
withDefaults(
  defineProps<{
    options: string[];
    placeholder?: string;
    disabled?: boolean;
    class?: HTMLAttributes['class'];
  }>(),
  { placeholder: 'Select...' }
);
</script>

<template>
  <Combobox
    v-model="model"
    :disabled="disabled"
    :class="cn('w-full flex-1 min-w-0', $props.class)"
  >
    <ComboboxAnchor class="w-full">
      <ComboboxTrigger class="w-full" as-child>
        <Button
          variant="outline"
          :disabled="disabled"
          class="w-full justify-between font-mono text-xs"
          :aria-label="placeholder"
        >
          <span class="truncate">{{ model || placeholder }}</span>
          <ChevronsUpDown class="ml-2 size-3.5 shrink-0 opacity-50" />
        </Button>
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxList class="w-(--reka-combobox-trigger-width)">
      <ComboboxInput placeholder="Search..." :display-value="() => ''" />
      <ComboboxEmpty class="p-2 text-xs">No matches</ComboboxEmpty>
      <ComboboxGroup class="max-h-40 overflow-y-auto">
        <ComboboxItem
          v-for="option in options"
          :key="option"
          :value="option"
          class="font-mono text-xs"
          >{{ option }}</ComboboxItem
        >
      </ComboboxGroup>
    </ComboboxList>
  </Combobox>
</template>
