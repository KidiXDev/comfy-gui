<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { ModelSettings } from '@/types/workflow';
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
import ModelGridSelectorDialog from '../common/ModelGridSelectorDialog.vue';
import WorkflowField from './WorkflowField.vue';
import { useComfyStore } from '../../stores/comfyStore';
import { useWorkflowStore } from '../../stores/workflowStore';

const comfyStore = useComfyStore();
const workflowStore = useWorkflowStore();
const props = defineProps<{ models?: ModelSettings }>();
const models = computed(() => props.models ?? workflowStore.models);
const openedSelects = reactive(new Set<string>());
const isModelGridOpen = ref(false);

const unetOptions = computed(() => {
  if (comfyStore.availableUnets.length > 0) {
    return comfyStore.availableUnets;
  }
  return models.value.unetName ? [models.value.unetName] : [];
});

const clipOptions = computed(() => {
  if (comfyStore.availableClips.length > 0) {
    return comfyStore.availableClips;
  }
  return models.value.clipName ? [models.value.clipName] : [];
});

const vaeOptions = computed(() => {
  if (comfyStore.availableVaes.length > 0) {
    return comfyStore.availableVaes;
  }
  return models.value.vaeName ? [models.value.vaeName] : [];
});
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Row 1: Checkpoint & VAE + Refresh -->
    <div class="grid grid-cols-1 gap-3 md:grid-cols-12">
      <!-- Checkpoint (UNET) -->
      <WorkflowField label="Checkpoint / UNET" class="md:col-span-6">
        <template #action>
          <span
            v-if="!comfyStore.isConnected"
            class="border-border bg-muted text-muted-foreground/80 rounded border px-1.5 py-0.5 font-mono text-xs font-semibold"
          >
            LOCKED
          </span>
        </template>
        <div class="flex items-center gap-1.5">
          <Select
            v-model="models.unetName"
            :disabled="!comfyStore.isConnected"
            @update:open="(open) => open && openedSelects.add('unet')"
          >
            <SelectTrigger
              :disabled="!comfyStore.isConnected"
              class="w-full font-mono text-xs"
            >
              <SelectValue placeholder="Select checkpoint...">
                {{ models.unetName }}
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
            v-if="!comfyStore.isConnected"
            class="border-border bg-muted text-muted-foreground/80 rounded border px-1.5 py-0.5 font-mono text-xs font-semibold"
          >
            LOCKED
          </span>
        </template>
        <div class="flex items-center gap-1.5">
          <Select
            v-model="models.vaeName"
            :disabled="!comfyStore.isConnected"
            @update:open="(open) => open && openedSelects.add('vae')"
          >
            <SelectTrigger
              :disabled="!comfyStore.isConnected"
              class="w-full font-mono text-xs"
            >
              <SelectValue placeholder="Select VAE...">
                {{ models.vaeName }}
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

    <!-- Row 2: CLIP -->
    <div class="grid grid-cols-1 gap-3">
      <!-- CLIP Model -->
      <WorkflowField label="CLIP Model">
        <template #action>
          <span
            v-if="!comfyStore.isConnected"
            class="border-border bg-muted text-muted-foreground/80 rounded border px-1.5 py-0.5 font-mono text-xs font-semibold"
          >
            LOCKED
          </span>
        </template>
        <Select
          v-model="models.clipName"
          :disabled="!comfyStore.isConnected"
          @update:open="(open) => open && openedSelects.add('clip')"
        >
          <SelectTrigger
            :disabled="!comfyStore.isConnected"
            class="w-full font-mono text-xs"
          >
            <SelectValue placeholder="Select CLIP...">
              {{ models.clipName }}
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
    </div>

    <!-- Grid View Model Selector Dialog -->
    <ModelGridSelectorDialog
      v-model:open="isModelGridOpen"
      title="Select Checkpoint / Diffusion Model"
      category="unet"
      :models="unetOptions"
      :selected-model="models.unetName"
      @select="(model) => (models.unetName = model)"
    />
  </div>
</template>
