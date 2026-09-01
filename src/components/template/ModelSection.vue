<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { LayoutGrid, Loader2, RotateCw } from '@lucide/vue';
import { Button } from '@/components/ui/button';
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
import ModelGridSelectorDialog from '../common/ModelGridSelectorDialog.vue';
import WorkflowField from './WorkflowField.vue';
import { useComfyStore } from '../../stores/comfyStore';
import { useWorkflowStore } from '../../stores/workflowStore';

const comfyStore = useComfyStore();
const workflowStore = useWorkflowStore();
const openedSelects = reactive(new Set<string>());
const isModelGridOpen = ref(false);

const unetOptions = computed(() => {
  if (comfyStore.availableUnets.length > 0) {
    return comfyStore.availableUnets;
  }
  return [workflowStore.models.unetName, 'animeBulldozer_anima.safetensors'];
});

const clipOptions = computed(() => {
  if (comfyStore.availableClips.length > 0) {
    return comfyStore.availableClips;
  }
  return [workflowStore.models.clipName, 'qwen_3_06b_base.safetensors'];
});

const vaeOptions = computed(() => {
  if (comfyStore.availableVaes.length > 0) {
    return comfyStore.availableVaes;
  }
  return [workflowStore.models.vaeName, 'qwenimagevae_v7.safetensors'];
});

const shiftModel = computed({
  get: () => [workflowStore.models.shift],
  set: (val: number[]) => {
    if (val && val[0] !== undefined) {
      workflowStore.models.shift = Number(val[0].toFixed(1));
    }
  }
});
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Row 1: Checkpoint & VAE + Refresh -->
    <div class="grid grid-cols-1 gap-3 md:grid-cols-12">
      <!-- Checkpoint (UNET) -->
      <WorkflowField label="Checkpoint / UNET" class="md:col-span-6">
        <template #action>
          <div class="flex items-center gap-1.5">
            <span
              v-if="comfyStore.isConnected && comfyStore.availableUnets.length"
              class="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs font-bold text-emerald-400"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              LIVE
            </span>
            <span
              v-else-if="!comfyStore.isConnected"
              class="border-border bg-muted text-muted-foreground/80 rounded border px-1.5 py-0.5 font-mono text-xs font-semibold"
            >
              LOCKED
            </span>
          </div>
        </template>
        <div class="flex items-center gap-1.5">
          <Select
            v-model="workflowStore.models.unetName"
            :disabled="!comfyStore.isConnected"
            @update:open="(open) => open && openedSelects.add('unet')"
          >
            <SelectTrigger
              :disabled="!comfyStore.isConnected"
              class="w-full font-mono text-xs"
            >
              <SelectValue placeholder="Select checkpoint...">
                {{ workflowStore.models.unetName }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent v-if="openedSelects.has('unet')">
              <SelectGroup class="max-h-40 overflow-y-auto">
                <SelectItem
                  v-for="opt in unetOptions"
                  :key="opt"
                  :value="opt"
                  class="font-mono text-xs"
                >
                  {{ opt }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <!-- Browse Grid View Button -->
          <Button
            type="button"
            size="icon"
            variant="outline"
            :disabled="!comfyStore.isConnected"
            :title="
              comfyStore.isConnected
                ? 'Browse Models (Grid View)'
                : 'Connect ComfyUI server to browse models'
            "
            class="border-border bg-secondary text-foreground hover:bg-accent h-8 w-8 shrink-0"
            @click="isModelGridOpen = true"
          >
            <LayoutGrid class="h-3.5 w-3.5" />
          </Button>
        </div>
      </WorkflowField>

      <!-- VAE + Sync Action -->
      <WorkflowField label="VAE" class="md:col-span-6">
        <template #action>
          <span
            v-if="comfyStore.isConnected && comfyStore.availableVaes.length"
            class="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs font-bold text-emerald-400"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            LIVE
          </span>
          <span
            v-else-if="!comfyStore.isConnected"
            class="border-border bg-muted text-muted-foreground/80 rounded border px-1.5 py-0.5 font-mono text-xs font-semibold"
          >
            LOCKED
          </span>
        </template>
        <div class="flex items-center gap-1.5">
          <Select
            v-model="workflowStore.models.vaeName"
            :disabled="!comfyStore.isConnected"
            @update:open="(open) => open && openedSelects.add('vae')"
          >
            <SelectTrigger
              :disabled="!comfyStore.isConnected"
              class="w-full font-mono text-xs"
            >
              <SelectValue placeholder="Select VAE...">
                {{ workflowStore.models.vaeName }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent v-if="openedSelects.has('vae')">
              <SelectGroup class="max-h-40 overflow-y-auto">
                <SelectItem
                  v-for="opt in vaeOptions"
                  :key="opt"
                  :value="opt"
                  class="font-mono text-xs"
                >
                  {{ opt }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="outline"
            :disabled="!comfyStore.isConnected || comfyStore.isChecking"
            :title="
              comfyStore.isConnected
                ? 'Refresh Models & Discovery'
                : 'Connect ComfyUI server to refresh'
            "
            class="border-border bg-secondary text-foreground hover:bg-accent h-8 w-8 shrink-0"
            @click="comfyStore.fetchDiscovery"
          >
            <Loader2
              v-if="comfyStore.isChecking"
              class="h-3.5 w-3.5 animate-spin"
            />
            <RotateCw v-else class="h-3.5 w-3.5" />
          </Button>
        </div>
      </WorkflowField>
    </div>

    <!-- Row 2: CLIP & AuraFlow Shift -->
    <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
      <!-- CLIP Model -->
      <WorkflowField label="CLIP Model">
        <template #action>
          <span
            v-if="comfyStore.isConnected && comfyStore.availableClips.length"
            class="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs font-bold text-emerald-400"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            LIVE
          </span>
          <span
            v-else-if="!comfyStore.isConnected"
            class="border-border bg-muted text-muted-foreground/80 rounded border px-1.5 py-0.5 font-mono text-xs font-semibold"
          >
            LOCKED
          </span>
        </template>
        <Select
          v-model="workflowStore.models.clipName"
          :disabled="!comfyStore.isConnected"
          @update:open="(open) => open && openedSelects.add('clip')"
        >
          <SelectTrigger
            :disabled="!comfyStore.isConnected"
            class="w-full font-mono text-xs"
          >
            <SelectValue placeholder="Select CLIP...">
              {{ workflowStore.models.clipName }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent v-if="openedSelects.has('clip')">
            <SelectGroup class="max-h-40 overflow-y-auto">
              <SelectItem
                v-for="opt in clipOptions"
                :key="opt"
                :value="opt"
                class="font-mono text-xs"
              >
                {{ opt }}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </WorkflowField>

      <!-- AuraFlow Shift Slider -->
      <WorkflowField label="AuraFlow Shift">
        <template #action>
          <EditableNumberBadge
            v-model="workflowStore.models.shift"
            :min="0.1"
            :max="20.0"
            :step="0.1"
            :decimals="1"
            badge-class="text-primary"
          />
        </template>
        <div class="flex items-center gap-3 pt-1">
          <Slider
            v-model="shiftModel"
            :min="0.5"
            :max="8.0"
            :step="0.1"
            class="w-full"
          />
        </div>
      </WorkflowField>
    </div>

    <!-- Grid View Model Selector Dialog -->
    <ModelGridSelectorDialog
      v-model:open="isModelGridOpen"
      title="Select Checkpoint / Diffusion Model"
      category="unet"
      :models="unetOptions"
      :selected-model="workflowStore.models.unetName"
      @select="(model) => (workflowStore.models.unetName = model)"
    />
  </div>
</template>
