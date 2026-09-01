<script setup lang="ts">
import {
  computed,
  onActivated,
  onDeactivated,
  onMounted,
  onUnmounted,
  ref,
  watch
} from 'vue';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Copy,
  Download,
  Eye,
  FileImage,
  Folder,
  Layers,
  Loader2,
  Maximize2,
  Plus,
  RefreshCw,
  Scaling,
  SlidersHorizontal,
  Sparkles,
  SplitSquareVertical,
  Trash2
} from '@lucide/vue';
import { invoke } from '@tauri-apps/api/core';
import ImageLightboxModal from '@/components/common/ImageLightboxModal.vue';
import ImageDropOverlay from '@/components/common/ImageDropOverlay.vue';
import ImageDropzone from '@/components/common/ImageDropzone.vue';
import ImageMetadataBar from '@/components/common/ImageMetadataBar.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useImageTransferStore } from '@/stores/imageTransferStore';
import { formatFileSize } from '@/utils/formatters';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from '@/components/ui/resizable';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { ComfyApi } from '../services/comfyApi';
import { loadAppData, saveAppData } from '../services/appStorage';
import { useComfyStore } from '../stores/comfyStore';
import { useLauncherStore } from '../stores/launcherStore';
import type { ComfyHistoryEntry } from '../types/comfy';

type UpscaleStatus = 'ready' | 'uploading' | 'queued' | 'done' | 'error';
type ViewMode = 'split' | 'side-by-side' | 'result' | 'original';

interface UpscaleItem {
  id: string;
  file: File;
  previewUrl: string;
  status: UpscaleStatus;
  resultUrl?: string;
  savedFilename?: string;
  subfolder?: string;
  type?: string;
  error?: string;
  width?: number;
  height?: number;
  resultWidth?: number;
  resultHeight?: number;
  durationMs?: number;
}

interface UpscalerPreferences {
  model: string;
  scale: number;
  filenamePrefix: string;
}

const IMAGE_FILE_NAME = /\.(?:avif|bmp|gif|jpe?g|png|tiff?|webp)$/iu;
const QUICK_SCALES = [1.5, 2.0, 3.0, 4.0, 8.0];

const comfyStore = useComfyStore();
const launcherStore = useLauncherStore();

const fileInput = ref<HTMLInputElement>();
const items = ref<UpscaleItem[]>([]);
const selectedItemId = ref<string | null>(null);
const upscaleModel = ref('');
const upscaleBy = ref(2);
const filenamePrefix = ref('ComfyGUI_Upscale');
const isDragging = ref(false);
const isDraggingQueue = ref(false);
const isSubmitting = ref(false);

// Viewport and Inspector controls
const viewMode = ref<ViewMode>('split');
const splitSliderPos = ref(50);
const isDraggingSplit = ref(false);
const isLightboxOpen = ref(false);
const copySuccess = ref(false);

let disposed = false;
let preferencesLoaded = false;
let savePreferencesTimer: ReturnType<typeof setTimeout> | undefined;

async function loadPreferences() {
  const saved = await loadAppData<Partial<UpscalerPreferences>>(
    'upscaler_preferences'
  );
  if (typeof saved?.model === 'string') upscaleModel.value = saved.model;
  if (typeof saved?.scale === 'number') {
    upscaleBy.value = Math.min(10, Math.max(0.1, saved.scale));
  }
  if (typeof saved?.filenamePrefix === 'string') {
    filenamePrefix.value = saved.filenamePrefix;
  }
  preferencesLoaded = true;
}

function persistPreferences() {
  if (!preferencesLoaded) return;
  void saveAppData('upscaler_preferences', {
    model: upscaleModel.value,
    scale: upscaleBy.value,
    filenamePrefix: filenamePrefix.value
  } satisfies UpscalerPreferences);
}

function schedulePreferencesSave() {
  if (!preferencesLoaded) return;
  clearTimeout(savePreferencesTimer);
  savePreferencesTimer = setTimeout(persistPreferences, 300);
}

function handleDragEnterQueue(e: DragEvent) {
  e.preventDefault();
  isDraggingQueue.value = true;
}

function handleDragLeaveQueue(e: DragEvent) {
  const currentTarget = e.currentTarget as HTMLElement | null;
  const relatedTarget = e.relatedTarget as Node | null;
  if (
    !currentTarget ||
    !relatedTarget ||
    !currentTarget.contains(relatedTarget)
  ) {
    isDraggingQueue.value = false;
  }
}

function handleDragEnterViewport(e: DragEvent) {
  e.preventDefault();
  isDragging.value = true;
}

function handleDragLeaveViewport(e: DragEvent) {
  const currentTarget = e.currentTarget as HTMLElement | null;
  const relatedTarget = e.relatedTarget as Node | null;
  if (
    !currentTarget ||
    !relatedTarget ||
    !currentTarget.contains(relatedTarget)
  ) {
    isDragging.value = false;
  }
}

// Auto-select first available upscale model
watch(
  () => comfyStore.availableUpscaleModels,
  (models) => {
    if (!models.includes(upscaleModel.value)) {
      upscaleModel.value = models[0] ?? '';
    }
  },
  { immediate: true }
);

// Auto-select the active item when list changes
watch(
  () => items.value.length,
  (newCount) => {
    if (newCount === 0) {
      selectedItemId.value = null;
    } else if (
      !selectedItemId.value ||
      !items.value.some((it) => it.id === selectedItemId.value)
    ) {
      selectedItemId.value = items.value[0]?.id ?? null;
    }
  }
);

watch([upscaleModel, upscaleBy, filenamePrefix], schedulePreferencesSave);

