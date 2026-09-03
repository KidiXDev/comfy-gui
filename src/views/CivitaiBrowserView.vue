<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FolderOpen,
  HardDriveDownload,
  ImageOff,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  ThumbsUp,
  X
} from '@lucide/vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  downloadCivitaiModel,
  fetchCivitaiModels,
  type CivitaiDownloadResult,
  type CivitaiModel,
  type CivitaiVersion
} from '../services/civitai';
import { loadAppData } from '../services/appStorage';
import { useLauncherStore } from '../stores/launcherStore';

defineOptions({ name: 'CivitaiBrowserView' });

const SUPPORTED_TYPES =
  'Checkpoint,LORA,LoCon,DoRA,TextualInversion,Hypernetwork,Controlnet,VAE,Upscaler';

const TYPE_SHORTCUTS = [
  { label: 'All', value: 'all' },
  { label: 'Checkpoint', value: 'Checkpoint' },
  { label: 'LoRA', value: 'LORA' },
  { label: 'ControlNet', value: 'Controlnet' },
  { label: 'VAE', value: 'VAE' },
  { label: 'Upscaler', value: 'Upscaler' },
  { label: 'Embedding', value: 'TextualInversion' }
];

const launcherStore = useLauncherStore();
const apiKey = ref('');
const query = ref('');
const modelType = ref('all');
const sort = ref('Most Downloaded');
const period = ref('AllTime');
const models = ref<CivitaiModel[]>([]);
const nextCursor = ref<string>();
const selectedVersions = ref<Record<number, string>>({});
const activeImageIndices = ref<Record<number, number>>({});
const progress = ref<Record<number, { downloaded: number; total?: number }>>(
  {}
);
const downloaded = ref<Record<number, CivitaiDownloadResult>>({});
const loading = ref(false);
const loadingMore = ref(false);
const errorMessage = ref('');
let unlistenProgress: (() => void) | null = null;

// Trigger words copy feedback
const copiedTrigger = ref<number | null>(null);
let copyTriggerTimeout: ReturnType<typeof setTimeout> | null = null;

// Metadata copy feedback in modal
const copiedMetaKey = ref<string | null>(null);
let copyMetaTimeout: ReturnType<typeof setTimeout> | null = null;

// Detail Modal
const detailModel = ref<CivitaiModel | null>(null);
const detailOpen = ref(false);
const detailActiveImageIndex = ref(0);

const hasModels = computed(() => models.value.length > 0);

function selectedVersion(model: CivitaiModel): CivitaiVersion | undefined {
  const selected = Number(selectedVersions.value[model.id]);
  return (
    model.modelVersions.find((version) => version.id === selected) ??
    model.modelVersions[0]
  );
}

function primaryFile(version?: CivitaiVersion) {
  return version?.files.find((file) => file.primary) ?? version?.files[0];
}

function formatCount(value = 0) {
  return new Intl.NumberFormat('en', { notation: 'compact' }).format(value);
}

function formatSize(sizeKB = 0) {
  return sizeKB >= 1024 * 1024
    ? `${(sizeKB / 1024 / 1024).toFixed(1)} GB`
    : `${(sizeKB / 1024).toFixed(0)} MB`;
}

function previewUrl(url: string, width = 600) {
  if (!url) return '';
  if (url.includes('/original=true/')) {
    return url.replace('/original=true/', `/width=${width}/`);
  }
  return url;
}

function downloadPercent(versionId: number) {
  const current = progress.value[versionId];
  return current?.total
    ? Math.min(100, Math.round((current.downloaded / current.total) * 100))
    : null;
}

function getActiveImageIndex(modelId: number): number {
  return activeImageIndices.value[modelId] ?? 0;
}

function prevImage(model: CivitaiModel, event: Event) {
  event.stopPropagation();
  const version = selectedVersion(model);
  const images = version?.images || [];
  if (images.length <= 1) return;
  const current = getActiveImageIndex(model.id);
  activeImageIndices.value[model.id] =
    (current - 1 + images.length) % images.length;
}

function nextImage(model: CivitaiModel, event: Event) {
  event.stopPropagation();
  const version = selectedVersion(model);
  const images = version?.images || [];
  if (images.length <= 1) return;
  const current = getActiveImageIndex(model.id);
  activeImageIndices.value[model.id] = (current + 1) % images.length;
}

function currentImage(model: CivitaiModel) {
  const version = selectedVersion(model);
  const images = version?.images || [];
  const idx = getActiveImageIndex(model.id);
  return images[idx] ?? images[0];
}

function onVersionChange(modelId: number, versionId: string) {
  selectedVersions.value[modelId] = versionId;
  activeImageIndices.value[modelId] = 0;
}

