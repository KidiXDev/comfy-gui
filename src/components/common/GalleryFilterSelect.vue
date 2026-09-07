<script setup lang="ts">
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

defineProps<{
  label: string;
  placeholder: string;
  options: readonly { value: string; label: string; count?: number }[];
  showCounts?: boolean;
  triggerClass?: string;
}>();
const value = defineModel<string>({ required: true });
</script>

<template>
  <div class="flex items-center gap-1.5">
    <span class="text-muted-foreground text-xs whitespace-nowrap"
      >{{ label }}:</span
    >
    <Select v-model="value">
      <SelectTrigger
        class="bg-background/80 border-border/60 h-8 w-full text-xs"
        :class="triggerClass"
        :aria-label="label"
      >
        <SelectValue :placeholder="placeholder" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup class="max-h-40 overflow-y-auto">
          <SelectItem value="all" class="text-xs">{{ placeholder }}</SelectItem>
          <SelectItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            class="text-xs"
          >
            {{ option.label
            }}<template v-if="showCounts && option.count !== undefined">
              ({{ option.count }})</template
            >
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>
</template>