const activeItem = computed(() =>
  items.value.find((item) => item.id === selectedItemId.value)
);

const readyItems = computed(() =>
  items.value.filter(
    (item) => item.status === 'ready' || item.status === 'error'
  )
);

const completedItems = computed(() =>
  items.value.filter((item) => item.status === 'done')
);

const processingItems = computed(() =>
  items.value.filter(
    (item) => item.status === 'uploading' || item.status === 'queued'
  )
);

const overallProgress = computed(() => {
  if (items.value.length === 0) return 0;
  const doneCount = completedItems.value.length;
  return Math.round((doneCount / items.value.length) * 100);
});

const canQueue = computed(
  () =>
    comfyStore.isConnected &&
    Boolean(upscaleModel.value) &&
    readyItems.value.length > 0 &&
    !isSubmitting.value
);

const upscaleByModel = computed({
  get: () => [upscaleBy.value],
  set: (value: number[]) => {
    if (value[0] !== undefined) upscaleBy.value = Number(value[0].toFixed(1));
  }
});

// Projected resolution for the selected image
const targetDimensions = computed(() => {
  const item = activeItem.value;
  if (!item?.width || !item?.height) return null;
  const targetW = Math.round(item.width * upscaleBy.value);
  const targetH = Math.round(item.height * upscaleBy.value);
  const originalMegapixels = (item.width * item.height) / 1_000_000;
  const targetMegapixels = (targetW * targetH) / 1_000_000;
  const pixelIncrease = Math.round(
    ((targetMegapixels - originalMegapixels) / originalMegapixels) * 100
  );
  return {
    width: targetW,
    height: targetH,
    originalMegapixels: originalMegapixels.toFixed(2),
    targetMegapixels: targetMegapixels.toFixed(2),
    pixelIncrease
  };
});

async function extractDimensions(
  url: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
    };
    img.src = url;
  });
}

function addFiles(files: Iterable<File>) {
  for (const file of files) {
    if (!file.type.startsWith('image/') && !IMAGE_FILE_NAME.test(file.name)) {
      continue;
    }
    const previewUrl = URL.createObjectURL(file);
    const item: UpscaleItem = {
      id: crypto.randomUUID(),
      file,
      previewUrl,
      status: 'ready'
    };
    items.value.push(item);
    if (!selectedItemId.value) {
      selectedItemId.value = item.id;
    }

    // Extract image dimensions asynchronously
    void extractDimensions(previewUrl).then(({ width, height }) => {
      if (width > 0 && height > 0) {
        item.width = width;
        item.height = height;
      }
    });
  }
}

function handleFileInput(event: Event) {
  addFiles(Array.from((event.target as HTMLInputElement).files ?? []));
  if (fileInput.value) fileInput.value.value = '';
}

async function handleDrop(event: DragEvent) {
  isDragging.value = false;
  isDraggingQueue.value = false;
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length > 0) {
    addFiles(files);
    return;
  }
  const droppedUrl = event.dataTransfer
    ?.getData('text/uri-list')
    .split(/\r?\n/u)
    .find((url) => url && !url.startsWith('#'));
  if (!droppedUrl) return;
  try {
    const response = await fetch(droppedUrl);
    if (!response.ok)
      throw new Error(`Could not read image (${response.status}).`);
    const blob = await response.blob();
    const name = droppedUrl.split('/').pop()?.split('?')[0] || 'image.png';
    addFiles([new File([blob], name, { type: blob.type })]);
  } catch {
    // Unsupported remote drops are ignored.
  }
}

function handleGlobalPaste(event: ClipboardEvent) {
  const clipboardItems = event.clipboardData?.items;
  if (!clipboardItems) return;
  const imageFiles: File[] = [];
  for (const item of Array.from(clipboardItems)) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        const namedFile = new File(
          [file],
          `pasted_image_${Date.now()}.${item.type.split('/')[1] || 'png'}`,
          { type: file.type }
        );
        imageFiles.push(namedFile);
      }
    }
  }
  if (imageFiles.length > 0) {
    event.preventDefault();
    addFiles(imageFiles);
  }
}

function removeItem(item: UpscaleItem) {
  URL.revokeObjectURL(item.previewUrl);
  items.value = items.value.filter((candidate) => candidate.id !== item.id);
  if (selectedItemId.value === item.id) {
    selectedItemId.value = items.value[0]?.id ?? null;
  }
}

function clearItems() {
  for (const item of items.value) URL.revokeObjectURL(item.previewUrl);
  items.value = [];
  selectedItemId.value = null;
}

function retryItem(item: UpscaleItem) {
  item.status = 'ready';
  item.error = undefined;
  void queueSingleItem(item);
}

async function monitorResult(
  item: UpscaleItem,
  promptId: string,
  startTime: number
) {
  for (let attempt = 0; attempt < 240; attempt++) {
    if (disposed) return;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });
    let entry: ComfyHistoryEntry | undefined;
    try {
      entry = (
        await ComfyApi.fetchHistory(launcherStore.config.serverUrl, promptId)
      )[promptId];
    } catch {
      continue;
    }
    const image = Object.values(entry?.outputs ?? {}).find(
      (output) => output.images?.length
    )?.images?.[0];
    if (image) {
      item.savedFilename = image.filename;
      item.subfolder = image.subfolder;
      item.type = image.type;
      item.resultUrl = ComfyApi.getViewImageUrl(
        launcherStore.config.serverUrl,
        image.filename,
        image.subfolder,
        image.type
      );
      item.status = 'done';
      item.durationMs = Date.now() - startTime;

      // Extract result dimensions
      void extractDimensions(item.resultUrl).then(({ width, height }) => {
        if (width > 0 && height > 0) {
          item.resultWidth = width;
          item.resultHeight = height;
        }
      });
      return;
    }
    if (entry?.status?.status_str === 'error') {
      item.status = 'error';
      item.error = 'Upscale execution failed.';
      return;
    }
  }
  if (!disposed) {
    item.status = 'error';
    item.error = 'Timed out waiting for the upscale result.';
  }
}