async function copyTrainedWords(model: CivitaiModel, event?: Event) {
  event?.stopPropagation();
  const words = selectedVersion(model)?.trainedWords;
  if (!words || words.length === 0) return;
  const text = words.join(', ');
  try {
    await navigator.clipboard.writeText(text);
    copiedTrigger.value = model.id;
    if (copyTriggerTimeout) clearTimeout(copyTriggerTimeout);
    copyTriggerTimeout = setTimeout(() => {
      copiedTrigger.value = null;
    }, 1500);
  } catch (error) {
    console.error('Failed to copy to clipboard', error);
  }
}

async function copyMetaText(text: string, key: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copiedMetaKey.value = key;
    if (copyMetaTimeout) clearTimeout(copyMetaTimeout);
    copyMetaTimeout = setTimeout(() => {
      copiedMetaKey.value = null;
    }, 1500);
  } catch (error) {
    console.error('Failed to copy prompt', error);
  }
}

function openDetail(model: CivitaiModel) {
  detailModel.value = model;
  detailActiveImageIndex.value = getActiveImageIndex(model.id);
  detailOpen.value = true;
}

const detailImages = computed(() => {
  if (!detailModel.value) return [];
  const version = selectedVersion(detailModel.value);
  return version?.images || [];
});

const currentDetailImage = computed(() => {
  return (
    detailImages.value[detailActiveImageIndex.value] ?? detailImages.value[0]
  );
});

function formatDescription(html?: string): string {
  if (!html) return 'No description provided.';
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || 'No description provided.';
  } catch {
    return html.replaceAll(/<[^>]*>/gu, '');
  }
}

function selectModelType(type: string) {
  if (modelType.value === type) return;
  modelType.value = type;
  void loadModels();
}

function clearSearch() {
  query.value = '';
  void loadModels();
}

function resetFilters() {
  query.value = '';
  modelType.value = 'all';
  sort.value = 'Most Downloaded';
  period.value = 'AllTime';
  void loadModels();
}

