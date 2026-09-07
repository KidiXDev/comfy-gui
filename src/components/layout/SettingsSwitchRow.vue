<script setup lang="ts">
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const props = defineProps<{
  label: string;
  disabled?: boolean;
  labelFor?: string;
}>();

const checked = defineModel<boolean>({ required: true });
</script>

<template>
  <div
    class="border-border/60 bg-muted/20 flex items-center justify-between rounded-lg border p-3"
    :class="{ 'opacity-50': props.disabled }"
  >
    <Label
      :for="props.labelFor"
      class="text-foreground text-xs font-medium"
      :class="{ 'cursor-pointer': !props.disabled }"
    >
      {{ props.label }}
    </Label>
    <Switch :id="props.labelFor" v-model="checked" :disabled="props.disabled" />
  </div>
</template>
