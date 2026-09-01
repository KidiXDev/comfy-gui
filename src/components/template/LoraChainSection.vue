<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  ChevronDown,
  ChevronUp,
  FolderOpen,
  LayoutGrid,
  Plus,
  Trash2,
  X,
  Zap
} from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import LoraPresetDialog from '../common/LoraPresetDialog.vue';
import ModelGridSelectorDialog from '../common/ModelGridSelectorDialog.vue';
import { ComfyApi } from '../../services/comfyApi';
import { useComfyStore } from '../../stores/comfyStore';
import { useLauncherStore } from '../../stores/launcherStore';
import { useWorkflowStore } from '../../stores/workflowStore';

const comfyStore = useComfyStore();
const launcherStore = useLauncherStore();
const workflowStore = useWorkflowStore();

const isLoraPresetManagerOpen = ref(false);
const isLoraGridOpen = ref(false);
const editingLoraIndex = ref<number | null>(null);
const openedLoraSelects = reactive(new Set<string>());
const failedImageSet = ref(new Set<string>());

const loraOptions = computed(() => {
  if (comfyStore.availableLoras.length > 0) {
    return comfyStore.availableLoras;
  }
  return [
    'ep2-nts.safetensors',
    'anima-base-1-masterpiece-v51.safetensors',
    'ep18-ogipote.safetensors',
    'Anima_colorfix_v1_by_Volnovik.safetensors',
    'chenbin-anima-preview-000081.safetensors',
    '2D_aesthetic_EX_base-v1.0_rank_64_fp16_00001_.safetensors'
  ];
});

function openLoraGrid(index?: number) {
  editingLoraIndex.value = index === undefined ? null : index;
  isLoraGridOpen.value = true;
}

function handleLoraSelect(model: string) {
  if (
    editingLoraIndex.value !== null &&
    workflowStore.loras[editingLoraIndex.value]
  ) {
    workflowStore.loras[editingLoraIndex.value].name = model;
  } else {
    workflowStore.addLora(model, 0.8);
  }
}

