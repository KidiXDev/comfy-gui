<script setup lang="ts">
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const props = defineProps<{
  label: string;
  description?: string;
  disabled?: boolean;
  labelFor?: string;
}>();

const checked = defineModel<boolean>({ required: true });
</script>

<template>
  <div
    class="border-border/60 bg-muted/20 flex items-center justify-between gap-4 rounded-lg border p-3"
    :class="{ 'opacity-50': props.disabled }"
  >
    <Label
      :for="props.labelFor"
      class="text-foreground flex flex-col items-start gap-0.5 text-xs font-medium"
      :class="{ 'cursor-pointer': !props.disabled }"
    >
      <span>{{ props.label }}</span>
      <span
        v-if="props.description"
        class="text-muted-foreground text-xs font-normal"
      >
        {{ props.description }}
      </span>
    </Label>
    <Switch :id="props.labelFor" v-model="checked" :disabled="props.disabled" />
  </div>
</template>
