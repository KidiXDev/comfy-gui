<script setup lang="ts">
import { computed } from 'vue';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import EditableNumberBadge from '../common/EditableNumberBadge.vue';
import { useComfyStore } from '../../stores/comfyStore';
import { useWorkflowStore } from '../../stores/workflowStore';

const comfyStore = useComfyStore();
const workflowStore = useWorkflowStore();

const upscaleOptions = computed(() => {
  if (comfyStore.availableUpscaleModels.length > 0) {
    return comfyStore.availableUpscaleModels;
  }
  const selected = workflowStore.postfx.upscale.upscaleModel;
  return selected ? [selected] : [];
});

function createSliderBinding(
  getter: () => number,
  setter: (v: number) => void
) {
  return computed({
    get: () => [getter()],
    set: (val: number[]) => {
      if (val && val[0] !== undefined) {
        setter(Number(val[0].toFixed(2)));
      }
    }
  });
}

const upscaleByModel = createSliderBinding(
  () => workflowStore.postfx.upscale.upscaleBy,
  (v) => (workflowStore.postfx.upscale.upscaleBy = v)
);

const contrastModel = createSliderBinding(
  () => workflowStore.postfx.adjustStage.contrast,
  (v) => (workflowStore.postfx.adjustStage.contrast = v)
);
const saturationModel = createSliderBinding(
  () => workflowStore.postfx.adjustStage.saturation,
  (v) => (workflowStore.postfx.adjustStage.saturation = v)
);
const sharpnessModel = createSliderBinding(
  () => workflowStore.postfx.adjustStage.sharpness,
  (v) => (workflowStore.postfx.adjustStage.sharpness = v)
);
const brightnessModel = createSliderBinding(
  () => workflowStore.postfx.adjustStage.brightness,
  (v) => (workflowStore.postfx.adjustStage.brightness = v)
);
const vignetteModel = createSliderBinding(
  () => workflowStore.postfx.styleStage.vignetteStrength,
  (v) => (workflowStore.postfx.styleStage.vignetteStrength = v)
);
const bloomModel = createSliderBinding(
  () => workflowStore.postfx.styleStage.bloomStrength,
  (v) => (workflowStore.postfx.styleStage.bloomStrength = v)
);
</script>