function getLoraPreviewUrl(name: string, res = 200): string {
  return ComfyApi.getModelPreviewUrl(
    launcherStore.config.serverUrl,
    'loras',
    name,
    res
  );
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Header Controls -->
    <div
      class="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-2"
    >
      <div class="flex items-center gap-2">
        <span
          class="text-muted-foreground text-xs font-bold tracking-wider uppercase"
        >
          LoRA Stack
        </span>
        <span
          v-if="comfyStore.isConnected"
          class="border-border bg-muted text-foreground rounded-md border px-2 py-0.5 font-mono text-xs font-bold"
        >
          {{ workflowStore.loras.filter((l) => l.enabled).length }} /
          {{ workflowStore.loras.length }}
        </span>
        <span
          v-else
          class="border-border bg-muted text-muted-foreground/80 rounded border px-2 py-0.5 font-mono text-xs font-semibold"
        >
          LOCKED
        </span>
      </div>

      <div class="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          :disabled="!comfyStore.isConnected"
          class="border-border bg-secondary text-foreground hover:bg-accent px-2 py-1 text-xs"
          @click="workflowStore.loadKdxzPreset()"
        >
          <Zap class="text-primary h-3 w-3" />
          <span>KDXz Preset</span>
        </Button>

        <Button
          size="sm"
          variant="outline"
          :disabled="!comfyStore.isConnected"
          class="border-border bg-secondary text-foreground hover:bg-accent px-2 py-1 text-xs"
          title="Browse LoRAs in Grid View"
          @click="openLoraGrid()"
        >
          <LayoutGrid class="h-3 w-3" />
          <span>Browse</span>
        </Button>

        <Button
          size="sm"
          variant="outline"
          :disabled="!comfyStore.isConnected"
          class="border-border bg-secondary text-foreground hover:bg-accent px-2 py-1 text-xs"
          title="Manage LoRA Presets"
          @click="isLoraPresetManagerOpen = true"
        >
          <FolderOpen class="h-3 w-3" />
          <span>Presets</span>
        </Button>

        <Button
          size="sm"
          variant="outline"
          :disabled="!comfyStore.isConnected"
          class="border-border bg-secondary text-foreground hover:bg-accent px-2 py-1 text-xs"
          @click="workflowStore.addLora('', 0.8)"
        >
          <Plus class="h-3 w-3" />
          <span>Add LoRA</span>
        </Button>
      </div>
    </div>

    <!-- Custom Presets Bar if available -->
    <div
      v-if="workflowStore.customPresets.length > 0"
      class="flex flex-wrap items-center gap-1.5"
    >
      <span class="text-muted-foreground text-xs font-medium">Presets:</span>
      <div
        v-for="preset in workflowStore.customPresets"
        :key="preset.id"
        class="border-border bg-muted text-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs"
      >
        <button
          type="button"
          :disabled="!comfyStore.isConnected"
          class="hover:text-primary cursor-pointer font-medium hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          @click="workflowStore.loadCustomPreset(preset.id)"
        >
          {{ preset.name }}
        </button>
        <button
          type="button"
          :disabled="!comfyStore.isConnected"
          class="text-muted-foreground hover:text-destructive ml-0.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          @click="workflowStore.deleteCustomPreset(preset.id)"
        >
          <X class="h-2.5 w-2.5" />
        </button>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-if="workflowStore.loras.length === 0"
      class="border-border bg-muted/20 flex flex-col items-center justify-center rounded-xl border border-dashed py-8 text-center"
    >
      <div
        class="bg-muted text-muted-foreground mb-2 flex h-10 w-10 items-center justify-center rounded-full"
      >
        <Zap class="h-5 w-5 opacity-40" />
      </div>
      <span class="text-muted-foreground text-xs font-semibold">
        No LoRAs Loaded
      </span>
      <p class="text-muted-foreground/70 mt-0.5 text-xs">
        {{
          comfyStore.isConnected
            ? 'Add individual LoRAs or load the KDXz preset stack.'
            : 'Connect ComfyUI server to load and manage LoRAs.'
        }}
      </p>
      <div class="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          :disabled="!comfyStore.isConnected"
          class="text-xs"
          @click="workflowStore.loadKdxzPreset()"
        >
          <Zap class="text-primary mr-1.5 h-3.5 w-3.5" />
          Load KDXz Preset
        </Button>
        <Button
          size="sm"
          variant="outline"
          :disabled="!comfyStore.isConnected"
          class="border-border text-xs"
          @click="openLoraGrid()"
        >
          <LayoutGrid class="mr-1.5 h-3.5 w-3.5" />
          Browse Library
        </Button>
      </div>
    </div>

    <!-- LoRA Items List -->
    <div v-else class="flex flex-col gap-2">
      <div
        v-for="(lora, index) in workflowStore.loras"
        :key="lora.id"
        class="border-border bg-card/60 relative flex flex-col gap-2 rounded-xl border p-2.5 transition-all"
        :class="{ 'opacity-50': !lora.enabled || !comfyStore.isConnected }"
      >
        <!-- Top Row: Order, Checkbox, Select, Actions -->
        <div class="flex items-center justify-between gap-2">
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <span
              class="text-muted-foreground w-4 text-center font-mono text-xs font-bold"
            >
              #{{ index + 1 }}
            </span>
            <Checkbox
              v-model="lora.enabled"
              :disabled="!comfyStore.isConnected"
            />
            <!-- LoRA Thumbnail Avatar -->
            <div
              v-if="lora.name"
              class="border-border bg-muted relative h-7 w-7 shrink-0 overflow-hidden rounded-md border"
              :class="
                comfyStore.isConnected
                  ? 'cursor-pointer'
                  : 'cursor-not-allowed opacity-60'
              "
              :title="
                comfyStore.isConnected
                  ? 'Click to browse in grid'
                  : 'Connect ComfyUI server to browse'
              "
              @click="comfyStore.isConnected && openLoraGrid(index)"
            >
              <img
                v-if="!failedImageSet.has(lora.name)"
                :src="getLoraPreviewUrl(lora.name, 200)"
                :alt="lora.name"
                loading="lazy"
                decoding="async"
                class="h-full w-full object-cover"
                @error="failedImageSet.add(lora.name)"
              />
              <div
                v-else
                class="text-muted-foreground flex h-full w-full items-center justify-center text-xs"
              >
                <Zap class="text-primary h-3 w-3 opacity-60" />
              </div>
            </div>

            <!-- LoRA Selector -->
            <div class="flex flex-1 items-center gap-1">
              <Select
                v-model="lora.name"
                :disabled="!comfyStore.isConnected"
                @update:open="(open) => open && openedLoraSelects.add(lora.id)"
              >
                <SelectTrigger
                  :disabled="!comfyStore.isConnected"
                  class="w-full font-mono text-xs"
                >
                  <SelectValue placeholder="Choose LoRA model...">
                    {{ lora.name }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent v-if="openedLoraSelects.has(lora.id)">
                  <SelectGroup class="max-h-40 overflow-y-auto">
                    <SelectItem
                      v-for="opt in loraOptions"
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
                type="button"
                size="iconSm"
                variant="outline"
                :disabled="!comfyStore.isConnected"
                title="Browse LoRAs in Grid"
                class="border-border bg-secondary text-muted-foreground hover:text-foreground h-7 w-7 shrink-0"
                @click="openLoraGrid(index)"
              >
                <LayoutGrid class="h-3 w-3" />
              </Button>
            </div>
          </div>

          <!-- Reorder & Delete -->
          <div class="flex shrink-0 items-center gap-0.5">
            <Button
              size="iconSm"
              variant="ghost"
              :disabled="!comfyStore.isConnected || index === 0"
              class="text-muted-foreground hover:text-foreground"
              @click="workflowStore.moveLora(index, 'up')"
            >
              <ChevronUp class="h-3.5 w-3.5" />
            </Button>
            <Button
              size="iconSm"
              variant="ghost"
              :disabled="
                !comfyStore.isConnected ||
                index === workflowStore.loras.length - 1
              "
              class="text-muted-foreground hover:text-foreground"
              @click="workflowStore.moveLora(index, 'down')"
            >
              <ChevronDown class="h-3.5 w-3.5" />
            </Button>
            <Button
              size="iconSm"
              variant="ghost"
              :disabled="!comfyStore.isConnected"
              class="text-muted-foreground hover:text-destructive"
              @click="workflowStore.removeLora(lora.id)"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <!-- Weight Slider Row -->
        <div
          class="border-border/60 flex items-center gap-3 border-t px-1 pt-1.5"
        >
          <span class="text-muted-foreground shrink-0 text-xs font-medium"
            >Weight:</span
          >
          <Slider
            :model-value="[lora.strength]"
            :min="-1.5"
            :max="2.0"
            :step="0.05"
            :disabled="!comfyStore.isConnected"
            class="flex-1"
            @update:model-value="
              (val: number[] | undefined) => {
                if (val && val[0] !== undefined)
                  lora.strength = Number(val[0].toFixed(2));
              }
            "
          />
          <EditableNumberBadge
            v-model="lora.strength"
            :min="-3.0"
            :max="3.0"
            :step="0.05"
            :decimals="2"
            :disabled="!comfyStore.isConnected"
            badge-class="text-primary min-w-11 text-right"
          />
        </div>
      </div>
    </div>

    <!-- LoRA Stack Preset Manager Dialog -->
    <LoraPresetDialog v-model:open="isLoraPresetManagerOpen" />

    <!-- Grid View LoRA Selector Dialog -->
    <ModelGridSelectorDialog
      v-model:open="isLoraGridOpen"
      title="Select LoRA Model"
      category="loras"
      :models="loraOptions"
      :selected-model="
        editingLoraIndex !== null
          ? workflowStore.loras[editingLoraIndex]?.name || ''
          : ''
      "
      @select="handleLoraSelect"
    />
  </div>
</template>