async function loadModels(append = false) {
  if (append) loadingMore.value = true;
  else loading.value = true;
  errorMessage.value = '';
  try {
    const response = await fetchCivitaiModels({
      query: query.value,
      modelType: modelType.value === 'all' ? SUPPORTED_TYPES : modelType.value,
      sort: sort.value,
      period: period.value,
      cursor: append ? nextCursor.value : undefined,
      apiKey: apiKey.value
    });
    models.value = append
      ? [...models.value, ...response.items]
      : response.items;
    nextCursor.value = response.metadata.nextCursor;
    for (const model of response.items) {
      if (model.modelVersions[0] && !selectedVersions.value[model.id]) {
        selectedVersions.value[model.id] = String(model.modelVersions[0].id);
      }
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

async function downloadModel(model: CivitaiModel) {
  const version = selectedVersion(model);
  if (!version || progress.value[version.id]) return;
  errorMessage.value = '';
  progress.value[version.id] = { downloaded: 0 };
  try {
    downloaded.value[version.id] = await downloadCivitaiModel({
      versionId: version.id,
      workingDir: launcherStore.config.workingDir,
      apiKey: apiKey.value
    });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    delete progress.value[version.id];
  }
}

onMounted(async () => {
  apiKey.value =
    (await loadAppData<{ apiKey?: string }>('civitai_settings'))?.apiKey ?? '';
  unlistenProgress = await listen<{
    versionId: number;
    downloaded: number;
    total?: number;
  }>('civitai-download-progress', ({ payload }) => {
    progress.value[payload.versionId] = payload;
  });
  await loadModels();
});

onUnmounted(() => {
  unlistenProgress?.();
  if (copyTriggerTimeout) clearTimeout(copyTriggerTimeout);
  if (copyMetaTimeout) clearTimeout(copyMetaTimeout);
});
</script>

<template>
  <div class="bg-background flex h-full flex-col overflow-hidden select-none">
    <!-- Header / Toolbar -->
    <header
      class="border-border/80 bg-card/75 flex shrink-0 flex-col gap-3 border-b px-6 py-4 backdrop-blur-md"
    >
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div
            class="border-primary/30 bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-lg border shadow-xs"
          >
            <HardDriveDownload class="h-4 w-4" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-xs font-bold tracking-wider uppercase">
                Civitai Model Browser
              </h1>
              <Badge
                v-if="hasModels && !loading"
                variant="secondary"
                class="px-1.5 py-0 text-xs"
              >
                {{ models.length }} models
              </Badge>
            </div>
            <p class="text-muted-foreground text-xs">
              Explore and install AI models directly into your ComfyUI workspace
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="outline"
                size="sm"
                class="h-8 text-xs"
                :disabled="loading"
                @click="loadModels(false)"
              >
                <RefreshCw
                  class="h-3.5 w-3.5"
                  :class="{ 'animate-spin': loading }"
                />
                <span class="hidden sm:inline">Refresh</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reload models list</TooltipContent>
          </Tooltip>

          <Button
            variant="outline"
            size="sm"
            class="h-8 text-xs"
            @click="openUrl('https://civitai.com/models')"
          >
            <ExternalLink class="h-3.5 w-3.5" />
            <span class="hidden sm:inline">Civitai.com</span>
          </Button>
        </div>
      </div>

      <!-- Search & Filters -->
      <div class="flex flex-col gap-2.5">
        <form
          class="flex flex-wrap items-center gap-2"
          @submit.prevent="loadModels(false)"
        >
          <div class="relative min-w-60 flex-1">
            <Search
              class="text-muted-foreground absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2"
            />
            <Input
              v-model="query"
              class="pr-8 pl-9 text-xs"
              placeholder="Search checkpoints, LoRAs, ControlNets, VAEs..."
            />
            <button
              v-if="query"
              type="button"
              class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer p-0.5"
              @click="clearSearch"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>

          <Select
            v-model="modelType"
            @update:model-value="() => loadModels(false)"
          >
            <SelectTrigger class="w-38 text-xs">
              <SelectValue placeholder="Model type" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup class="max-h-40 overflow-y-auto">
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="Checkpoint">Checkpoint</SelectItem>
                <SelectItem value="LORA">LoRA</SelectItem>
                <SelectItem value="Controlnet">ControlNet</SelectItem>
                <SelectItem value="VAE">VAE</SelectItem>
                <SelectItem value="Upscaler">Upscaler</SelectItem>
                <SelectItem value="TextualInversion">Embedding</SelectItem>
                <SelectItem value="Hypernetwork">Hypernetwork</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select v-model="sort" @update:model-value="() => loadModels(false)">
            <SelectTrigger class="w-38 text-xs">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup class="max-h-40 overflow-y-auto">
                <SelectItem value="Most Downloaded">Most Downloaded</SelectItem>
                <SelectItem value="Highest Rated">Highest Rated</SelectItem>
                <SelectItem value="Newest">Newest</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select
            v-model="period"
            @update:model-value="() => loadModels(false)"
          >
            <SelectTrigger class="w-32 text-xs">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup class="max-h-40 overflow-y-auto">
                <SelectItem value="AllTime">All time</SelectItem>
                <SelectItem value="Year">Year</SelectItem>
                <SelectItem value="Month">Month</SelectItem>
                <SelectItem value="Week">Week</SelectItem>
                <SelectItem value="Day">Day</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <Button
            type="submit"
            size="sm"
            class="h-8 text-xs"
            :disabled="loading"
          >
            <Loader2 v-if="loading" class="h-3.5 w-3.5 animate-spin" />
            <Search v-else class="h-3.5 w-3.5" />
            <span>Search</span>
          </Button>
        </form>

        <!-- Category Shortcut Pills -->
        <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span class="text-muted-foreground mr-1 text-xs">Filter:</span>
          <button
            v-for="shortcut in TYPE_SHORTCUTS"
            :key="shortcut.value"
            type="button"
            class="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
            :class="
              modelType === shortcut.value
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
            "
            @click="selectModelType(shortcut.value)"
          >
            {{ shortcut.label }}
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content Viewport -->
    <div class="flex-1 overflow-y-auto p-5">
      <!-- Error Message Banner -->
      <div
        v-if="errorMessage"
        class="border-destructive/30 bg-destructive/10 text-destructive mb-4 flex items-center justify-between rounded-lg border px-4 py-3 text-xs shadow-xs"
      >
        <span>{{ errorMessage }}</span>
        <Button
          variant="outline"
          size="sm"
          class="h-7 text-xs"
          @click="loadModels(false)"
        >
          Retry
        </Button>
      </div>

      <!-- Skeleton Loading State (Responsive 6 Columns) -->
      <div
        v-if="loading"
        class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
      >
        <div
          v-for="n in 12"
          :key="n"
          class="border-border/60 bg-card/60 overflow-hidden rounded-xl border p-0 shadow-xs"
        >
          <Skeleton class="aspect-3/4 w-full rounded-b-none" />
          <div class="flex flex-col gap-2.5 p-3">
            <Skeleton class="h-3.5 w-3/4 rounded" />
            <Skeleton class="h-3 w-1/2 rounded" />
            <Skeleton class="h-7 w-full rounded-md" />
            <div class="flex items-center gap-2 pt-1">
              <Skeleton class="h-8 flex-1 rounded-md" />
              <Skeleton class="h-8 w-8 rounded-md" />
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="!hasModels"
        class="border-border/60 bg-card/40 mx-auto my-12 flex max-w-md flex-col items-center justify-center rounded-xl border p-8 text-center text-xs shadow-xs"
      >
        <div
          class="bg-muted text-muted-foreground mb-3 flex h-12 w-12 items-center justify-center rounded-full"
        >
          <ImageOff class="h-6 w-6" />
        </div>
        <h3 class="text-sm font-semibold">No models found</h3>
        <p class="text-muted-foreground mt-1 text-xs">
          Try adjusting your search query, model type, or time period filters.
        </p>
        <Button
          variant="outline"
          size="sm"
          class="mt-4 text-xs"
          @click="resetFilters"
        >
          Reset Filters
        </Button>
      </div>

      <!-- Responsive 6-Column Models Grid -->
      <div
        v-else
        class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
      >
        <article
          v-for="model in models"
          :key="model.id"
          class="border-border/70 bg-card/75 hover:border-primary/40 hover:bg-card/95 group relative flex flex-col overflow-hidden rounded-xl border shadow-xs transition-all duration-200 hover:shadow-md"
        >
          <!-- Card Thumbnail Area (3:4 Portrait Ratio for Civitai Art) -->
          <div
            class="bg-muted/40 relative aspect-3/4 w-full cursor-pointer overflow-hidden select-none"
            @click="openDetail(model)"
          >
            <!-- Preview Image with Smooth Hover Scale -->
            <img
              v-if="currentImage(model)?.url"
              :src="previewUrl(currentImage(model)?.url || '', 450)"
              :alt="`${model.name} preview`"
              class="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
              loading="lazy"
              draggable="false"
            />
            <div
              v-else
              class="text-muted-foreground flex h-full items-center justify-center"
            >
              <ImageOff class="h-8 w-8" />
            </div>

            <!-- Top Gradient Overlay -->
            <div
              class="pointer-events-none absolute inset-x-0 top-0 h-16 bg-linear-to-b from-black/75 via-black/30 to-transparent"
            />

            <!-- Top Badges Row -->
            <div
              class="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-1"
            >
              <!-- Model Type Badge -->
              <Badge
                variant="outline"
                class="border-white/20 bg-black/65 px-2 py-0.5 text-xs font-medium text-white shadow-sm backdrop-blur-md"
              >
                {{ model.type }}
              </Badge>

              <!-- Base Model Badge -->
              <Badge
                v-if="selectedVersion(model)?.baseModel"
                variant="outline"
                class="max-w-28 truncate border-amber-500/30 bg-black/65 px-1.5 py-0.5 text-xs text-amber-300 shadow-sm backdrop-blur-md"
              >
                {{ selectedVersion(model)?.baseModel }}
              </Badge>
            </div>

            <!-- Multi-Image Carousel Controls (Hover) -->
            <template v-if="(selectedVersion(model)?.images?.length || 0) > 1">
              <button
                type="button"
                aria-label="Previous preview image"
                class="absolute top-1/2 left-1.5 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-xs transition-opacity group-hover:opacity-100 hover:bg-black/90"
                @click="prevImage(model, $event)"
              >
                <ChevronLeft class="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Next preview image"
                class="absolute top-1/2 right-1.5 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-xs transition-opacity group-hover:opacity-100 hover:bg-black/90"
                @click="nextImage(model, $event)"
              >
                <ChevronRight class="h-3.5 w-3.5" />
              </button>

              <!-- Carousel Indicators (Dots) -->
              <div
                class="pointer-events-none absolute inset-x-0 bottom-9 flex justify-center gap-1"
              >
                <span
                  v-for="(_, imgIdx) in (
                    selectedVersion(model)?.images || []
                  ).slice(0, 5)"
                  :key="imgIdx"
                  class="h-1 rounded-full transition-all"
                  :class="
                    imgIdx === getActiveImageIndex(model.id)
                      ? 'w-3.5 bg-white shadow-xs'
                      : 'w-1 bg-white/50'
                  "
                />
              </div>
            </template>

            <!-- Bottom Gradient Overlay with Stats -->
            <div
              class="absolute inset-x-0 bottom-0 flex items-end justify-between bg-linear-to-t from-black/85 via-black/40 to-transparent p-2.5 text-white"
            >
              <div class="flex items-center gap-2 text-xs font-medium">
                <span class="flex items-center gap-1 drop-shadow-xs">
                  <Download class="h-3 w-3 text-white/80" />
                  {{ formatCount(model.stats?.downloadCount) }}
                </span>
                <span
                  v-if="model.stats?.thumbsUpCount"
                  class="flex items-center gap-1 drop-shadow-xs"
                >
                  <ThumbsUp class="h-3 w-3 text-white/80" />
                  {{ formatCount(model.stats?.thumbsUpCount) }}
                </span>
              </div>

              <!-- Quick View Button -->
              <span
                class="flex items-center gap-1 rounded bg-black/50 px-1.5 py-0.5 text-xs text-white/90 backdrop-blur-xs transition-colors hover:bg-black/80"
              >
                <Eye class="h-3 w-3" />
                <span>Info</span>
              </span>
            </div>
          </div>

          <!-- Card Body Area -->
          <div class="flex flex-1 flex-col justify-between gap-2.5 p-3">
            <!-- Model Name & Creator -->
            <div>
              <h2
                class="group-hover:text-primary cursor-pointer truncate text-xs font-semibold transition-colors"
                :title="model.name"
                @click="openDetail(model)"
              >
                {{ model.name }}
              </h2>

              <div
                class="text-muted-foreground mt-0.5 flex items-center justify-between gap-2 text-xs"
              >
                <span class="truncate">
                  by {{ model.creator?.username || 'Unknown' }}
                </span>
                <span
                  v-if="primaryFile(selectedVersion(model))?.sizeKB"
                  class="bg-muted/70 text-foreground/80 shrink-0 rounded px-1.5 py-0.5 font-mono text-xs"
                >
                  {{ formatSize(primaryFile(selectedVersion(model))?.sizeKB) }}
                </span>
              </div>
            </div>

            <!-- Version Selector (Wrapped in SelectGroup for AGENTS.md rules) -->
            <Select
              :model-value="selectedVersions[model.id]"
              @update:model-value="
                (val) => onVersionChange(model.id, String(val))
              "
            >
              <SelectTrigger class="h-7.5 w-full text-xs">
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup class="max-h-40 overflow-y-auto">
                  <SelectItem
                    v-for="version in model.modelVersions"
                    :key="version.id"
                    :value="String(version.id)"
                  >
                    {{ version.name }}
                    <span
                      v-if="version.baseModel"
                      class="text-muted-foreground ml-1 text-xs"
                    >
                      · {{ version.baseModel }}
                    </span>
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            <!-- Trigger Words Pill (One-click copy with feedback) -->
            <div
              v-if="selectedVersion(model)?.trainedWords?.length"
              class="bg-muted/40 hover:bg-muted/70 group/trig border-border/50 flex cursor-pointer items-center justify-between rounded-md border px-2 py-1 text-xs transition-colors"
              :title="`Click to copy trigger words: ${selectedVersion(model)?.trainedWords?.join(', ')}`"
              @click="copyTrainedWords(model, $event)"
            >
              <div class="flex items-center gap-1.5 overflow-hidden">
                <Sparkles class="text-primary h-3 w-3 shrink-0" />
                <span class="truncate font-mono text-xs">
                  {{ selectedVersion(model)?.trainedWords?.[0] }}
                </span>
              </div>
              <div class="shrink-0 pl-1">
                <Check
                  v-if="copiedTrigger === model.id"
                  class="animate-in fade-in h-3 w-3 text-emerald-500"
                />
                <Copy
                  v-else
                  class="text-muted-foreground group-hover/trig:text-foreground h-3 w-3 transition-colors"
                />
              </div>
            </div>

            <!-- Actions Row -->
            <div class="flex items-center gap-1.5 pt-0.5">
              <!-- Primary Download Button with Progress & Completed States -->
              <Button
                class="h-8 flex-1 text-xs font-medium"
                size="sm"
                :variant="
                  downloaded[selectedVersion(model)?.id || 0]
                    ? 'secondary'
                    : 'default'
                "
                :disabled="
                  !primaryFile(selectedVersion(model)) ||
                  !!progress[selectedVersion(model)?.id || 0]
                "
                @click="downloadModel(model)"
              >
                <!-- Loading State -->
                <template v-if="progress[selectedVersion(model)?.id || 0]">
                  <Loader2 class="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  <span>
                    {{
                      downloadPercent(selectedVersion(model)?.id || 0) !== null
                        ? `${downloadPercent(selectedVersion(model)?.id || 0)}%`
                        : 'Downloading...'
                    }}
                  </span>
                </template>

                <!-- Downloaded State -->
                <template
                  v-else-if="downloaded[selectedVersion(model)?.id || 0]"
                >
                  <CheckCircle2 class="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                  <span>Installed</span>
                </template>

                <!-- Idle State -->
                <template v-else>
                  <Download class="mr-1.5 h-3.5 w-3.5" />
                  <span>Download</span>
                </template>
              </Button>

              <!-- Show in Folder (When Downloaded) -->
              <Tooltip v-if="downloaded[selectedVersion(model)?.id || 0]">
                <TooltipTrigger as-child>
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-8 w-8 p-0"
                    @click="
                      invoke('show_in_folder', {
                        path: downloaded[selectedVersion(model)?.id || 0]
                          .modelPath
                      })
                    "
                  >
                    <FolderOpen class="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Show file in folder</TooltipContent>
              </Tooltip>

              <!-- Civitai External Link -->
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-8 w-8 p-0"
                    @click="openUrl(`https://civitai.com/models/${model.id}`)"
                  >
                    <ExternalLink class="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open model on Civitai</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </article>
      </div>

      <!-- Load More Button -->
      <div v-if="nextCursor && !loading" class="flex justify-center pt-8 pb-4">
        <Button
          variant="outline"
          size="sm"
          class="h-8 px-6 text-xs"
          :disabled="loadingMore"
          @click="loadModels(true)"
        >
          <Loader2 v-if="loadingMore" class="mr-1.5 h-3.5 w-3.5 animate-spin" />
          <span>Load More Models</span>
        </Button>
      </div>
    </div>

    <!-- Model Detail Dialog / Modal -->
    <Dialog v-model:open="detailOpen">
      <DialogContent
        class="bg-card flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden p-0 sm:max-w-4xl"
      >
        <!-- Modal Header -->
        <DialogHeader class="border-border/70 border-b px-6 py-4">
          <div class="flex items-start justify-between gap-4 pr-6">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <Badge variant="outline" class="text-xs">
                  {{ detailModel?.type }}
                </Badge>
                <Badge
                  v-if="detailModel && selectedVersion(detailModel)?.baseModel"
                  variant="secondary"
                  class="text-xs"
                >
                  {{ selectedVersion(detailModel)?.baseModel }}
                </Badge>
              </div>
              <DialogTitle class="mt-1 truncate text-base font-bold">
                {{ detailModel?.name }}
              </DialogTitle>
              <DialogDescription class="text-muted-foreground mt-0.5 text-xs">
                Created by {{ detailModel?.creator?.username || 'Unknown' }} ·
                {{ formatCount(detailModel?.stats?.downloadCount) }} downloads ·
                {{ formatCount(detailModel?.stats?.thumbsUpCount) }} likes
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <!-- Modal Body (Two Columns: Image Preview & Details) -->
        <div
          v-if="detailModel"
          class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-12"
        >
          <!-- Left Column: Image Carousel & Metadata -->
          <div
            class="bg-muted/20 border-border/70 flex flex-col gap-3 overflow-y-auto p-5 lg:col-span-7 lg:border-r"
          >
            <!-- Main Preview Image -->
            <div
              class="border-border/50 relative aspect-3/4 w-full overflow-hidden rounded-xl border bg-black/30"
            >
              <img
                v-if="currentDetailImage?.url"
                :src="previewUrl(currentDetailImage.url, 1024)"
                :alt="`${detailModel.name} full preview`"
                class="h-full w-full object-contain"
              />
              <div
                v-else
                class="text-muted-foreground flex h-full items-center justify-center"
              >
                <ImageOff class="h-10 w-10" />
              </div>

              <!-- Dialog Image Navigation Arrows -->
              <template v-if="detailImages.length > 1">
                <button
                  type="button"
                  aria-label="Previous image"
                  class="absolute top-1/2 left-2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/70 text-white backdrop-blur-xs transition-colors hover:bg-black/90"
                  @click="
                    detailActiveImageIndex =
                      (detailActiveImageIndex - 1 + detailImages.length) %
                      detailImages.length
                  "
                >
                  <ChevronLeft class="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next image"
                  class="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/70 text-white backdrop-blur-xs transition-colors hover:bg-black/90"
                  @click="
                    detailActiveImageIndex =
                      (detailActiveImageIndex + 1) % detailImages.length
                  "
                >
                  <ChevronRight class="h-4 w-4" />
                </button>
              </template>
            </div>

            <!-- Image Thumbnails Strip -->
            <div
              v-if="detailImages.length > 1"
              class="flex items-center gap-2 overflow-x-auto pb-1"
            >
              <button
                v-for="(img, idx) in detailImages"
                :key="idx"
                type="button"
                class="relative h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-md border-2 transition-all"
                :class="
                  detailActiveImageIndex === idx
                    ? 'border-primary shadow-xs'
                    : 'border-transparent opacity-60 hover:opacity-100'
                "
                @click="detailActiveImageIndex = idx"
              >
                <img
                  :src="previewUrl(img.url, 150)"
                  alt="thumbnail"
                  class="h-full w-full object-cover"
                />
              </button>
            </div>

            <!-- Image Generation Meta (Prompts, Sampler, Seed) if present -->
            <div
              v-if="
                currentDetailImage?.meta &&
                Object.keys(currentDetailImage.meta).length > 0
              "
              class="border-border/60 bg-card/60 flex flex-col gap-2 rounded-lg border p-3 text-xs"
            >
              <div class="flex items-center gap-1.5 text-xs font-medium">
                <Sparkles class="text-primary h-3.5 w-3.5" />
                <span>Image Generation Parameters</span>
              </div>

              <!-- Positive Prompt -->
              <div
                v-if="currentDetailImage.meta.prompt"
                class="flex flex-col gap-1"
              >
                <div
                  class="text-muted-foreground flex items-center justify-between text-xs"
                >
                  <span>Prompt</span>
                  <button
                    type="button"
                    class="hover:text-primary flex cursor-pointer items-center gap-1 text-xs"
                    @click="
                      copyMetaText(
                        String(currentDetailImage.meta.prompt),
                        'prompt'
                      )
                    "
                  >
                    <Check
                      v-if="copiedMetaKey === 'prompt'"
                      class="h-3 w-3 text-emerald-500"
                    />
                    <Copy v-else class="h-3 w-3" />
                    <span>{{
                      copiedMetaKey === 'prompt' ? 'Copied' : 'Copy'
                    }}</span>
                  </button>
                </div>
                <p
                  class="bg-muted/60 max-h-24 overflow-y-auto rounded p-2 font-mono text-xs select-text"
                >
                  {{ currentDetailImage.meta.prompt }}
                </p>
              </div>

              <!-- Negative Prompt -->
              <div
                v-if="currentDetailImage.meta.negativePrompt"
                class="flex flex-col gap-1"
              >
                <div
                  class="text-muted-foreground flex items-center justify-between text-xs"
                >
                  <span>Negative Prompt</span>
                  <button
                    type="button"
                    class="hover:text-primary flex cursor-pointer items-center gap-1 text-xs"
                    @click="
                      copyMetaText(
                        String(currentDetailImage.meta.negativePrompt),
                        'negPrompt'
                      )
                    "
                  >
                    <Check
                      v-if="copiedMetaKey === 'negPrompt'"
                      class="h-3 w-3 text-emerald-500"
                    />
                    <Copy v-else class="h-3 w-3" />
                    <span>{{
                      copiedMetaKey === 'negPrompt' ? 'Copied' : 'Copy'
                    }}</span>
                  </button>
                </div>
                <p
                  class="bg-muted/60 max-h-20 overflow-y-auto rounded p-2 font-mono text-xs select-text"
                >
                  {{ currentDetailImage.meta.negativePrompt }}
                </p>
              </div>

              <!-- Other Meta Specs (Sampler, Steps, CFG, Seed) -->
              <div class="flex flex-wrap gap-1.5 pt-1">
                <span
                  v-if="currentDetailImage.meta.sampler"
                  class="bg-muted/80 rounded px-2 py-0.5 text-xs"
                >
                  Sampler: {{ currentDetailImage.meta.sampler }}
                </span>
                <span
                  v-if="currentDetailImage.meta.steps"
                  class="bg-muted/80 rounded px-2 py-0.5 text-xs"
                >
                  Steps: {{ currentDetailImage.meta.steps }}
                </span>
                <span
                  v-if="currentDetailImage.meta.cfgScale"
                  class="bg-muted/80 rounded px-2 py-0.5 text-xs"
                >
                  CFG: {{ currentDetailImage.meta.cfgScale }}
                </span>
                <span
                  v-if="currentDetailImage.meta.seed"
                  class="bg-muted/80 rounded px-2 py-0.5 font-mono text-xs"
                >
                  Seed: {{ currentDetailImage.meta.seed }}
                </span>
              </div>
            </div>
          </div>

          <!-- Right Column: Specs, Trigger Words, Files, Description & Actions -->
          <div class="flex flex-col gap-4 overflow-y-auto p-5 lg:col-span-5">
            <!-- Version Selector -->
            <div>
              <label
                class="text-muted-foreground mb-1.5 block text-xs font-medium"
              >
                Select Model Version
              </label>
              <Select
                :model-value="selectedVersions[detailModel.id]"
                @update:model-value="
                  (val) => onVersionChange(detailModel!.id, String(val))
                "
              >
                <SelectTrigger class="w-full text-xs">
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup class="max-h-40 overflow-y-auto">
                    <SelectItem
                      v-for="version in detailModel.modelVersions"
                      :key="version.id"
                      :value="String(version.id)"
                    >
                      {{ version.name }} ({{
                        version.baseModel || 'Unknown base'
                      }})
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <!-- Technical File Details -->
            <div
              class="border-border/60 bg-muted/20 grid grid-cols-2 gap-2.5 rounded-lg border p-3 text-xs"
            >
              <div>
                <span class="text-muted-foreground block">Base Model</span>
                <span class="font-medium">
                  {{ selectedVersion(detailModel)?.baseModel || '—' }}
                </span>
              </div>
              <div>
                <span class="text-muted-foreground block">File Size</span>
                <span class="font-medium">
                  {{
                    formatSize(
                      primaryFile(selectedVersion(detailModel))?.sizeKB
                    )
                  }}
                </span>
              </div>
              <div>
                <span class="text-muted-foreground block">Format</span>
                <span class="font-medium">
                  {{
                    primaryFile(selectedVersion(detailModel))?.metadata
                      ?.format || 'SafeTensor'
                  }}
                </span>
              </div>
              <div>
                <span class="text-muted-foreground block">Virus Scan</span>
                <span class="font-medium">
                  {{
                    primaryFile(selectedVersion(detailModel))
                      ?.virusScanResult || 'Clean'
                  }}
                </span>
              </div>
            </div>

            <!-- Trigger / Trained Words -->
            <div v-if="selectedVersion(detailModel)?.trainedWords?.length">
              <div class="mb-1.5 flex items-center justify-between">
                <label class="text-muted-foreground text-xs font-medium">
                  Trigger Words
                </label>
                <button
                  type="button"
                  class="hover:text-primary flex cursor-pointer items-center gap-1 text-xs"
                  @click="copyTrainedWords(detailModel)"
                >
                  <Check
                    v-if="copiedTrigger === detailModel.id"
                    class="h-3 w-3 text-emerald-500"
                  />
                  <Copy v-else class="h-3 w-3" />
                  <span>
                    {{
                      copiedTrigger === detailModel.id ? 'Copied' : 'Copy all'
                    }}
                  </span>
                </button>
              </div>
              <div
                class="bg-muted/40 border-border/50 flex flex-wrap gap-1.5 rounded-lg border p-2.5"
              >
                <span
                  v-for="(word, wIdx) in selectedVersion(detailModel)
                    ?.trainedWords"
                  :key="wIdx"
                  class="bg-background border-border/70 rounded border px-2 py-0.5 font-mono text-xs select-text"
                >
                  {{ word }}
                </span>
              </div>
            </div>

            <!-- Actions Row -->
            <div class="flex flex-col gap-2 pt-1">
              <Button
                class="w-full text-xs font-medium"
                size="sm"
                :variant="
                  downloaded[selectedVersion(detailModel)?.id || 0]
                    ? 'secondary'
                    : 'default'
                "
                :disabled="
                  !primaryFile(selectedVersion(detailModel)) ||
                  !!progress[selectedVersion(detailModel)?.id || 0]
                "
                @click="downloadModel(detailModel)"
              >
                <template
                  v-if="progress[selectedVersion(detailModel)?.id || 0]"
                >
                  <Loader2 class="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  <span>
                    Downloading
                    {{
                      downloadPercent(selectedVersion(detailModel)?.id || 0) !==
                      null
                        ? `(${downloadPercent(selectedVersion(detailModel)?.id || 0)}%)`
                        : '...'
                    }}
                  </span>
                </template>
                <template
                  v-else-if="downloaded[selectedVersion(detailModel)?.id || 0]"
                >
                  <CheckCircle2 class="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                  <span>Model Installed</span>
                </template>
                <template v-else>
                  <Download class="mr-1.5 h-3.5 w-3.5" />
                  <span>Download Model to ComfyUI</span>
                </template>
              </Button>

              <div class="flex items-center gap-2">
                <Button
                  v-if="downloaded[selectedVersion(detailModel)?.id || 0]"
                  variant="outline"
                  size="sm"
                  class="flex-1 text-xs"
                  @click="
                    invoke('show_in_folder', {
                      path: downloaded[selectedVersion(detailModel)?.id || 0]
                        .modelPath
                    })
                  "
                >
                  <FolderOpen class="mr-1.5 h-3.5 w-3.5" />
                  Show in Folder
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  class="flex-1 text-xs"
                  @click="
                    openUrl(`https://civitai.com/models/${detailModel.id}`)
                  "
                >
                  <ExternalLink class="mr-1.5 h-3.5 w-3.5" />
                  View on Civitai
                </Button>
              </div>
            </div>

            <!-- Model Description -->
            <div class="flex flex-col gap-1.5 pt-2">
              <label class="text-muted-foreground text-xs font-medium">
                About this Model
              </label>
              <ScrollArea
                class="border-border/50 bg-muted/20 h-44 rounded-lg border p-3 text-xs"
              >
                <p
                  class="text-muted-foreground leading-relaxed whitespace-pre-line select-text"
                >
                  {{ formatDescription(detailModel.description) }}
                </p>
              </ScrollArea>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