async function queueSingleItem(item: UpscaleItem) {
  if (!comfyStore.isConnected || !upscaleModel.value) return;
  item.status = 'uploading';
  item.error = undefined;
  const startTime = Date.now();
  try {
    const extension = item.file.name.match(/\.[^.]+$/u)?.[0] || '.png';
    const uploaded = await ComfyApi.uploadImage(
      launcherStore.config.serverUrl,
      item.file,
      `comfy-gui-upscale-${item.id}${extension}`
    );
    const queued = await ComfyApi.queuePrompt(
      launcherStore.config.serverUrl,
      {
        '1': {
          inputs: { image: uploaded.name },
          class_type: 'LoadImage'
        },
        '2': {
          inputs: {
            image: ['1', 0],
            upscale_model: upscaleModel.value,
            upscale_by: upscaleBy.value
          },
          class_type: 'YEImageUpscale'
        },
        '3': {
          inputs: {
            images: ['2', 0],
            filename_prefix: filenamePrefix.value.trim() || 'ComfyGUI_Upscale'
          },
          class_type: 'SaveImage'
        }
      },
      `comfy-gui-upscale-${crypto.randomUUID()}`
    );
    item.status = 'queued';
    void monitorResult(item, queued.prompt_id, startTime);
  } catch (error) {
    item.status = 'error';
    item.error = error instanceof Error ? error.message : String(error);
  }
}

async function queueBatch() {
  if (!canQueue.value) return;
  isSubmitting.value = true;
  upscaleBy.value = Math.min(10, Math.max(0.1, Number(upscaleBy.value) || 2));

  for (const item of readyItems.value) {
    await queueSingleItem(item);
  }
  isSubmitting.value = false;
}

// Split Slider Mouse/Touch Handlers
function updateSplitFromEvent(clientX: number, targetElem: HTMLElement) {
  const rect = targetElem.getBoundingClientRect();
  const rawPos = ((clientX - rect.left) / rect.width) * 100;
  splitSliderPos.value = Math.max(0, Math.min(100, rawPos));
}

function handleSplitPointerDown(event: PointerEvent) {
  isDraggingSplit.value = true;
  const container = (event.currentTarget as HTMLElement).closest(
    '.split-container'
  ) as HTMLElement;
  if (container) {
    updateSplitFromEvent(event.clientX, container);
  }

  const handlePointerMove = (e: PointerEvent) => {
    if (!isDraggingSplit.value || !container) return;
    updateSplitFromEvent(e.clientX, container);
  };

  const handlePointerUp = () => {
    isDraggingSplit.value = false;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  };

  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);
}