<template>
  <Accordion type="single" collapsible class="w-full">
    <AccordionItem value="postfx" class="border-none">
      <AccordionTrigger
        class="hover:bg-accent rounded-lg px-3 py-2.5 hover:no-underline"
      >
        <div class="flex w-full items-center justify-between pr-3">
          <div class="flex items-center gap-2">
            <span
              class="text-muted-foreground text-xs font-bold tracking-wider uppercase"
            >
              PostFX & Upscaling
            </span>
          </div>

          <div class="flex items-center gap-1.5">
            <span
              class="rounded px-2 py-0.5 font-mono text-xs font-bold transition-colors"
              :class="
                workflowStore.postfx.upscale.enabled
                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-border bg-muted text-muted-foreground border'
              "
            >
              {{
                workflowStore.postfx.upscale.enabled
                  ? 'Upscale ON'
                  : 'Upscale OFF'
              }}
            </span>
            <span
              class="rounded px-2 py-0.5 font-mono text-xs font-bold transition-colors"
              :class="
                workflowStore.postfx.enabled
                  ? 'border-primary/30 bg-primary/10 text-primary border'
                  : 'border-border bg-muted text-muted-foreground border'
              "
            >
              {{ workflowStore.postfx.enabled ? 'PostFX ON' : 'PostFX OFF' }}
            </span>
          </div>
        </div>
      </AccordionTrigger>

      <AccordionContent class="px-1 pt-2">
        <div class="flex flex-col gap-3">
          <!-- 1. Upscale Group -->
          <div
            class="border-border bg-card flex flex-col gap-3 rounded-lg border p-3"
          >
            <div class="flex items-center justify-between">
              <Label
                class="text-foreground flex cursor-pointer items-center gap-2 text-xs font-medium"
              >
                <Checkbox v-model="workflowStore.postfx.upscale.enabled" />
                Enable Upscaler Stage
              </Label>
              <span class="text-primary font-mono text-xs font-semibold"
                >{{ workflowStore.postfx.upscale.upscaleBy }}x</span
              >
            </div>

            <div
              v-if="workflowStore.postfx.upscale.enabled"
              class="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2"
            >
              <div class="flex flex-col gap-1.5">
                <Label
                  class="text-muted-foreground text-xs font-bold tracking-wider uppercase"
                  >Upscale Model</Label
                >
                <Select
                  v-model="workflowStore.postfx.upscale.upscaleModel"
                  :disabled="!comfyStore.isConnected"
                >
                  <SelectTrigger
                    :disabled="!comfyStore.isConnected"
                    class="w-full font-mono text-xs"
                  >
                    <SelectValue placeholder="Select upscale model..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup class="max-h-40 overflow-y-auto">
                      <SelectItem
                        v-for="opt in upscaleOptions"
                        :key="opt"
                        :value="opt"
                        class="font-mono text-xs"
                      >
                        {{ opt }}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <!-- Scale Factor Slider -->
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center justify-between">
                  <Label
                    class="text-muted-foreground text-xs font-bold tracking-wider uppercase"
                  >
                    Scale Factor
                  </Label>
                  <EditableNumberBadge
                    v-model="workflowStore.postfx.upscale.upscaleBy"
                    :min="1.0"
                    :max="8.0"
                    :step="0.25"
                    :decimals="2"
                    suffix="x"
                    badge-class="text-primary"
                  />
                </div>
                <div class="flex items-center gap-3 pt-1">
                  <Slider
                    v-model="upscaleByModel"
                    :min="1.0"
                    :max="4.0"
                    :step="0.25"
                    class="w-full"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- 2. PostFX Master Group -->
          <div
            class="border-border bg-card flex flex-col gap-3 rounded-lg border p-3"
          >
            <div class="flex items-center justify-between">
              <Label
                class="text-foreground flex cursor-pointer items-center gap-2 text-xs font-medium"
              >
                <Checkbox v-model="workflowStore.postfx.enabled" />
                Enable PostFX Pipeline
              </Label>
            </div>

            <div
              v-if="workflowStore.postfx.enabled"
              class="flex flex-col gap-3.5 pt-1"
            >
              <!-- Adjust Stage Sliders -->
              <div class="flex flex-col gap-2.5">
                <span
                  class="text-muted-foreground text-xs font-bold tracking-wider uppercase"
                  >Color & Detail Adjust</span
                >
                <div class="grid grid-cols-2 gap-3">
                  <!-- Contrast -->
                  <div class="flex flex-col gap-1">
                    <div
                      class="text-muted-foreground flex items-center justify-between text-xs"
                    >
                      <span>Contrast</span>
                      <EditableNumberBadge
                        v-model="workflowStore.postfx.adjustStage.contrast"
                        :min="0.0"
                        :max="3.0"
                        :step="0.05"
                        :decimals="2"
                        badge-class="text-primary text-xs px-1.5 py-0"
                      />
                    </div>
                    <Slider
                      v-model="contrastModel"
                      :min="0.5"
                      :max="1.5"
                      :step="0.05"
                    />
                  </div>

                  <!-- Saturation -->
                  <div class="flex flex-col gap-1">
                    <div
                      class="text-muted-foreground flex items-center justify-between text-xs"
                    >
                      <span>Saturation</span>
                      <EditableNumberBadge
                        v-model="workflowStore.postfx.adjustStage.saturation"
                        :min="0.0"
                        :max="3.0"
                        :step="0.05"
                        :decimals="2"
                        badge-class="text-primary text-xs px-1.5 py-0"
                      />
                    </div>
                    <Slider
                      v-model="saturationModel"
                      :min="0.5"
                      :max="1.5"
                      :step="0.05"
                    />
                  </div>

                  <!-- Sharpness -->
                  <div class="flex flex-col gap-1">
                    <div
                      class="text-muted-foreground flex items-center justify-between text-xs"
                    >
                      <span>Sharpness</span>
                      <EditableNumberBadge
                        v-model="workflowStore.postfx.adjustStage.sharpness"
                        :min="0.0"
                        :max="1.0"
                        :step="0.01"
                        :decimals="2"
                        badge-class="text-primary text-xs px-1.5 py-0"
                      />
                    </div>
                    <Slider
                      v-model="sharpnessModel"
                      :min="0.0"
                      :max="0.5"
                      :step="0.01"
                    />
                  </div>

                  <!-- Brightness -->
                  <div class="flex flex-col gap-1">
                    <div
                      class="text-muted-foreground flex items-center justify-between text-xs"
                    >
                      <span>Brightness</span>
                      <EditableNumberBadge
                        v-model="workflowStore.postfx.adjustStage.brightness"
                        :min="-1.0"
                        :max="1.0"
                        :step="0.01"
                        :decimals="2"
                        badge-class="text-primary text-xs px-1.5 py-0"
                      />
                    </div>
                    <Slider
                      v-model="brightnessModel"
                      :min="-0.2"
                      :max="0.2"
                      :step="0.01"
                    />
                  </div>
                </div>
              </div>

              <!-- Style Stage Sliders -->
              <div class="border-border flex flex-col gap-2.5 border-t pt-2.5">
                <span
                  class="text-muted-foreground text-xs font-bold tracking-wider uppercase"
                  >Atmospheric Style FX</span
                >
                <div class="grid grid-cols-2 gap-3">
                  <!-- Vignette -->
                  <div class="flex flex-col gap-1">
                    <div
                      class="text-muted-foreground flex items-center justify-between text-xs"
                    >
                      <span>Vignette</span>
                      <EditableNumberBadge
                        v-model="
                          workflowStore.postfx.styleStage.vignetteStrength
                        "
                        :min="0.0"
                        :max="1.0"
                        :step="0.05"
                        :decimals="2"
                        badge-class="text-primary text-xs px-1.5 py-0"
                      />
                    </div>
                    <Slider
                      v-model="vignetteModel"
                      :min="0.0"
                      :max="0.8"
                      :step="0.05"
                    />
                  </div>

                  <!-- Bloom -->
                  <div class="flex flex-col gap-1">
                    <div
                      class="text-muted-foreground flex items-center justify-between text-xs"
                    >
                      <span>Bloom</span>
                      <EditableNumberBadge
                        v-model="workflowStore.postfx.styleStage.bloomStrength"
                        :min="0.0"
                        :max="1.0"
                        :step="0.05"
                        :decimals="2"
                        badge-class="text-primary text-xs px-1.5 py-0"
                      />
                    </div>
                    <Slider
                      v-model="bloomModel"
                      :min="0.0"
                      :max="1.0"
                      :step="0.05"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  </Accordion>
</template>
