<script setup lang="ts">
import { computed } from 'vue';
import { SlidersHorizontal } from '@lucide/vue';
import { Badge } from '@/components/ui/badge';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

defineProps<{ mode: 'RMBG' | 'BiRefNetRMBG'; isSubmitting: boolean }>();
const sensitivity = defineModel<number>('sensitivity', { required: true });
const processResolution = defineModel<number>('processResolution', {
  required: true
});
const maskBlur = defineModel<number>('maskBlur', { required: true });
const maskOffset = defineModel<number>('maskOffset', { required: true });
const refineForeground = defineModel<boolean>('refineForeground', {
  required: true
});
const invertOutput = defineModel<boolean>('invertOutput', { required: true });
const sensitivityModel = computed({
  get: () => [sensitivity.value],
  set: (value: number[]) => {
    if (value[0] !== undefined) sensitivity.value = value[0];
  }
});
const processResolutionModel = computed({
  get: () => [processResolution.value],
  set: (value: number[]) => {
    if (value[0] !== undefined) processResolution.value = value[0];
  }
});
const maskBlurModel = computed({
  get: () => [maskBlur.value],
  set: (value: number[]) => {
    if (value[0] !== undefined) maskBlur.value = value[0];
  }
});
const maskOffsetModel = computed({
  get: () => [maskOffset.value],
  set: (value: number[]) => {
    if (value[0] !== undefined) maskOffset.value = value[0];
  }
});
</script>
<template>
  <section
    class="border-border bg-card flex shrink-0 flex-col gap-3.5 rounded-xl border p-4 shadow-2xs"
  >
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <SlidersHorizontal class="text-primary h-4 w-4" />
        <h2 class="text-xs font-bold tracking-wider uppercase">
          Edge Controls
        </h2>
      </div>
    </div>

    <Field class="gap-2">
      <div class="flex items-center justify-between">
        <FieldLabel class="text-xs font-semibold">Sensitivity</FieldLabel>
        <Badge variant="secondary" class="font-mono text-xs">
          {{ sensitivity.toFixed(2) }}
        </Badge>
      </div>
      <Slider
        v-model="sensitivityModel"
        :min="0"
        :max="1"
        :step="0.01"
        :disabled="isSubmitting"
        aria-label="Mask sensitivity"
        class="py-1"
      />
      <FieldDescription class="text-xs">
        Higher values retain more of the detected subject.
      </FieldDescription>
    </Field>

    <Field v-if="mode === 'RMBG'" class="gap-2">
      <div class="flex items-center justify-between">
        <FieldLabel class="text-xs font-semibold"
          >Processing Resolution</FieldLabel
        >
        <Badge variant="secondary" class="font-mono text-xs">
          {{ processResolution }} px
        </Badge>
      </div>
      <Slider
        v-model="processResolutionModel"
        :min="256"
        :max="2048"
        :step="8"
        :disabled="isSubmitting"
        aria-label="Processing resolution"
        class="py-1"
      />
      <FieldDescription class="text-xs">
        Higher resolution preserves fine detail but uses more VRAM.
      </FieldDescription>
    </Field>

    <div class="grid grid-cols-2 gap-3">
      <Field class="gap-1.5">
        <div class="flex items-center justify-between">
          <FieldLabel class="text-xs font-semibold">Edge Blur</FieldLabel>
          <span class="text-muted-foreground font-mono text-xs">{{
            maskBlur
          }}</span>
        </div>
        <Slider
          v-model="maskBlurModel"
          :min="0"
          :max="64"
          :step="1"
          :disabled="isSubmitting"
          aria-label="Mask edge blur"
          class="py-1"
        />
      </Field>

      <Field class="gap-1.5">
        <div class="flex items-center justify-between">
          <FieldLabel class="text-xs font-semibold">Edge Offset</FieldLabel>
          <span class="text-muted-foreground font-mono text-xs">{{
            maskOffset
          }}</span>
        </div>
        <Slider
          v-model="maskOffsetModel"
          :min="mode === 'RMBG' ? -64 : -20"
          :max="mode === 'RMBG' ? 64 : 20"
          :step="1"
          :disabled="isSubmitting"
          aria-label="Mask edge offset"
          class="py-1"
        />
      </Field>
    </div>

    <div class="border-border divide-border divide-y rounded-lg border">
      <label
        class="flex cursor-pointer items-center justify-between gap-3 p-2.5"
      >
        <span>
          <span class="block text-xs font-semibold">Refine foreground</span>
          <span class="text-muted-foreground text-xs">
            Improve color around transparent edges.
          </span>
        </span>
        <Switch v-model="refineForeground" :disabled="isSubmitting" />
      </label>

      <label
        class="flex cursor-pointer items-center justify-between gap-3 p-2.5"
      >
        <span>
          <span class="block text-xs font-semibold">Invert output</span>
          <span class="text-muted-foreground text-xs">
            Keep the detected background instead.
          </span>
        </span>
        <Switch v-model="invertOutput" :disabled="isSubmitting" />
      </label>
    </div>
  </section>
</template>
