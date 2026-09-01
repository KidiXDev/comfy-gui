<script setup lang="ts">
import { computed, watch } from 'vue';
import { AlertCircle, FastForwardIcon, ScanFace } from '@lucide/vue';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import EditableNumberBadge from '../common/EditableNumberBadge.vue';
import WorkflowField from './WorkflowField.vue';
import { useComfyStore } from '../../stores/comfyStore';
import { useWorkflowStore } from '../../stores/workflowStore';

withDefaults(defineProps<{ showEnabled?: boolean }>(), { showEnabled: true });

const NO_SEGMENTATION = '__none__';
const comfyStore = useComfyStore();
const workflowStore = useWorkflowStore();
const settings = computed(() => workflowStore.faceDetailer);

const samplerOptions = computed(() =>
  comfyStore.availableSamplers.length > 0
    ? comfyStore.availableSamplers
    : ['er_sde', 'euler', 'euler_ancestral', 'dpmpp_2m', 'dpmpp_sde']
);

const schedulerOptions = computed(() =>
  comfyStore.availableSchedulers.length > 0
    ? comfyStore.availableSchedulers
    : ['simple', 'normal', 'karras', 'exponential', 'sgm_uniform']
);

const turboLoraOptions = computed(() =>
  Array.from(
    new Set(
      [settings.value.turboLora, ...comfyStore.availableLoras].filter(Boolean)
    )
  )
);

const segmentationModel = computed({
  get: () => settings.value.segmModel || NO_SEGMENTATION,
  set: (value: string) => {
    settings.value.segmModel = value === NO_SEGMENTATION ? '' : value;
  }
});

const controlledSteps = computed({
  get: () =>
    settings.value.turboEnabled
      ? settings.value.turboSteps
      : settings.value.steps,
  set: (value: number) => {
    if (settings.value.turboEnabled) settings.value.turboSteps = value;
    else settings.value.steps = value;
  }
});

function sliderBinding(
  getter: () => number,
  setter: (value: number) => void,
  decimals = 2
) {
  return computed({
    get: () => [getter()],
    set: (value: number[]) => {
      if (value[0] !== undefined) setter(Number(value[0].toFixed(decimals)));
    }
  });
}

const stepsSlider = sliderBinding(
  () => controlledSteps.value,
  (value) => (controlledSteps.value = value),
  0
);

const cfgSlider = sliderBinding(
  () => settings.value.cfg,
  (value) => (settings.value.cfg = value),
  1
);

const thresholdSlider = sliderBinding(
  () => settings.value.bboxThreshold,
  (value) => (settings.value.bboxThreshold = value)
);

const denoiseSlider = sliderBinding(
  () => settings.value.denoise,
  (value) => (settings.value.denoise = value)
);

const featherSlider = sliderBinding(
  () => settings.value.feather,
  (value) => (settings.value.feather = value),
  0
);

const guideSizeSlider = sliderBinding(
  () => settings.value.guideSize,
  (value) => (settings.value.guideSize = value),
  0
);

watch(
  () => comfyStore.availableBBoxDetectors,
  (models) => {
    if (models.length > 0 && !models.includes(settings.value.bboxModel)) {
      settings.value.bboxModel = models[0] ?? '';
    }
  },
  { immediate: true }
);
</script>

