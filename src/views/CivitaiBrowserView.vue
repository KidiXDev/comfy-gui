<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  HardDriveDownload,
  ImageOff,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  ThumbsUp,
  X
} from '@lucide/vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
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
  fetchCivitaiBaseModels,
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
const baseModel = ref('all');
const baseModels = ref<string[]>([]);
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

// Dedicated Detail View State
const activeModel = ref<CivitaiModel | null>(null);
const detailImageIndex = ref(0);

// Copy feedback states
const copiedTrigger = ref<number | null>(null);
let copyTriggerTimeout: ReturnType<typeof setTimeout> | null = null;

const copiedMetaKey = ref<string | null>(null);
let copyMetaTimeout: ReturnType<typeof setTimeout> | null = null;

const hasModels = computed(() => models.value.length > 0);

function selectedVersion(model: CivitaiModel): CivitaiVersion | undefined {
  const selected = Number(selectedVersions.value[model.id]);
  return (
    model.modelVersions.find((version) => version.id === selected) ??
    model.modelVersions[0]
  );
}

const activeVersion = computed(() => {
  if (!activeModel.value) return;
  return selectedVersion(activeModel.value);
});

const detailImages = computed(() => {
  return activeVersion.value?.images ?? [];
});

const currentDetailImage = computed(() => {
  return detailImages.value[detailImageIndex.value] ?? detailImages.value[0];
});

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

function isModelDownloaded(model: CivitaiModel): boolean {
  return model.modelVersions.some((version) => !!downloaded.value[version.id]);
}

function openDetail(model: CivitaiModel) {
  activeModel.value = model;
  detailImageIndex.value = activeImageIndices.value[model.id] ?? 0;
}

function closeDetail() {
  activeModel.value = null;
}

function onDetailVersionChange(versionId: string) {
  if (!activeModel.value) return;
  selectedVersions.value[activeModel.value.id] = versionId;
  activeImageIndices.value[activeModel.value.id] = 0;
  detailImageIndex.value = 0;
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
  baseModel.value = 'all';
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
      baseModel: baseModel.value === 'all' ? '' : baseModel.value,
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

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && activeModel.value) {
    closeDetail();
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKeyDown);
  apiKey.value =
    (await loadAppData<{ apiKey?: string }>('civitai_settings'))?.apiKey ?? '';
  try {
    baseModels.value = await fetchCivitaiBaseModels();
  } catch (error) {
    console.error(error);
  }
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
  window.removeEventListener('keydown', onKeyDown);
  unlistenProgress?.();
  if (copyTriggerTimeout) clearTimeout(copyTriggerTimeout);
  if (copyMetaTimeout) clearTimeout(copyMetaTimeout);
});
</script>