// Clipboard Copy
async function copyImageToClipboard(url?: string) {
  const targetUrl = url || activeItem.value?.resultUrl;
  if (!targetUrl) return;
  try {
    const res = await fetch(targetUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([
      new ClipboardItem({
        [blob.type]: blob
      })
    ]);
    copySuccess.value = true;
    setTimeout(() => {
      copySuccess.value = false;
    }, 2000);
  } catch (error) {
    console.error('Failed to copy image to clipboard:', error);
  }
}

// Output Folder Open
async function openOutputFolder() {
  const workingDir = launcherStore.config.workingDir.replace(/[\\/]+$/u, '');
  if (!workingDir) return;
  const path = /[\\/]comfyui$/iu.test(workingDir)
    ? `${workingDir}\\output`
    : `${workingDir}\\ComfyUI\\output`;
  try {
    await invoke('show_in_folder', { path });
  } catch (error) {
    console.error('Failed to open output folder:', error);
  }
}

const transferStore = useImageTransferStore();

function checkPendingTransfers() {
  const pending = transferStore.consumeUpscaler();
  if (pending.length > 0) {
    const files = pending
      .map((p) => p.file)
      .filter((f): f is File => Boolean(f));
    if (files.length > 0) {
      addFiles(files);
    }
  }
}

onMounted(() => {
  void loadPreferences();
  checkPendingTransfers();
});

onActivated(() => {
  window.addEventListener('paste', handleGlobalPaste);
  checkPendingTransfers();
});

onDeactivated(() => {
  window.removeEventListener('paste', handleGlobalPaste);
  clearTimeout(savePreferencesTimer);
  persistPreferences();
});

onUnmounted(() => {
  disposed = true;
  clearTimeout(savePreferencesTimer);
  persistPreferences();
  window.removeEventListener('paste', handleGlobalPaste);
  clearItems();
});
</script>

<template>
  <div
    class="bg-background flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden select-none"
  >
    <!-- Top Studio Toolbar -->
    <header
      class="border-border bg-card/60 flex h-11 shrink-0 items-center justify-between border-b px-4 backdrop-blur-xs"
    >
      <!-- Left: Branding & Connection Status -->
      <div class="flex items-center gap-2.5">
        <div
          class="border-primary/30 bg-primary/10 text-primary inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-semibold shadow-xs"
        >
          <Scaling class="h-3.5 w-3.5" />
          <span>AI Upscaler Studio</span>
        </div>

        <Badge
          variant="outline"
          :class="
            comfyStore.isConnected
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
          "
          class="text-xs font-medium"
        >
          <span
            class="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
            :class="
              comfyStore.isConnected
                ? 'animate-pulse bg-emerald-400'
                : 'bg-amber-400'
            "
          />
          {{ comfyStore.isConnected ? 'ComfyUI Ready' : 'ComfyUI Offline' }}
        </Badge>

        <!-- Output Folder Quick Button -->
        <Button
          variant="ghost"
          size="sm"
          class="text-muted-foreground hover:text-foreground h-7 gap-1.5 px-2 text-xs"
          title="Open ComfyUI Output Directory"
          @click="openOutputFolder"
        >
          <Folder class="h-3.5 w-3.5" />
          <span>Outputs</span>
        </Button>
      </div>

      <!-- Right: Batch Stats & Quick Actions -->
      <div class="flex items-center gap-2">
        <div
          v-if="items.length > 0"
          class="bg-secondary/60 text-muted-foreground flex items-center gap-2 rounded-lg px-2.5 py-1 font-mono text-xs"
        >
          <span
            ><strong class="text-foreground">{{ items.length }}</strong>
            total</span
          >
          <span class="text-muted-foreground/40">•</span>
          <span
            ><strong class="text-emerald-400">{{
              completedItems.length
            }}</strong>
            done</span
          >
          <span
            v-if="processingItems.length > 0"
            class="text-muted-foreground/40"
            >•</span
          >
          <span
            v-if="processingItems.length > 0"
            class="text-primary flex items-center gap-1"
          >
            <Loader2 class="h-3 w-3 animate-spin" />
            {{ processingItems.length }} active
          </span>
        </div>

        <div v-if="items.length > 0" class="bg-border h-4 w-px" />

        <Button
          v-if="items.length > 0"
          variant="outline"
          size="sm"
          class="h-7 text-xs"
          :disabled="isSubmitting || processingItems.length > 0"
          @click="clearItems"
        >
          <Trash2 class="mr-1 h-3.5 w-3.5" />
          Clear All
        </Button>

        <Button
          size="sm"
          class="h-7 gap-1.5 text-xs font-semibold shadow-xs"
          :disabled="!canQueue"
          @click="queueBatch"
        >
          <Loader2 v-if="isSubmitting" class="h-3.5 w-3.5 animate-spin" />
          <Sparkles v-else class="h-3.5 w-3.5" />
          <span
            >Upscale
            {{ readyItems.length ? `(${readyItems.length})` : '' }}</span
          >
        </Button>
      </div>
    </header>

    <!-- Main Workspace with Resizable Splitter Panels -->
    <ResizablePanelGroup
      direction="horizontal"
      class="min-h-0 w-full flex-1 gap-2 overflow-hidden p-3"
    >
      <!-- Left Panel: Upscale Settings & Image Batch Queue -->
      <ResizablePanel
        :default-size="34"
        :min-size="24"
        :max-size="50"
        class="h-full min-h-0 min-w-0"
      >
        <div class="flex h-full min-h-0 flex-col gap-3 pr-1.5">
          <!-- 1. Model & Scale Parameters Section -->
          <section
            class="border-border bg-card flex shrink-0 flex-col gap-3.5 rounded-xl border p-4 shadow-2xs"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <SlidersHorizontal class="text-primary h-4 w-4" />
                <h2 class="text-xs font-bold tracking-wider uppercase">
                  Upscale Parameters
                </h2>
              </div>
              <Badge variant="secondary" class="font-mono text-xs">
                {{ upscaleBy.toFixed(1) }}× Scale
              </Badge>
            </div>

            <!-- Model Selector -->
            <Field class="gap-1.5">
              <div class="flex items-center justify-between">
                <FieldLabel class="text-xs font-semibold"
                  >Upscale Model</FieldLabel
                >
                <span class="text-muted-foreground font-mono text-xs">
                  {{ comfyStore.availableUpscaleModels.length }} models
                </span>
              </div>
              <Select
                v-model="upscaleModel"
                :disabled="!comfyStore.isConnected || isSubmitting"
              >
                <SelectTrigger class="w-full font-mono text-xs">
                  <SelectValue placeholder="Select upscale model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup class="max-h-40 overflow-y-auto">
                    <SelectItem
                      v-for="model in comfyStore.availableUpscaleModels"
                      :key="model"
                      :value="model"
                      class="font-mono text-xs"
                    >
                      {{ model }}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription class="text-xs">
                Model algorithm applied via yet_essential super-resolution.
              </FieldDescription>
            </Field>

            <!-- Upscale Factor & Preset Badges -->
            <Field class="gap-2">
              <div class="flex items-center justify-between">
                <FieldLabel class="text-xs font-semibold"
                  >Scale Multiplier</FieldLabel
                >
                <div class="flex items-center gap-1">
                  <button
                    v-for="factor in QUICK_SCALES"
                    :key="factor"
                    type="button"
                    class="border-border hover:bg-primary/20 hover:text-primary rounded-md border px-1.5 py-0.5 font-mono text-xs font-medium transition-colors"
                    :class="
                      upscaleBy === factor
                        ? 'border-primary/50 bg-primary/20 text-primary font-bold'
                        : 'bg-secondary text-muted-foreground'
                    "
                    @click="upscaleBy = factor"
                  >
                    {{ factor }}×
                  </button>
                </div>
              </div>

              <Slider
                v-model="upscaleByModel"
                :min="0.1"
                :max="10"
                :step="0.1"
                :disabled="isSubmitting"
                aria-label="Upscale factor"
                class="py-1"
              />

              <div
                class="text-muted-foreground flex items-center justify-between font-mono text-xs"
              >
                <span>0.1×</span>
                <span>5.0×</span>
                <span>10.0×</span>
              </div>
            </Field>

            <!-- Target Resolution Preview Card -->
            <div
              v-if="targetDimensions"
              class="border-border bg-secondary/50 flex flex-col gap-1.5 rounded-lg border p-2.5 font-mono text-xs"
            >
              <div
                class="text-muted-foreground flex items-center justify-between"
              >
                <span>Input Canvas:</span>
                <span class="text-foreground"
                  >{{ activeItem?.width }} × {{ activeItem?.height }} px</span
                >
              </div>
              <div
                class="text-muted-foreground flex items-center justify-between"
              >
                <span>Output Canvas:</span>
                <span class="text-primary font-bold"
                  >{{ targetDimensions.width }} ×
                  {{ targetDimensions.height }} px</span
                >
              </div>
              <div
                class="border-border/60 text-muted-foreground flex items-center justify-between border-t pt-1 text-xs"
              >
                <span>Pixel Count:</span>
                <span class="font-semibold text-emerald-400">
                  {{ targetDimensions.originalMegapixels }} MP ➔
                  {{ targetDimensions.targetMegapixels }} MP (+{{
                    targetDimensions.pixelIncrease
                  }}%)
                </span>
              </div>
            </div>

            <!-- Output Prefix Field -->
            <Field class="gap-1.5">
              <FieldLabel class="text-xs font-semibold"
                >Filename Prefix</FieldLabel
              >
              <Input
                v-model="filenamePrefix"
                placeholder="ComfyGUI_Upscale"
                class="h-8 font-mono text-xs"
                :disabled="isSubmitting"
              />
            </Field>

            <!-- Batch Queue Action Button -->
            <Button
              class="w-full gap-2 font-semibold shadow-xs"
              :disabled="!canQueue"
              @click="queueBatch"
            >
              <Loader2 v-if="isSubmitting" class="h-4 w-4 animate-spin" />
              <Sparkles v-else class="h-4 w-4" />
              <span>
                {{
                  readyItems.length > 0
                    ? `Start Upscale (${readyItems.length} Images)`
                    : 'Queue Upscale'
                }}
              </span>
            </Button>

            <!-- Progress Bar if batch is active -->
            <div
              v-if="processingItems.length > 0"
              class="flex flex-col gap-1.5"
            >
              <div
                class="flex items-center justify-between text-xs font-medium"
              >
                <span class="text-primary flex items-center gap-1.5">
                  <Loader2 class="h-3 w-3 animate-spin" />
                  Processing batch...
                </span>
                <span class="font-mono text-xs">{{ overallProgress }}%</span>
              </div>
              <Progress :model-value="overallProgress" class="h-1.5" />
            </div>
          </section>

          <!-- 2. Batch Queue Management Section -->
          <section
            class="border-border bg-card relative flex min-h-0 flex-1 flex-col gap-3 rounded-xl border p-4 shadow-2xs transition-colors"
            :class="
              isDraggingQueue
                ? 'border-primary ring-primary/40 bg-primary/5 ring-1'
                : ''
            "
            @dragenter="handleDragEnterQueue"
            @dragover.prevent="isDraggingQueue = true"
            @dragleave="handleDragLeaveQueue"
            @drop.prevent="handleDrop"
          >
            <div class="flex shrink-0 items-center justify-between">
              <div class="flex items-center gap-2">
                <FileImage class="text-primary h-4 w-4" />
                <h3 class="text-xs font-bold tracking-wider uppercase">
                  Image Queue
                </h3>
              </div>
              <div class="flex items-center gap-1.5">
                <Badge
                  v-if="items.length > 0"
                  variant="secondary"
                  class="font-mono text-xs"
                >
                  {{ items.length }} image{{ items.length > 1 ? 's' : '' }}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-6.5 gap-1 px-2 text-xs"
                  @click="fileInput?.click()"
                >
                  <Plus class="h-3 w-3" />
                  <span>Add Images</span>
                </Button>
              </div>
            </div>

            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              multiple
              class="sr-only"
              @change="handleFileInput"
            />

            <ImageDropOverlay v-if="isDraggingQueue" compact />

            <ImageDropzone
              v-if="items.length === 0"
              fill
              @select="fileInput?.click()"
            />

            <!-- Items List (scrolls smoothly and fills full height of card) -->
            <div
              v-else
              class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1"
            >
              <div
                v-for="item in items"
                :key="item.id"
                class="border-border bg-secondary/40 hover:bg-secondary/70 group flex cursor-pointer items-center gap-2.5 rounded-lg border p-2 transition-all"
                :class="
                  selectedItemId === item.id
                    ? 'border-primary ring-primary/30 ring-1'
                    : ''
                "
                @click="selectedItemId = item.id"
              >
                <!-- Item Thumbnail -->
                <div
                  class="bg-background relative h-11 w-11 shrink-0 overflow-hidden rounded-md border"
                >
                  <img
                    :src="item.resultUrl || item.previewUrl"
                    :alt="item.file.name"
                    class="h-full w-full object-cover"
                  />
                  <div
                    v-if="
                      item.status === 'uploading' || item.status === 'queued'
                    "
                    class="bg-background/80 absolute inset-0 flex items-center justify-center"
                  >
                    <Loader2 class="text-primary h-3.5 w-3.5 animate-spin" />
                  </div>
                  <CheckCircle2
                    v-else-if="item.status === 'done'"
                    class="absolute right-0.5 bottom-0.5 h-3.5 w-3.5 text-emerald-400"
                  />
                  <AlertCircle
                    v-else-if="item.status === 'error'"
                    class="text-destructive absolute right-0.5 bottom-0.5 h-3.5 w-3.5"
                  />
                </div>

                <!-- Item Meta -->
                <div class="min-w-0 flex-1">
                  <p class="truncate text-xs font-semibold">
                    {{ item.file.name }}
                  </p>
                  <div
                    class="text-muted-foreground flex items-center gap-1.5 font-mono text-xs"
                  >
                    <span>{{ formatFileSize(item.file.size) }}</span>
                    <span v-if="item.width && item.height">•</span>
                    <span v-if="item.width && item.height">
                      {{ item.width }}×{{ item.height }}
                    </span>
                  </div>
                </div>

                <!-- Item Status Pill / Actions -->
                <div class="flex items-center gap-1">
                  <Badge
                    v-if="item.status === 'done'"
                    variant="outline"
                    class="border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400"
                  >
                    Done
                  </Badge>
                  <Badge
                    v-else-if="
                      item.status === 'queued' || item.status === 'uploading'
                    "
                    variant="outline"
                    class="border-primary/30 bg-primary/10 text-primary text-xs"
                  >
                    Working
                  </Badge>
                  <Badge
                    v-else-if="item.status === 'error'"
                    variant="destructive"
                    class="text-xs"
                  >
                    Error
                  </Badge>

                  <Button
                    v-if="item.status === 'error'"
                    size="iconSm"
                    variant="ghost"
                    class="h-7 w-7 text-amber-400 hover:text-amber-300"
                    title="Retry upscale"
                    @click.stop="retryItem(item)"
                  >
                    <RefreshCw class="h-3.5 w-3.5" />
                  </Button>

                  <Button
                    size="iconSm"
                    variant="ghost"
                    class="text-muted-foreground hover:text-destructive h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                    title="Remove from queue"
                    @click.stop="removeItem(item)"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <!-- Mini Drop Cue at Bottom of List -->
              <div
                class="border-border/60 bg-secondary/20 hover:border-primary/40 hover:bg-primary/5 text-muted-foreground flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed p-2 text-center text-xs transition-colors"
                @click="fileInput?.click()"
              >
                <Plus class="h-3 w-3" />
                <span>Drop more images or click to browse</span>
              </div>
            </div>
          </section>
        </div>
      </ResizablePanel>

      <!-- Resizable Splitter Handle -->
      <ResizableHandle
        with-handle
        class="hover:bg-primary/50 transition-colors"
      />

      <!-- Right Panel: Interactive Studio Viewport & Comparison Stage -->
      <ResizablePanel
        :default-size="66"
        :min-size="50"
        class="h-full min-h-0 min-w-0"
      >
        <div
          class="border-border bg-card/80 flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl border backdrop-blur-xs"
        >
          <!-- Viewport Toolbar -->
          <div
            class="border-border bg-card/90 flex h-10 shrink-0 items-center justify-between border-b px-3 backdrop-blur-xs"
          >
            <!-- Left: Active Item Details & Comparison Mode Toggles -->
            <div class="flex items-center gap-2">
              <div v-if="activeItem" class="flex items-center gap-2">
                <span class="max-w-44 truncate text-xs font-semibold">
                  {{ activeItem.file.name }}
                </span>
                <Badge
                  v-if="activeItem.status === 'done'"
                  variant="outline"
                  class="border-emerald-500/30 bg-emerald-500/10 font-mono text-xs text-emerald-400"
                >
                  {{ upscaleBy }}× Completed
                </Badge>
              </div>

              <div v-if="activeItem?.resultUrl" class="bg-border h-3.5 w-px" />

              <!-- View Mode Buttons (Only active when result is available) -->
              <div
                v-if="activeItem?.resultUrl"
                class="bg-secondary/60 flex items-center rounded-lg p-0.5"
              >
                <Tooltip>
                  <TooltipTrigger as-child>
                    <button
                      type="button"
                      class="rounded-md px-2 py-1 text-xs font-medium transition-colors"
                      :class="
                        viewMode === 'split'
                          ? 'bg-background text-primary font-semibold shadow-2xs'
                          : 'text-muted-foreground hover:text-foreground'
                      "
                      @click="viewMode = 'split'"
                    >
                      <SplitSquareVertical class="inline-block h-3.5 w-3.5" />
                      <span class="ml-1 hidden sm:inline">Split Compare</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    >Interactive Before / After Split Slider</TooltipContent
                  >
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger as-child>
                    <button
                      type="button"
                      class="rounded-md px-2 py-1 text-xs font-medium transition-colors"
                      :class="
                        viewMode === 'side-by-side'
                          ? 'bg-background text-primary font-semibold shadow-2xs'
                          : 'text-muted-foreground hover:text-foreground'
                      "
                      @click="viewMode = 'side-by-side'"
                    >
                      <Columns2 class="inline-block h-3.5 w-3.5" />
                      <span class="ml-1 hidden sm:inline">Side-by-Side</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    >View Original and Upscaled side-by-side</TooltipContent
                  >
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger as-child>
                    <button
                      type="button"
                      class="rounded-md px-2 py-1 text-xs font-medium transition-colors"
                      :class="
                        viewMode === 'result'
                          ? 'bg-background text-primary font-semibold shadow-2xs'
                          : 'text-muted-foreground hover:text-foreground'
                      "
                      @click="viewMode = 'result'"
                    >
                      <Eye class="inline-block h-3.5 w-3.5" />
                      <span class="ml-1 hidden sm:inline">Result</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>View Upscaled Image</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger as-child>
                    <button
                      type="button"
                      class="rounded-md px-2 py-1 text-xs font-medium transition-colors"
                      :class="
                        viewMode === 'original'
                          ? 'bg-background text-primary font-semibold shadow-2xs'
                          : 'text-muted-foreground hover:text-foreground'
                      "
                      @click="viewMode = 'original'"
                    >
                      <Layers class="inline-block h-3.5 w-3.5" />
                      <span class="ml-1 hidden sm:inline">Original</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>View Original Image</TooltipContent>
                </Tooltip>
              </div>
            </div>

            <!-- Right: Viewport Action Buttons (Zoom, Copy, Download, Lightbox) -->
            <div class="flex items-center gap-1">
              <template v-if="activeItem">
                <Tooltip v-if="activeItem.resultUrl">
                  <TooltipTrigger as-child>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      class="h-7 w-7"
                      @click="copyImageToClipboard(activeItem.resultUrl)"
                    >
                      <Check
                        v-if="copySuccess"
                        class="h-3.5 w-3.5 text-emerald-400"
                      />
                      <Copy v-else class="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent
                    >Copy Upscaled Image to Clipboard</TooltipContent
                  >
                </Tooltip>

                <Tooltip v-if="activeItem.resultUrl">
                  <TooltipTrigger as-child>
                    <a
                      :href="activeItem.resultUrl"
                      :download="
                        activeItem.savedFilename || 'upscaled_image.png'
                      "
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-muted-foreground hover:text-foreground hover:bg-secondary inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                    >
                      <Download class="h-3.5 w-3.5" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>Download Upscaled Image</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      class="h-7 w-7"
                      @click="isLightboxOpen = true"
                    >
                      <Maximize2 class="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Fullscreen Lightbox Inspector</TooltipContent>
                </Tooltip>
              </template>
            </div>
          </div>

          <!-- Viewport Stage Area -->
          <div
            class="bg-muted/10 relative flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-hidden p-3"
            @dragenter="handleDragEnterViewport"
            @dragover.prevent="isDragging = true"
            @dragleave="handleDragLeaveViewport"
            @drop.prevent="handleDrop"
          >
            <ImageDropOverlay v-if="isDragging && activeItem" />

            <ImageDropzone
              v-if="!activeItem"
              :dragging="isDragging"
              @select="fileInput?.click()"
            />

            <!-- Active Item Display Stage -->
            <template v-else>
              <!-- 1. SPLIT SLIDER VIEW (When result is available and viewMode is split) -->
              <div
                v-if="activeItem.resultUrl && viewMode === 'split'"
                class="split-container relative flex h-full w-full items-center justify-center overflow-hidden select-none"
              >
                <div
                  class="relative flex h-full max-h-full w-full max-w-full items-center justify-center overflow-hidden"
                >
                  <!-- Background Layer: Result (Upscaled Image) -->
                  <img
                    :src="activeItem.resultUrl"
                    :alt="activeItem.file.name"
                    class="pointer-events-none max-h-full max-w-full object-contain"
                  />

                  <!-- Foreground Layer: Original (Before Image with Clip) -->
                  <div
                    class="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
                    :style="{
                      clipPath: `inset(0 calc(100% - ${splitSliderPos}%) 0 0)`
                    }"
                  >
                    <img
                      :src="activeItem.previewUrl"
                      :alt="activeItem.file.name"
                      class="pointer-events-none max-h-full max-w-full object-contain"
                    />
                  </div>

                  <!-- Split Handle & Divider Line -->
                  <div
                    class="absolute top-0 bottom-0 z-20 flex w-1 cursor-ew-resize items-center justify-center bg-white shadow-lg"
                    :style="{ left: `${splitSliderPos}%` }"
                    @pointerdown="handleSplitPointerDown"
                  >
                    <div
                      class="border-border bg-background/90 text-primary flex h-8 w-8 items-center justify-center rounded-full border shadow-md backdrop-blur-xs transition-transform active:scale-110"
                    >
                      <ChevronLeft class="-mr-1 h-3 w-3" />
                      <ChevronRight class="-ml-1 h-3 w-3" />
                    </div>
                  </div>

                  <!-- Floating Labels -->
                  <div
                    class="bg-background/80 text-muted-foreground pointer-events-none absolute top-3 left-3 z-10 rounded-md px-2 py-1 font-mono text-xs font-semibold shadow-xs backdrop-blur-xs"
                  >
                    ORIGINAL (BEFORE)
                  </div>
                  <div
                    class="border-primary/40 bg-primary/20 text-primary pointer-events-none absolute top-3 right-3 z-10 rounded-md border px-2 py-1 font-mono text-xs font-bold shadow-xs backdrop-blur-xs"
                  >
                    UPSCALED (AFTER)
                  </div>
                </div>
              </div>

              <!-- 2. SIDE-BY-SIDE VIEW -->
              <div
                v-else-if="activeItem.resultUrl && viewMode === 'side-by-side'"
                class="grid h-full w-full grid-cols-2 gap-3 overflow-hidden"
              >
                <div
                  class="border-border bg-background/50 relative flex h-full flex-col items-center justify-center overflow-hidden rounded-lg border p-2"
                >
                  <span
                    class="bg-background/80 text-muted-foreground absolute top-2 left-2 rounded-md px-2 py-0.5 font-mono text-xs font-semibold"
                  >
                    Original ({{ activeItem.width }}×{{ activeItem.height }})
                  </span>
                  <img
                    :src="activeItem.previewUrl"
                    :alt="activeItem.file.name"
                    class="max-h-full max-w-full object-contain"
                  />
                </div>

                <div
                  class="border-border bg-background/50 relative flex h-full flex-col items-center justify-center overflow-hidden rounded-lg border p-2"
                >
                  <span
                    class="border-primary/40 bg-primary/20 text-primary absolute top-2 left-2 rounded-md border px-2 py-0.5 font-mono text-xs font-bold"
                  >
                    Upscaled ({{
                      activeItem.resultWidth ||
                      (activeItem.width
                        ? Math.round(activeItem.width * upscaleBy)
                        : '?')
                    }}×{{
                      activeItem.resultHeight ||
                      (activeItem.height
                        ? Math.round(activeItem.height * upscaleBy)
                        : '?')
                    }})
                  </span>
                  <img
                    :src="activeItem.resultUrl"
                    :alt="activeItem.file.name"
                    class="max-h-full max-w-full object-contain"
                  />
                </div>
              </div>

              <!-- 3. RESULT ONLY OR ORIGINAL ONLY VIEW -->
              <div
                v-else-if="activeItem.resultUrl && viewMode === 'original'"
                class="relative flex h-full w-full items-center justify-center overflow-hidden"
              >
                <img
                  :src="activeItem.previewUrl"
                  :alt="activeItem.file.name"
                  class="max-h-full max-w-full object-contain"
                />
                <div
                  class="bg-background/80 text-muted-foreground absolute top-3 left-3 rounded-md px-2 py-1 font-mono text-xs font-semibold"
                >
                  ORIGINAL
                </div>
              </div>

              <!-- 4. DEFAULT RESULT VIEW (or single image viewport) -->
              <div
                v-else
                class="relative flex h-full w-full items-center justify-center overflow-hidden"
              >
                <img
                  :src="activeItem.resultUrl || activeItem.previewUrl"
                  :alt="activeItem.file.name"
                  class="max-h-full max-w-full object-contain"
                />

                <!-- Processing Overlay Animation -->
                <div
                  v-if="
                    activeItem.status === 'uploading' ||
                    activeItem.status === 'queued'
                  "
                  class="bg-background/70 absolute inset-0 flex flex-col items-center justify-center gap-3 backdrop-blur-xs"
                >
                  <div
                    class="border-primary/30 bg-primary/10 flex h-14 w-14 items-center justify-center rounded-2xl border shadow-lg"
                  >
                    <Loader2 class="text-primary h-7 w-7 animate-spin" />
                  </div>
                  <div class="text-center">
                    <p class="text-sm font-bold">
                      {{
                        activeItem.status === 'uploading'
                          ? 'Uploading image...'
                          : 'Enhancing with AI Super-Resolution...'
                      }}
                    </p>
                    <p class="text-muted-foreground font-mono text-xs">
                      Model: {{ upscaleModel || 'Selected Model' }}
                    </p>
                  </div>
                </div>

                <!-- Error Notification Banner -->
                <div
                  v-if="activeItem.status === 'error'"
                  class="border-destructive/40 bg-destructive/10 text-destructive absolute right-4 bottom-4 left-4 flex items-center justify-between rounded-lg border p-3 text-xs"
                >
                  <div class="flex items-center gap-2">
                    <AlertCircle class="h-4 w-4 shrink-0" />
                    <span>{{ activeItem.error || 'Upscale failed.' }}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    class="border-destructive/40 h-7 text-xs"
                    @click="retryItem(activeItem)"
                  >
                    <RefreshCw class="mr-1 h-3 w-3" />
                    Retry
                  </Button>
                </div>
              </div>
            </template>
          </div>

          <ImageMetadataBar
            v-if="activeItem"
            :width="activeItem.width"
            :height="activeItem.height"
            :file-size="activeItem.file.size"
            :duration-ms="activeItem.durationMs"
            :status="activeItem.status"
          >
            <template #dimensions-extra>
              <template v-if="activeItem.resultUrl">
                <ArrowRight class="text-primary mx-1 inline-block h-3 w-3" />
                <strong class="text-primary font-bold">
                  {{
                    activeItem.resultWidth ||
                    (activeItem.width
                      ? Math.round(activeItem.width * upscaleBy)
                      : '?')
                  }}×{{
                    activeItem.resultHeight ||
                    (activeItem.height
                      ? Math.round(activeItem.height * upscaleBy)
                      : '?')
                  }}
                </strong>
              </template>
            </template>
          </ImageMetadataBar>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>

    <!-- Offline Connection Warning Toast -->
    <div
      v-if="!comfyStore.isConnected"
      class="mx-3 mb-2 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300 shadow-sm"
    >
      <div class="flex items-center gap-2">
        <AlertCircle class="h-4 w-4 shrink-0 text-amber-400" />
        <span>
          ComfyUI server is offline. Start the server from the launcher or
          titlebar to run upscaling jobs.
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        class="h-6.5 border-amber-500/40 text-xs text-amber-300 hover:bg-amber-500/20"
        @click="comfyStore.fetchDiscovery()"
      >
        <RefreshCw class="mr-1 h-3 w-3" />
        Reconnect
      </Button>
    </div>

    <!-- Fullscreen Lightbox Inspector Modal -->
    <ImageLightboxModal
      v-model:open="isLightboxOpen"
      :src="activeItem?.resultUrl || activeItem?.previewUrl"
      :title="activeItem?.file.name"
    >
      <template #actions>
        <Button
          v-if="activeItem?.resultUrl"
          size="iconSm"
          variant="ghost"
          class="h-8 w-8 text-white/80 hover:bg-white/10 hover:text-white"
          title="Copy Image"
          @click="copyImageToClipboard(activeItem.resultUrl)"
        >
          <Check v-if="copySuccess" class="h-4 w-4 text-emerald-400" />
          <Copy v-else class="h-4 w-4" />
        </Button>
        <a
          v-if="activeItem?.resultUrl"
          :href="activeItem.resultUrl"
          :download="activeItem.savedFilename || 'upscaled_image.png'"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          title="Download PNG"
        >
          <Download class="h-4 w-4" />
        </a>
      </template>
    </ImageLightboxModal>
  </div>
</template>