<template>
  <div class="flex flex-col gap-3.5">
    <!-- Header: Title, Description, Availability Status, and Master Switch -->
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2.5">
        <div
          class="bg-primary/10 text-primary flex h-8 w-8 items-center justify-center rounded-lg shadow-2xs"
        >
          <ScanFace class="h-4 w-4" />
        </div>
        <div>
          <h3 class="text-xs font-bold tracking-wider uppercase">
            Face Detailer
          </h3>
          <p class="text-muted-foreground mt-0.5 text-xs">
            Detect and refine faces after generation.
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <Badge
          variant="outline"
          :class="
            comfyStore.isFaceDetailerAvailable
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
          "
          class="font-mono text-xs"
        >
          <span
            class="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
            :class="
              comfyStore.isFaceDetailerAvailable
                ? 'bg-emerald-400'
                : 'bg-amber-400'
            "
          />
          {{ comfyStore.isFaceDetailerAvailable ? 'Ready' : 'Unavailable' }}
        </Badge>
        <Switch
          v-if="showEnabled"
          v-model="workflowStore.faceDetailer.enabled"
          :disabled="
            comfyStore.isConnected && !comfyStore.isFaceDetailerAvailable
          "
          aria-label="Enable Face Detailer in generation pipeline"
        />
      </div>
    </div>

    <!-- Main Config Body (shown when enabled or showEnabled=false) -->
    <div
      v-if="!showEnabled || workflowStore.faceDetailer.enabled"
      class="flex flex-col gap-3.5 pt-1"
    >
      <!-- ComfyUI Node Availability Warning -->
      <div
        v-if="comfyStore.isConnected && !comfyStore.isFaceDetailerAvailable"
        class="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300"
      >
        <AlertCircle class="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
        <span>
          Impact Pack and Impact Subpack are required. Restart ComfyUI after
          enabling both custom nodes.
        </span>
      </div>

      <!-- 1. Detector Models Row -->
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <!-- BBox Detector -->
        <WorkflowField label="BBox Detector">
          <Select
            v-model="workflowStore.faceDetailer.bboxModel"
            :disabled="!comfyStore.isConnected"
          >
            <SelectTrigger class="w-full font-mono text-xs">
              <SelectValue placeholder="Select required detector" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup class="max-h-40 overflow-y-auto">
                <SelectItem
                  v-for="model in comfyStore.availableBBoxDetectors"
                  :key="model"
                  :value="model"
                  class="font-mono text-xs"
                >
                  {{ model }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </WorkflowField>

        <!-- Segmentation Model -->
        <WorkflowField label="Segmentation Model">
          <Select
            v-model="segmentationModel"
            :disabled="!comfyStore.isConnected"
          >
            <SelectTrigger class="w-full font-mono text-xs">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup class="max-h-40 overflow-y-auto">
                <SelectItem :value="NO_SEGMENTATION" class="text-xs">
                  None
                </SelectItem>
                <SelectItem
                  v-for="model in comfyStore.availableSegmDetectors"
                  :key="model"
                  :value="model"
                  class="font-mono text-xs"
                >
                  {{ model }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </WorkflowField>
      </div>

      <!-- 2. Turbo LoRA Toggle & Selector Card -->
      <div
        class="border-border bg-card/60 flex flex-col gap-3 rounded-lg border p-3"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <FastForwardIcon class="h-4 w-4 text-blue-400" />
            <div>
              <p class="text-xs font-semibold">Turbo LoRA</p>
            </div>
          </div>
          <Switch
            v-model="workflowStore.faceDetailer.turboEnabled"
            aria-label="Enable Face Detailer Turbo LoRA"
          />
        </div>

        <div v-if="settings.turboEnabled" class="border-border border-t pt-2.5">
          <WorkflowField label="Turbo LoRA Model">
            <Select
              v-model="workflowStore.faceDetailer.turboLora"
              :disabled="!comfyStore.isConnected"
            >
              <SelectTrigger class="w-full font-mono text-xs">
                <SelectValue placeholder="Select Turbo LoRA" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup class="max-h-40 overflow-y-auto">
                  <SelectItem
                    v-for="lora in turboLoraOptions"
                    :key="lora"
                    :value="lora"
                    class="font-mono text-xs"
                  >
                    {{ lora }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </WorkflowField>
        </div>
      </div>

      <!-- 3. Sampling & Scheduler Parameters -->
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <!-- Steps -->
        <WorkflowField label="Steps">
          <template #action>
            <EditableNumberBadge
              v-model="controlledSteps"
              :min="1"
              :max="settings.turboEnabled ? 12 : 100"
              :step="1"
              :decimals="0"
              badge-class="text-primary"
            />
          </template>
          <div class="flex items-center gap-3 pt-1">
            <Slider
              v-model="stepsSlider"
              :min="1"
              :max="settings.turboEnabled ? 12 : 60"
              :step="1"
              class="w-full"
            />
          </div>
        </WorkflowField>

        <!-- CFG Scale -->
        <WorkflowField label="CFG Scale">
          <template #action>
            <EditableNumberBadge
              :model-value="settings.turboEnabled ? 1 : settings.cfg"
              :min="0.1"
              :max="30"
              :step="0.1"
              :decimals="1"
              :disabled="settings.turboEnabled"
              badge-class="text-primary"
              @update:model-value="settings.cfg = $event"
            />
          </template>
          <div class="flex items-center gap-3 pt-1">
            <Slider
              v-model="cfgSlider"
              :min="0.5"
              :max="15"
              :step="0.1"
              :disabled="settings.turboEnabled"
              class="w-full"
            />
          </div>
        </WorkflowField>

        <!-- Sampler -->
        <WorkflowField label="Sampler">
          <Select
            v-model="workflowStore.faceDetailer.samplerName"
            :disabled="!comfyStore.isConnected"
          >
            <SelectTrigger class="w-full font-mono text-xs">
              <SelectValue placeholder="Select sampler" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup class="max-h-40 overflow-y-auto">
                <SelectItem
                  v-for="sampler in samplerOptions"
                  :key="sampler"
                  :value="sampler"
                  class="font-mono text-xs"
                >
                  {{ sampler }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </WorkflowField>

        <!-- Scheduler -->
        <WorkflowField label="Scheduler">
          <Select
            v-model="workflowStore.faceDetailer.scheduler"
            :disabled="!comfyStore.isConnected"
          >
            <SelectTrigger class="w-full font-mono text-xs">
              <SelectValue placeholder="Select scheduler" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup class="max-h-40 overflow-y-auto">
                <SelectItem
                  v-for="scheduler in schedulerOptions"
                  :key="scheduler"
                  :value="scheduler"
                  class="font-mono text-xs"
                >
                  {{ scheduler }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </WorkflowField>
      </div>

      <!-- 4. Detection & Inpainting Edge Controls -->
      <div
        class="border-border grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2"
      >
        <!-- BBox Threshold -->
        <WorkflowField label="BBox Threshold">
          <template #action>
            <EditableNumberBadge
              v-model="settings.bboxThreshold"
              :min="0.0"
              :max="1.0"
              :step="0.01"
              :decimals="2"
              badge-class="text-primary"
            />
          </template>
          <div class="flex items-center gap-3 pt-1">
            <Slider
              v-model="thresholdSlider"
              :min="0"
              :max="1"
              :step="0.01"
              class="w-full"
            />
          </div>
        </WorkflowField>

        <!-- Denoise -->
        <WorkflowField label="Denoise Strength">
          <template #action>
            <EditableNumberBadge
              v-model="settings.denoise"
              :min="0.01"
              :max="1.0"
              :step="0.01"
              :decimals="2"
              badge-class="text-primary"
            />
          </template>
          <div class="flex items-center gap-3 pt-1">
            <Slider
              v-model="denoiseSlider"
              :min="0.01"
              :max="1"
              :step="0.01"
              class="w-full"
            />
          </div>
        </WorkflowField>

        <!-- Feather -->
        <WorkflowField label="Feather Mask">
          <template #action>
            <EditableNumberBadge
              v-model="settings.feather"
              :min="0"
              :max="100"
              :step="1"
              :decimals="0"
              badge-class="text-primary"
            />
          </template>
          <div class="flex items-center gap-3 pt-1">
            <Slider
              v-model="featherSlider"
              :min="0"
              :max="100"
              :step="1"
              class="w-full"
            />
          </div>
        </WorkflowField>

        <!-- Guide Size -->
        <WorkflowField label="Guide Size">
          <template #action>
            <EditableNumberBadge
              v-model="settings.guideSize"
              :min="64"
              :max="2048"
              :step="8"
              :decimals="0"
              suffix="px"
              badge-class="text-primary"
            />
          </template>
          <div class="flex items-center gap-3 pt-1">
            <Slider
              v-model="guideSizeSlider"
              :min="64"
              :max="2048"
              :step="8"
              class="w-full"
            />
          </div>
        </WorkflowField>
      </div>
    </div>
  </div>
</template>