<template>
  <div class="bg-background flex h-full flex-col overflow-hidden select-none">
    <!-- VIEW MODE 1: PURE BROWSING VIEW -->
    <template v-if="!activeModel">
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
                Explore AI models for your ComfyUI workspace
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

            <Select
              v-model="baseModel"
              @update:model-value="() => loadModels(false)"
            >
              <SelectTrigger class="w-42 text-xs">
                <SelectValue placeholder="Base model" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup class="max-h-40 overflow-y-auto">
                  <SelectItem value="all">All base models</SelectItem>
                  <SelectItem
                    v-for="value in baseModels"
                    :key="value"
                    :value="value"
                  >
                    {{ value }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select
              v-model="sort"
              @update:model-value="() => loadModels(false)"
            >
              <SelectTrigger class="w-38 text-xs">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup class="max-h-40 overflow-y-auto">
                  <SelectItem value="Most Downloaded"
                    >Most Downloaded</SelectItem
                  >
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
            <div class="flex flex-col gap-2 p-2.5">
              <Skeleton class="h-3.5 w-3/4 rounded" />
              <Skeleton class="h-3 w-1/2 rounded" />
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

        <!-- Pure Browsing 6-Column Models Grid -->
        <div
          v-else
          class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
        >
          <article
            v-for="model in models"
            :key="model.id"
            class="border-border/70 bg-card/75 hover:border-primary/50 hover:bg-card/95 group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            @click="openDetail(model)"
          >
            <!-- Card Thumbnail Area (3:4 Portrait Ratio) -->
            <div
              class="bg-muted/40 relative aspect-3/4 w-full overflow-hidden select-none"
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

                <!-- Installed or Base Model Badge -->
                <div class="flex items-center gap-1">
                  <Badge
                    v-if="isModelDownloaded(model)"
                    class="flex items-center gap-1 border-emerald-500/30 bg-emerald-600/90 px-1.5 py-0.5 text-xs text-white shadow-sm backdrop-blur-md"
                  >
                    <CheckCircle2 class="h-3 w-3" />
                    <span>Installed</span>
                  </Badge>
                  <Badge
                    v-else-if="selectedVersion(model)?.baseModel"
                    variant="outline"
                    class="max-w-28 truncate border-amber-500/30 bg-black/65 px-1.5 py-0.5 text-xs text-amber-300 shadow-sm backdrop-blur-md"
                  >
                    {{ selectedVersion(model)?.baseModel }}
                  </Badge>
                </div>
              </div>

              <!-- Multi-Image Hover Carousel Controls -->
              <template
                v-if="(selectedVersion(model)?.images?.length || 0) > 1"
              >
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
                  class="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center gap-1"
                >
                  <span
                    v-for="(_, imgIdx) in (
                      selectedVersion(model)?.images || []
                    ).slice(0, 5)"
                    :key="imgIdx"
                    class="h-1 rounded-full transition-all"
                    :class="
                      imgIdx === getActiveImageIndex(model.id)
                        ? 'w-3 bg-white shadow-xs'
                        : 'w-1 bg-white/50'
                    "
                  />
                </div>
              </template>

              <!-- Bottom Gradient Overlay with Stats -->
              <div
                class="absolute inset-x-0 bottom-0 flex items-end justify-between bg-linear-to-t from-black/85 via-black/40 to-transparent p-2 text-white"
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

                <span
                  class="text-xs text-white/70 transition-colors group-hover:text-white"
                >
                  {{ model.modelVersions.length }}
                  {{ model.modelVersions.length > 1 ? 'vers' : 'ver' }}
                </span>
              </div>
            </div>

            <!-- Pure Card Footer: Name & Creator -->
            <div class="flex flex-col gap-0.5 p-2.5">
              <h2
                class="group-hover:text-primary truncate text-xs font-semibold transition-colors"
                :title="model.name"
              >
                {{ model.name }}
              </h2>
              <p class="text-muted-foreground truncate text-xs">
                by {{ model.creator?.username || 'Unknown' }}
              </p>
            </div>
          </article>
        </div>

        <!-- Load More Button -->
        <div
          v-if="nextCursor && !loading"
          class="flex justify-center pt-8 pb-4"
        >
          <Button
            variant="outline"
            size="sm"
            class="h-8 px-6 text-xs"
            :disabled="loadingMore"
            @click="loadModels(true)"
          >
            <Loader2
              v-if="loadingMore"
              class="mr-1.5 h-3.5 w-3.5 animate-spin"
            />
            <span>Load More Models</span>
          </Button>
        </div>
      </div>
    </template>

    <!-- VIEW MODE 2: DEDICATED DETAIL PAGE -->
    <template v-else>
      <!-- Dedicated Detail Header -->
      <header
        class="border-border/80 bg-card/85 flex shrink-0 items-center justify-between border-b px-6 py-3.5 backdrop-blur-md"
      >
        <div class="flex min-w-0 items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            class="h-8 cursor-pointer gap-1.5 text-xs font-medium"
            @click="closeDetail"
          >
            <ArrowLeft class="h-3.5 w-3.5" />
            <span>Back to Browser</span>
          </Button>

          <div class="bg-border/80 h-4 w-px shrink-0" />

          <div class="flex items-center gap-2 truncate text-xs">
            <span class="text-muted-foreground shrink-0">Civitai</span>
            <span class="text-muted-foreground">/</span>
            <Badge variant="outline" class="shrink-0 py-0 text-xs">
              {{ activeModel.type }}
            </Badge>
            <span class="text-muted-foreground">/</span>
            <span class="text-foreground truncate font-semibold">
              {{ activeModel.name }}
            </span>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            class="h-8 gap-1.5 text-xs"
            @click="openUrl(`https://civitai.com/models/${activeModel.id}`)"
          >
            <ExternalLink class="h-3.5 w-3.5" />
            <span>View on Civitai</span>
          </Button>
        </div>
      </header>

      <!-- Dedicated Detail Viewport -->
      <div class="flex-1 overflow-y-auto p-6 lg:p-8">
        <div class="mx-auto grid w-full grid-cols-1 gap-8 lg:grid-cols-12">
          <!-- Left Column: Visual Showcase & Generation Parameters -->
          <div class="flex flex-col gap-4 lg:col-span-7">
            <!-- Large Image Preview Stage -->
            <div
              class="border-border/60 relative flex aspect-3/4 max-h-145 w-full items-center justify-center overflow-hidden rounded-2xl border bg-black/40 shadow-md"
            >
              <img
                v-if="currentDetailImage?.url"
                :src="previewUrl(currentDetailImage.url, 1024)"
                :alt="`${activeModel.name} preview`"
                class="h-full w-full object-contain"
              />
              <div
                v-else
                class="text-muted-foreground flex h-full items-center justify-center"
              >
                <ImageOff class="h-12 w-12" />
              </div>

              <!-- Carousel Left/Right Buttons -->
              <template v-if="detailImages.length > 1">
                <button
                  type="button"
                  aria-label="Previous image"
                  class="absolute top-1/2 left-3 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/70 text-white shadow-md backdrop-blur-xs transition-colors hover:bg-black/90"
                  @click="
                    detailImageIndex =
                      (detailImageIndex - 1 + detailImages.length) %
                      detailImages.length
                  "
                >
                  <ChevronLeft class="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next image"
                  class="absolute top-1/2 right-3 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/70 text-white shadow-md backdrop-blur-xs transition-colors hover:bg-black/90"
                  @click="
                    detailImageIndex =
                      (detailImageIndex + 1) % detailImages.length
                  "
                >
                  <ChevronRight class="h-4 w-4" />
                </button>

                <!-- Image Position Counter -->
                <div
                  class="absolute right-3 bottom-3 rounded-full bg-black/70 px-2.5 py-0.5 font-mono text-xs text-white backdrop-blur-xs"
                >
                  {{ detailImageIndex + 1 }} / {{ detailImages.length }}
                </div>
              </template>
            </div>

            <!-- Thumbnail Strip -->
            <div
              v-if="detailImages.length > 1"
              class="flex items-center gap-2.5 overflow-x-auto pb-1"
            >
              <button
                v-for="(img, idx) in detailImages"
                :key="idx"
                type="button"
                class="relative h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 transition-all"
                :class="
                  detailImageIndex === idx
                    ? 'border-primary ring-primary/30 shadow-xs ring-2'
                    : 'border-transparent opacity-60 hover:opacity-100'
                "
                @click="detailImageIndex = idx"
              >
                <img
                  :src="previewUrl(img.url, 150)"
                  alt="thumbnail"
                  class="h-full w-full object-cover"
                />
              </button>
            </div>

            <!-- Generation Parameters Metadata Card (Prompt & Settings) -->
            <div
              v-if="
                currentDetailImage?.meta &&
                Object.keys(currentDetailImage.meta).length > 0
              "
              class="border-border/70 bg-card/70 flex flex-col gap-3 rounded-xl border p-4 shadow-xs"
            >
              <div class="flex items-center gap-1.5 text-xs font-semibold">
                <Sparkles class="text-primary h-3.5 w-3.5" />
                <span>Sample Generation Parameters</span>
              </div>

              <!-- Positive Prompt -->
              <div
                v-if="currentDetailImage.meta.prompt"
                class="flex flex-col gap-1.5"
              >
                <div
                  class="text-muted-foreground flex items-center justify-between text-xs"
                >
                  <span class="font-medium">Positive Prompt</span>
                  <button
                    type="button"
                    class="hover:text-primary flex cursor-pointer items-center gap-1 text-xs font-medium"
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
                      copiedMetaKey === 'prompt' ? 'Copied' : 'Copy Prompt'
                    }}</span>
                  </button>
                </div>
                <p
                  class="bg-muted/60 border-border/40 max-h-28 overflow-y-auto rounded-lg border p-2.5 font-mono text-xs leading-relaxed select-text"
                >
                  {{ currentDetailImage.meta.prompt }}
                </p>
              </div>

              <!-- Negative Prompt -->
              <div
                v-if="currentDetailImage.meta.negativePrompt"
                class="flex flex-col gap-1.5"
              >
                <div
                  class="text-muted-foreground flex items-center justify-between text-xs"
                >
                  <span class="font-medium">Negative Prompt</span>
                  <button
                    type="button"
                    class="hover:text-primary flex cursor-pointer items-center gap-1 text-xs font-medium"
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
                      copiedMetaKey === 'negPrompt' ? 'Copied' : 'Copy Negative'
                    }}</span>
                  </button>
                </div>
                <p
                  class="bg-muted/60 border-border/40 max-h-24 overflow-y-auto rounded-lg border p-2.5 font-mono text-xs leading-relaxed select-text"
                >
                  {{ currentDetailImage.meta.negativePrompt }}
                </p>
              </div>

              <!-- Extra Meta Tags -->
              <div class="flex flex-wrap gap-1.5 pt-1">
                <span
                  v-if="currentDetailImage.meta.sampler"
                  class="bg-muted/80 rounded-md px-2 py-0.5 font-mono text-xs"
                >
                  Sampler: {{ currentDetailImage.meta.sampler }}
                </span>
                <span
                  v-if="currentDetailImage.meta.steps"
                  class="bg-muted/80 rounded-md px-2 py-0.5 font-mono text-xs"
                >
                  Steps: {{ currentDetailImage.meta.steps }}
                </span>
                <span
                  v-if="currentDetailImage.meta.cfgScale"
                  class="bg-muted/80 rounded-md px-2 py-0.5 font-mono text-xs"
                >
                  CFG: {{ currentDetailImage.meta.cfgScale }}
                </span>
                <span
                  v-if="currentDetailImage.meta.seed"
                  class="bg-muted/80 rounded-md px-2 py-0.5 font-mono text-xs"
                >
                  Seed: {{ currentDetailImage.meta.seed }}
                </span>
              </div>
            </div>
          </div>

          <!-- Right Column: Model Information, Version Picker, Download & Description -->
          <div class="flex flex-col gap-5 lg:col-span-5">
            <!-- Main Title & Creator Header Card -->
            <div class="flex flex-col gap-2.5">
              <div class="flex flex-wrap items-center gap-2">
                <Badge variant="outline" class="text-xs">
                  {{ activeModel.type }}
                </Badge>
                <Badge
                  v-if="activeVersion?.baseModel"
                  variant="secondary"
                  class="text-xs"
                >
                  {{ activeVersion.baseModel }}
                </Badge>
                <Badge
                  v-if="activeModel.nsfw"
                  variant="destructive"
                  class="text-xs"
                >
                  NSFW
                </Badge>
              </div>

              <h1 class="text-foreground text-xl font-bold tracking-tight">
                {{ activeModel.name }}
              </h1>

              <div
                class="text-muted-foreground flex flex-wrap items-center gap-3 text-xs"
              >
                <span
                  >Created by
                  <strong class="text-foreground">{{
                    activeModel.creator?.username || 'Unknown'
                  }}</strong></span
                >
                <span>·</span>
                <span class="flex items-center gap-1">
                  <Download class="h-3 w-3" />
                  {{ formatCount(activeModel.stats?.downloadCount) }} downloads
                </span>
                <span>·</span>
                <span class="flex items-center gap-1">
                  <ThumbsUp class="h-3 w-3" />
                  {{ formatCount(activeModel.stats?.thumbsUpCount) }} likes
                </span>
              </div>
            </div>

            <!-- Version Selector Card -->
            <div
              class="border-border/70 bg-card/70 flex flex-col gap-3 rounded-xl border p-4 shadow-xs"
            >
              <div>
                <label
                  class="text-muted-foreground mb-1.5 block text-xs font-medium"
                >
                  Model Version
                </label>
                <Select
                  :model-value="selectedVersions[activeModel.id]"
                  @update:model-value="
                    (val) => onDetailVersionChange(String(val))
                  "
                >
                  <SelectTrigger class="w-full text-xs">
                    <SelectValue placeholder="Select version" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup class="max-h-40 overflow-y-auto">
                      <SelectItem
                        v-for="version in activeModel.modelVersions"
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

              <!-- Technical File Specs -->
              <div class="grid grid-cols-2 gap-2.5 pt-1 text-xs">
                <div
                  class="bg-muted/40 border-border/40 rounded-lg border p-2.5"
                >
                  <span class="text-muted-foreground block text-xs"
                    >Base Architecture</span
                  >
                  <span class="text-xs font-semibold">{{
                    activeVersion?.baseModel || '—'
                  }}</span>
                </div>
                <div
                  class="bg-muted/40 border-border/40 rounded-lg border p-2.5"
                >
                  <span class="text-muted-foreground block text-xs"
                    >File Size</span
                  >
                  <span class="text-xs font-semibold">{{
                    formatSize(primaryFile(activeVersion)?.sizeKB)
                  }}</span>
                </div>
                <div
                  class="bg-muted/40 border-border/40 rounded-lg border p-2.5"
                >
                  <span class="text-muted-foreground block text-xs"
                    >Format</span
                  >
                  <span class="text-xs font-semibold">{{
                    primaryFile(activeVersion)?.metadata?.format || 'SafeTensor'
                  }}</span>
                </div>
                <div
                  class="bg-muted/40 border-border/40 rounded-lg border p-2.5"
                >
                  <span class="text-muted-foreground block text-xs"
                    >Virus Scan</span
                  >
                  <span class="text-xs font-semibold text-emerald-500">{{
                    primaryFile(activeVersion)?.virusScanResult || 'Clean'
                  }}</span>
                </div>
              </div>

              <!-- Primary Download Action Section -->
              <div class="flex flex-col gap-2.5 pt-2">
                <!-- Download Progress Bar (If Downloading) -->
                <div
                  v-if="progress[activeVersion?.id || 0]"
                  class="flex flex-col gap-1.5"
                >
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-muted-foreground"
                      >Downloading model file...</span
                    >
                    <span class="font-mono font-medium">
                      {{
                        downloadPercent(activeVersion?.id || 0) !== null
                          ? `${downloadPercent(activeVersion?.id || 0)}%`
                          : '...'
                      }}
                    </span>
                  </div>
                  <Progress
                    :model-value="downloadPercent(activeVersion?.id || 0) ?? 0"
                    class="h-2"
                  />
                </div>

                <Button
                  class="h-10 w-full cursor-pointer text-xs font-semibold shadow-sm"
                  size="default"
                  :variant="
                    downloaded[activeVersion?.id || 0] ? 'secondary' : 'default'
                  "
                  :disabled="
                    !primaryFile(activeVersion) ||
                    !!progress[activeVersion?.id || 0]
                  "
                  @click="downloadModel(activeModel)"
                >
                  <template v-if="progress[activeVersion?.id || 0]">
                    <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                    <span>
                      Downloading Model
                      {{
                        downloadPercent(activeVersion?.id || 0) !== null
                          ? `(${downloadPercent(activeVersion?.id || 0)}%)`
                          : ''
                      }}
                    </span>
                  </template>
                  <template v-else-if="downloaded[activeVersion?.id || 0]">
                    <CheckCircle2 class="mr-2 h-4 w-4 text-emerald-500" />
                    <span>Installed in ComfyUI</span>
                  </template>
                  <template v-else>
                    <Download class="mr-2 h-4 w-4" />
                    <span
                      >Download to ComfyUI ({{
                        formatSize(primaryFile(activeVersion)?.sizeKB)
                      }})</span
                    >
                  </template>
                </Button>

                <!-- Show in folder button if downloaded -->
                <Button
                  v-if="downloaded[activeVersion?.id || 0]"
                  variant="outline"
                  size="sm"
                  class="h-9 w-full cursor-pointer gap-1.5 text-xs"
                  @click="
                    invoke('show_in_folder', {
                      path: downloaded[activeVersion?.id || 0].modelPath
                    })
                  "
                >
                  <FolderOpen class="h-3.5 w-3.5" />
                  <span>Show File in Folder</span>
                </Button>
              </div>
            </div>

            <!-- Trigger Words / Trained Words Card -->
            <div
              v-if="activeVersion?.trainedWords?.length"
              class="border-border/70 bg-card/70 flex flex-col gap-2.5 rounded-xl border p-4 shadow-xs"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-1.5 text-xs font-semibold">
                  <Sparkles class="text-primary h-3.5 w-3.5" />
                  <span>Trigger Words</span>
                </div>
                <button
                  type="button"
                  class="hover:text-primary flex cursor-pointer items-center gap-1 text-xs font-medium"
                  @click="copyTrainedWords(activeModel)"
                >
                  <Check
                    v-if="copiedTrigger === activeModel.id"
                    class="h-3 w-3 text-emerald-500"
                  />
                  <Copy v-else class="h-3 w-3" />
                  <span>{{
                    copiedTrigger === activeModel.id ? 'Copied!' : 'Copy All'
                  }}</span>
                </button>
              </div>

              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="(word, wIdx) in activeVersion.trainedWords"
                  :key="wIdx"
                  class="bg-muted/70 border-border/70 rounded-md border px-2.5 py-1 font-mono text-xs select-text"
                >
                  {{ word }}
                </span>
              </div>
            </div>

            <!-- Model Tags -->
            <div
              v-if="activeModel.tags?.length"
              class="flex flex-wrap items-center gap-1.5"
            >
              <span
                class="text-muted-foreground flex items-center gap-1 text-xs"
              >
                <Tag class="h-3 w-3" />
                Tags:
              </span>
              <span
                v-for="tag in activeModel.tags.slice(0, 10)"
                :key="tag"
                class="bg-muted/60 text-muted-foreground rounded px-2 py-0.5 text-xs"
              >
                {{ tag }}
              </span>
            </div>

            <!-- Description Card -->
            <div
              class="border-border/70 bg-card/70 flex flex-col gap-2 rounded-xl border p-4 shadow-xs"
            >
              <label class="text-foreground text-xs font-semibold">
                About this Model
              </label>
              <ScrollArea
                class="border-border/40 bg-muted/20 h-60 rounded-lg border p-3 text-xs"
              >
                <p
                  class="text-muted-foreground leading-relaxed whitespace-pre-line select-text"
                >
                  {{ formatDescription(activeModel.description) }}
                </p>
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
