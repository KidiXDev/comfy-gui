<script setup lang="ts">
import SearchableSelect from '../common/SearchableSelect.vue';
import { computed } from 'vue';
import type { ModelSettings } from '@/types/workflow';
import { Loader2, RotateCw } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import WorkflowField from './WorkflowField.vue';
import { useComfyStore } from '../../stores/comfyStore';
import { useWorkflowStore } from '../../stores/workflowStore';

const comfyStore = useComfyStore();
const workflowStore = useWorkflowStore();
const props = defineProps<{ models?: ModelSettings }>();
const models = computed(() => props.models ?? workflowStore.models);

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
        <SearchableSelect
          v-model="models.unetName"
          :options="unetOptions"
          placeholder="Select checkpoint..."
          preview-category="unet"
          grid-title="Select Checkpoint / Diffusion Model"
          :disabled="!comfyStore.isConnected"
        />
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
          <SearchableSelect
            v-model="models.vaeName"
            :options="vaeOptions"
            placeholder="Select VAE..."
            preview-category="vae"
            grid-title="Select VAE"
            :disabled="!comfyStore.isConnected"
          />
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
        <SearchableSelect
          v-model="models.clipName"
          :options="clipOptions"
          placeholder="Select CLIP..."
          preview-category="clip"
          grid-title="Select CLIP Model"
          :disabled="!comfyStore.isConnected"
        />
      </WorkflowField>
    </div>
  </div>
</template>
