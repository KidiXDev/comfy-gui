<script setup lang="ts">
import {
  computed,
  onActivated,
  onDeactivated,
  onMounted,
  onUnmounted,
  nextTick,
  ref,
  shallowRef,
  watch
} from 'vue';
import { useRouter } from 'vue-router';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { formatFileSize } from '@/utils/formatters';
import {
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Info,
  Layers,
  Loader2,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  RotateCcw,
  Scaling,
  ScanFace,
  Search,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut
} from '@lucide/vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useImageTransferStore } from '@/stores/imageTransferStore';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  clearGalleryCache,
  getGalleryCacheDirectory,
  listOutputImages,
  prepareOutputGallery,
  readOutputImageMetadata,
  refreshOutputImages,
  type OutputImage,
  type OutputImageMetadata
} from '../services/imageGallery';
import { useLauncherStore } from '../stores/launcherStore';
import { useWorkflowStore } from '../stores/workflowStore';

// Grid layout parameters
const GRID_GAP = 12;
// 3:4 Portrait aspect ratio
const CARD_ASPECT_RATIO = 4 / 3;
const CARD_FOOTER_HEIGHT = 52;
const OVERSCAN_ROWS = 3;

const router = useRouter();
const launcherStore = useLauncherStore();
const workflowStore = useWorkflowStore();

const images = shallowRef<OutputImage[]>([]);
const query = ref('');
const sortBy = ref<
  'date-desc' | 'date-asc' | 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc'
>('date-desc');
const selectedSubfolder = ref<string>('all');

const scrollViewport = ref<HTMLElement | null>(null);
const gridWidth = ref(1200);
const isViewActive = ref(true);
const isLoading = ref(false);
const indexStage = ref('Preparing image index');
const indexProcessed = ref(0);
const indexTotal = ref(0);
const cacheDirectory = ref('');
const errorMessage = ref('');

const selectedImage = ref<OutputImage>();
const metadata = ref<OutputImageMetadata>();
const metadataLoading = ref(false);
const showRaw = ref(false);
const showInspector = ref(true);
const zoom = ref(1);

// Copy feedback states
const copiedState = ref<{
  prompt?: boolean;
  negPrompt?: boolean;
  seed?: boolean;
  workflow?: boolean;
}>({});
const appliedToWorkflow = ref(false);

let resizeObserver: ResizeObserver | undefined;
let unlistenProgress: UnlistenFn | undefined;
let savedScrollTop = 0;

// Unique subfolders for filter dropdown
const availableSubfolders = computed<string[]>(() => {
  const folders = new Set<string>();
  for (const img of images.value) {
    if (img.subfolder?.trim()) {
      folders.add(img.subfolder.trim());
    }
  }
  const folderList = Array.from(folders);
  folderList.sort((a: string, b: string) => a.localeCompare(b));
  return folderList;
});

// Filtered and sorted images
const filteredImages = computed<OutputImage[]>(() => {
  const search = query.value.trim().toLowerCase();
  const folder = selectedSubfolder.value;

  let result = images.value;

  if (folder !== 'all') {
    result = result.filter((img) => (img.subfolder || '') === folder);
  }

  if (search) {
    result = result.filter((img) =>
      `${img.subfolder}/${img.filename}`.toLowerCase().includes(search)
    );
  }

  const sortedList = [...result];
  sortedList.sort((a: OutputImage, b: OutputImage) => {
    switch (sortBy.value) {
      case 'date-desc':
        return b.modifiedMs - a.modifiedMs;
      case 'date-asc':
        return a.modifiedMs - b.modifiedMs;
      case 'name-asc':
        return a.filename.localeCompare(b.filename);
      case 'name-desc':
        return b.filename.localeCompare(a.filename);
      case 'size-desc':
        return b.fileSize - a.fileSize;
      case 'size-asc':
        return a.fileSize - b.fileSize;
      default:
        return 0;
    }
  });
  return sortedList;
});

// Dynamic responsive columns based on viewport container width
const columns = computed(() => {
  if (gridWidth.value < 540) return 2;
  if (gridWidth.value < 840) return 3;
  if (gridWidth.value < 1140) return 4;
  if (gridWidth.value < 1500) return 5;
  if (gridWidth.value < 1860) return 6;
  return 7;
});
const cardWidth = computed(() => {
  const totalGapWidth = GRID_GAP * (columns.value - 1);
  return Math.max(80, (gridWidth.value - totalGapWidth) / columns.value);
});
const cardImageHeight = computed(() => cardWidth.value * CARD_ASPECT_RATIO);
const rowHeight = computed(
  () => cardImageHeight.value + CARD_FOOTER_HEIGHT + GRID_GAP
);
const totalRows = computed(() =>
  Math.ceil(filteredImages.value.length / columns.value)
);

// TanStack Vue Virtual for ultra-smooth hardware-accelerated scrolling
const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: totalRows.value,
    enabled: isViewActive.value,
    getScrollElement: () => scrollViewport.value,
    initialOffset: () => savedScrollTop,
    estimateSize: () => rowHeight.value,
    overscan: OVERSCAN_ROWS
  }))
);

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems());
const totalVirtualHeight = computed(() => rowVirtualizer.value.getTotalSize());

const selectedIndex = computed(() =>
  selectedImage.value
    ? filteredImages.value.findIndex(
        (image) => image.path === selectedImage.value?.path
      )
    : -1
);

const promptTags = computed(() =>
  (metadata.value?.prompt ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
);

const indexPercent = computed(() =>
  indexTotal.value > 0
    ? Math.round((indexProcessed.value / indexTotal.value) * 100)
    : 0
);

function imageUrl(image: OutputImage, thumbnail = true) {
  const kind = thumbnail ? 'thumb' : 'full';
  return navigator.userAgent.includes('Windows')
    ? `http://comfygui-image.localhost/${kind}/${image.localId}`
    : `comfygui-image://localhost/${kind}/${image.localId}`;
}

async function loadImages() {
  isLoading.value = true;
  indexStage.value = 'Scanning output files';
  indexProcessed.value = 0;
  indexTotal.value = 0;
  errorMessage.value = '';
  try {
    images.value = await prepareOutputGallery(launcherStore.config.workingDir);
    scrollViewport.value?.scrollTo({ top: 0 });
  } catch (error) {
    errorMessage.value = String(error);
  } finally {
    isLoading.value = false;
  }
}

async function clearCacheAndReindex() {
  if (isLoading.value) return;
  await clearGalleryCache();
  await loadImages();
}

const panX = ref(0);
const panY = ref(0);
const isPanning = ref(false);
let startDragX = 0;
let startDragY = 0;
let startPanX = 0;
let startPanY = 0;
let hasDragged = false;

function resetPanAndZoom() {
  zoom.value = 1;
  panX.value = 0;
  panY.value = 0;
}

function handlePointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  isPanning.value = true;
  hasDragged = false;
  startDragX = event.clientX;
  startDragY = event.clientY;
  startPanX = panX.value;
  startPanY = panY.value;

  const onPointerMove = (e: PointerEvent) => {
    if (!isPanning.value) return;
    const dx = e.clientX - startDragX;
    const dy = e.clientY - startDragY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasDragged = true;
    }
    panX.value = startPanX + dx;
    panY.value = startPanY + dy;
  };

  const onPointerUp = () => {
    isPanning.value = false;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}

function handleBackdropClick(event: MouseEvent) {
  if (!hasDragged && event.target === event.currentTarget) {
    selectedImage.value = undefined;
  }
}

async function openImage(image: OutputImage) {
  selectedImage.value = image;
  metadata.value = undefined;
  metadataLoading.value = true;
  showRaw.value = false;
  showInspector.value = true;
  resetPanAndZoom();
  appliedToWorkflow.value = false;
  try {
    metadata.value = await readOutputImageMetadata(
      launcherStore.config.workingDir,
      image.path
    );
  } catch {
    metadata.value = undefined;
  } finally {
    metadataLoading.value = false;
  }
}

function navigateViewer(direction: number) {
  const nextIndex = selectedIndex.value + direction;
  const image = filteredImages.value[nextIndex];
  if (image) {
    resetPanAndZoom();
    void openImage(image);
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (!selectedImage.value) return;
  if (event.key === 'Escape') selectedImage.value = undefined;
  else if (event.key === 'ArrowLeft') navigateViewer(-1);
  else if (event.key === 'ArrowRight') navigateViewer(1);
  else if (event.key === 'i' || event.key === 'I') {
    showInspector.value = !showInspector.value;
  } else if (event.key === '+' || event.key === '=') {
    zoom.value = Math.min(5, Number((zoom.value + 0.25).toFixed(2)));
  } else if (event.key === '-') {
    zoom.value = Math.max(1, Number((zoom.value - 0.25).toFixed(2)));
    if (zoom.value === 1) {
      panX.value = 0;
      panY.value = 0;
    }
  } else if (event.key === '0') {
    resetPanAndZoom();
  }
}

function handleZoom(event: WheelEvent) {
  event.preventDefault();
  const newZoom = Math.min(
    5,
    Math.max(1, Number((zoom.value - event.deltaY * 0.002).toFixed(2)))
  );
  if (newZoom === 1) {
    panX.value = 0;
    panY.value = 0;
  }
  zoom.value = newZoom;
}

async function copyWithFeedback(
  type: 'prompt' | 'negPrompt' | 'seed' | 'workflow',
  text?: string
) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copiedState.value = { ...copiedState.value, [type]: true };
    setTimeout(() => {
      copiedState.value = { ...copiedState.value, [type]: false };
    }, 2000);
  } catch {
    // clipboard failure fallback
  }
}

function applyToWorkflowGenerator() {
  if (!metadata.value) return;
  if (metadata.value.prompt) {
    workflowStore.positivePrompt = metadata.value.prompt;
  }
  if (metadata.value.negativePrompt) {
    workflowStore.negativePrompt = metadata.value.negativePrompt;
  }
  if (metadata.value.seed && !isNaN(Number(metadata.value.seed))) {
    workflowStore.sampler.seed = Number(metadata.value.seed);
    workflowStore.sampler.randomizeSeed = false;
  }
  if (metadata.value.steps && !isNaN(Number(metadata.value.steps))) {
    workflowStore.sampler.steps = Number(metadata.value.steps);
  }
  if (metadata.value.cfg && !isNaN(Number(metadata.value.cfg))) {
    workflowStore.sampler.cfg = Number(metadata.value.cfg);
  }
  if (metadata.value.sampler) {
    workflowStore.sampler.samplerName = metadata.value.sampler;
  }
  if (metadata.value.scheduler) {
    workflowStore.sampler.scheduler = metadata.value.scheduler;
  }

  appliedToWorkflow.value = true;
  setTimeout(() => {
    appliedToWorkflow.value = false;
  }, 2500);
}

const transferStore = useImageTransferStore();

function sendAndGoToWorkflow() {
  applyToWorkflowGenerator();
  void router.push('/workflow');
}

async function handleSendToUpscaler() {
  if (!selectedImage.value) return;
  await transferStore.sendToUpscaler(
    imageUrl(selectedImage.value, false),
    selectedImage.value.filename
  );
  void router.push('/upscaler');
}

async function handleSendToRmbg() {
  if (!selectedImage.value) return;
  await transferStore.sendToRmbg(
    imageUrl(selectedImage.value, false),
    selectedImage.value.filename
  );
  void router.push('/remove-bg');
}

async function handleSendToFaceDetailer() {
  if (!selectedImage.value) return;
  await transferStore.sendToFaceDetailer(
    imageUrl(selectedImage.value, false),
    selectedImage.value.filename
  );
  void router.push('/face-detailer');
}

async function openLocalPath(path?: string) {
  if (!path) return;
  try {
    await invoke('show_in_folder', { path });
  } catch (error) {
    console.error('Failed to open path in explorer:', error);
  }
}

function outputDirectory() {
  const path = images.value[0]?.path;
  const marker = path?.toLowerCase().lastIndexOf('\\output\\') ?? -1;
  if (path && marker >= 0) return path.slice(0, marker + 7);
  const markerFwd = path?.toLowerCase().lastIndexOf('/output/') ?? -1;
  if (path && markerFwd >= 0) return path.slice(0, markerFwd + 7);
  const root = launcherStore.config.workingDir.replace(/[\\/]+$/u, '');
  return /[\\/]comfyui$/iu.test(root)
    ? `${root}\\output`
    : `${root}\\ComfyUI\\output`;
}

watch([query, selectedSubfolder, sortBy], () => {
  savedScrollTop = 0;
  scrollViewport.value?.scrollTo({ top: 0 });
});

function rememberScroll(event: Event) {
  savedScrollTop = (event.target as HTMLElement).scrollTop;
}

async function activateView() {
  isViewActive.value = true;
  if (scrollViewport.value) resizeObserver?.observe(scrollViewport.value);
  window.addEventListener('keydown', handleKeydown);
  await nextTick();
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  rowVirtualizer.value.measure();
  rowVirtualizer.value.scrollToOffset(savedScrollTop);
  scrollViewport.value?.dispatchEvent(new Event('scroll'));
}

function deactivateView() {
  isViewActive.value = false;
  resizeObserver?.disconnect();
  window.removeEventListener('keydown', handleKeydown);
}

onMounted(async () => {
  cacheDirectory.value = await getGalleryCacheDirectory();
  unlistenProgress = await listen<{
    stage: string;
    processed: number;
    total: number;
  }>('gallery-index-progress', (event) => {
    indexStage.value = event.payload.stage;
    indexProcessed.value = event.payload.processed;
    indexTotal.value = event.payload.total;
  });
  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.contentRect.width > 0) {
        // 16px padding left + right (p-4 = 32px)
        gridWidth.value = entry.contentRect.width - 32;
      }
    }
  });
  activateView();
  try {
    images.value = await listOutputImages(launcherStore.config.workingDir);
    void refreshOutputImages(launcherStore.config.workingDir)
      .then((latestImages) => (images.value = latestImages))
      .catch(() => {});
  } catch {
    await loadImages();
  }
});

onActivated(activateView);
onDeactivated(deactivateView);

onUnmounted(() => {
  deactivateView();
  unlistenProgress?.();
});
</script>

<template>
  <TooltipProvider :delay-duration="200">
    <div class="bg-background flex h-full flex-col overflow-hidden select-none">
      <!-- Sleek Top Header Toolbar -->
      <header
        class="border-border/80 bg-card/60 flex h-13 shrink-0 items-center justify-between border-b px-4 backdrop-blur-md transition-colors"
      >
        <!-- Title & Stats Badge -->
        <div class="flex items-center gap-3">
          <div
            class="border-primary/30 bg-primary/10 text-primary flex h-8.5 w-8.5 items-center justify-center rounded-lg border shadow-xs transition-transform hover:scale-105"
          >
            <ImageIcon class="h-4.5 w-4.5" />
          </div>
          <div class="flex flex-col">
            <div class="flex items-center gap-2">
              <h1
                class="text-foreground text-xs font-bold tracking-wide uppercase"
              >
                Output Gallery
              </h1>
              <Badge
                variant="secondary"
                class="border-border/60 bg-muted/60 font-mono text-xs font-semibold text-sky-400"
              >
                {{ columns }}-Col Portrait
              </Badge>
            </div>
            <p class="text-muted-foreground flex items-center gap-1.5 text-xs">
              <span
                >{{ filteredImages.length }} of {{ images.length }} images</span
              >
              <span class="text-border">•</span>
              <span class="truncate">Recursive ComfyUI Output</span>
            </p>
          </div>
        </div>

        <!-- Filter, Sort, Density & Action Controls -->
        <div class="flex items-center gap-2">
          <!-- Search Input -->
          <div class="relative w-56 sm:w-64">
            <Search
              class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
            />
            <Input
              v-model="query"
              placeholder="Search images or folder..."
              class="border-border/80 bg-background/80 focus-visible:ring-primary/40 h-8 pr-7 pl-8 font-mono text-xs shadow-2xs"
            />
            <button
              v-if="query"
              type="button"
              class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 p-0.5"
              @click="query = ''"
            >
              <X class="h-3 w-3" />
            </button>
          </div>

          <!-- Subfolder Filter Dropdown -->
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="outline"
                size="sm"
                class="border-border/80 bg-secondary/70 hover:bg-secondary h-8 gap-1.5 px-2.5 text-xs"
              >
                <Layers class="text-muted-foreground h-3.5 w-3.5" />
                <span class="hidden max-w-22.5 truncate sm:inline">
                  {{
                    selectedSubfolder === 'all'
                      ? 'All Folders'
                      : selectedSubfolder
                  }}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-48">
              <DropdownMenuLabel class="text-xs"
                >Filter Subfolder</DropdownMenuLabel
              >
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup v-model="selectedSubfolder">
                <DropdownMenuRadioItem value="all">
                  All Folders ({{ images.length }})
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  v-for="folder in availableSubfolders"
                  :key="folder"
                  :value="folder"
                >
                  {{ folder }}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <!-- Sort Dropdown -->
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="outline"
                size="sm"
                class="border-border/80 bg-secondary/70 hover:bg-secondary h-8 gap-1.5 px-2.5 text-xs"
              >
                <ArrowUpDown class="text-muted-foreground h-3.5 w-3.5" />
                <span class="hidden sm:inline">Sort</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-44">
              <DropdownMenuLabel class="text-xs">Sort By</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup v-model="sortBy">
                <DropdownMenuRadioItem value="date-desc">
                  Date: Newest First
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="date-asc">
                  Date: Oldest First
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="name-asc">
                  Filename (A-Z)
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="name-desc">
                  Filename (Z-A)
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="size-desc">
                  Size: Largest First
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="size-asc">
                  Size: Smallest First
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator orientation="vertical" class="h-5" />

          <!-- Cache Folder Button -->
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="outline"
                size="iconSm"
                class="border-border/80 bg-secondary/70 hover:bg-secondary h-8 w-8"
                @click="openLocalPath(cacheDirectory)"
              >
                <HardDrive
                  class="text-muted-foreground hover:text-foreground h-3.5 w-3.5"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p class="text-xs">Open thumbnail cache directory</p>
            </TooltipContent>
          </Tooltip>

          <!-- Clear Cache & Rebuild -->
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="outline"
                size="iconSm"
                :disabled="isLoading"
                class="border-border/80 bg-secondary/70 hover:bg-destructive/10 hover:text-destructive h-8 w-8 disabled:opacity-40"
                @click="clearCacheAndReindex"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p class="text-xs">Clear cache and re-index images</p>
            </TooltipContent>
          </Tooltip>

          <!-- Output Folder Button -->
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="outline"
                size="iconSm"
                class="border-border/80 bg-secondary/70 hover:bg-secondary h-8 w-8"
                @click="openLocalPath(outputDirectory())"
              >
                <FolderOpen
                  class="text-muted-foreground hover:text-foreground h-3.5 w-3.5"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p class="text-xs">Open ComfyUI output directory</p>
            </TooltipContent>
          </Tooltip>

          <!-- Refresh Images Button -->
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="outline"
                size="iconSm"
                class="border-border/80 bg-secondary/70 hover:bg-secondary h-8 w-8"
                @click="loadImages"
              >
                <RefreshCw
                  class="text-muted-foreground hover:text-foreground h-3.5 w-3.5"
                  :class="{ 'animate-spin': isLoading }"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p class="text-xs">Refresh gallery</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      <!-- Main Scroll Viewport with Virtualized 7-Column Portrait Grid -->
      <div
        ref="scrollViewport"
        class="min-h-0 flex-1 overflow-y-auto p-4"
        @scroll.passive="rememberScroll"
      >
        <!-- Scanning / Indexing Loader -->
        <div
          v-if="isLoading && images.length === 0"
          class="flex h-full items-center justify-center p-8"
        >
          <div
            class="border-border/60 bg-card/80 flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border p-6 text-center shadow-lg backdrop-blur-md"
          >
            <div
              class="border-primary/30 bg-primary/10 flex h-12 w-12 items-center justify-center rounded-xl border"
            >
              <Loader2 class="text-primary h-6 w-6 animate-spin" />
            </div>
            <div>
              <p class="text-foreground text-sm font-bold tracking-tight">
                {{ indexStage }}
              </p>
              <p class="text-muted-foreground mt-1 font-mono text-xs">
                {{ indexProcessed }} / {{ indexTotal || '—' }} images processed
              </p>
            </div>
            <div class="w-full">
              <Progress
                :model-value="indexTotal ? indexPercent : 15"
                class="h-2 w-full"
                :class="{ 'animate-pulse': !indexTotal }"
              />
            </div>
            <p class="text-muted-foreground text-xs">
              The 7-column portrait grid will appear automatically once cache is
              ready.
            </p>
          </div>
        </div>

        <!-- Error State -->
        <div
          v-else-if="errorMessage"
          class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
        >
          <div
            class="border-destructive/30 bg-destructive/10 text-destructive flex h-12 w-12 items-center justify-center rounded-2xl border"
          >
            <X class="h-6 w-6" />
          </div>
          <div class="max-w-md">
            <h3 class="text-destructive text-sm font-bold">
              Failed to load gallery
            </h3>
            <p class="text-muted-foreground mt-1 font-mono text-xs break-all">
              {{ errorMessage }}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            class="mt-2 text-xs"
            @click="loadImages"
          >
            <RefreshCw class="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </div>

        <!-- Empty Results State -->
        <div
          v-else-if="filteredImages.length === 0"
          class="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
        >
          <div
            class="border-border/60 bg-muted/40 flex h-16 w-16 items-center justify-center rounded-2xl border"
          >
            <ImageIcon class="h-8 w-8 opacity-40" />
          </div>
          <div>
            <h3 class="text-foreground text-sm font-semibold">
              No images found
            </h3>
            <p class="text-muted-foreground mt-1 text-xs">
              {{
                query
                  ? 'Try adjusting your search query or folder filter.'
                  : 'Generate images in ComfyUI to see them here.'
              }}
            </p>
          </div>
          <Button
            v-if="query || selectedSubfolder !== 'all'"
            variant="outline"
            size="sm"
            class="mt-1 text-xs"
            @click="
              query = '';
              selectedSubfolder = 'all';
            "
          >
            Reset Filters
          </Button>
        </div>

        <!-- TanStack Virtualized 7-Column Portrait Grid -->
        <div
          v-else
          class="relative w-full"
          :style="{ height: `${totalVirtualHeight}px` }"
        >
          <div
            v-for="virtualRow in virtualRows"
            :key="virtualRow.index"
            class="absolute top-0 left-0 grid w-full gap-3"
            :style="{
              height: `${virtualRow.size - GRID_GAP}px`,
              transform: `translateY(${virtualRow.start}px)`,
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
            }"
          >
            <!-- Portrait Card Item -->
            <div
              v-for="image in filteredImages.slice(
                virtualRow.index * columns,
                (virtualRow.index + 1) * columns
              )"
              :key="image.path"
              role="button"
              tabindex="0"
              class="group border-border/70 bg-card/60 hover:bg-card/90 hover:border-border relative flex cursor-pointer flex-col overflow-hidden rounded-xl border text-left transition-colors duration-200 [content-visibility:auto]"
              @click="openImage(image)"
              @keydown.enter="openImage(image)"
              @keydown.space.prevent="openImage(image)"
            >
              <!-- Portrait Image Viewport (3:4 ratio) -->
              <div
                class="bg-muted/50 relative aspect-3/4 w-full overflow-hidden"
              >
                <img
                  :src="imageUrl(image, true)"
                  :alt="image.filename"
                  loading="lazy"
                  decoding="async"
                  class="h-full w-full object-cover"
                />

                <!-- Floating Subfolder Badge -->
                <div
                  v-if="image.subfolder"
                  class="absolute top-2 left-2 flex items-center gap-1 transition-opacity duration-200"
                >
                  <Badge
                    variant="secondary"
                    class="border-white/10 bg-black/60 font-mono text-xs font-medium text-white/90 shadow-sm backdrop-blur-md"
                  >
                    {{ image.subfolder }}
                  </Badge>
                </div>

                <!-- Floating Action Overlay on Hover with black-to-transparent gradient to top -->
                <div
                  class="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-linear-to-t from-black/90 via-black/50 to-transparent px-2.5 pt-6 pb-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                >
                  <Button
                    size="iconSm"
                    variant="secondary"
                    class="h-7 w-7 rounded-full border border-white/20 bg-black/70 text-white shadow-md transition-colors hover:bg-white/20 hover:text-white"
                    title="View Fullscreen & Metadata"
                    @click.stop="openImage(image)"
                  >
                    <ZoomIn class="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="iconSm"
                    variant="secondary"
                    class="h-7 w-7 rounded-full border border-white/20 bg-black/70 text-white shadow-md transition-colors hover:bg-white/20 hover:text-white"
                    title="Open in System Explorer"
                    @click.stop="openLocalPath(image.path)"
                  >
                    <FolderOpen class="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <!-- Card Footer Metadata -->
              <div class="flex flex-col justify-between p-2.5">
                <p
                  class="text-foreground truncate font-mono text-xs font-medium transition-colors"
                  :title="image.filename"
                >
                  {{ image.filename }}
                </p>
                <div
                  class="text-muted-foreground mt-1 flex items-center justify-between font-mono text-xs"
                >
                  <span class="truncate">{{
                    image.extension?.toUpperCase() || 'PNG'
                  }}</span>
                  <span class="shrink-0">{{
                    formatFileSize(image.fileSize)
                  }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- High-End Detail Lightbox & Generation Data Inspector Modal -->
      <Teleport to="body">
        <!-- Pure Fade Transition for Backdrop / Modal -->
        <Transition
          enter-active-class="transition-opacity duration-250 ease-out"
          enter-from-class="opacity-0"
          enter-to-class="opacity-100"
          leave-active-class="transition-opacity duration-200 ease-in"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <div
            v-if="selectedImage"
            class="fixed inset-0 z-100 flex overflow-hidden bg-black/70 backdrop-blur-md"
            @click.self="selectedImage = undefined"
          >
            <!-- Center Canvas Viewport -->
            <section
              class="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-transparent"
              @click="handleBackdropClick"
            >
              <!-- Top Canvas Header Overlay -->
              <div
                class="absolute top-0 right-0 left-0 z-20 flex items-center justify-between bg-linear-to-b from-black/80 via-black/40 to-transparent p-4"
                @click.stop
              >
                <div class="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    class="border-white/20 bg-black/50 font-mono text-xs text-white/90 backdrop-blur-md"
                  >
                    {{ selectedIndex + 1 }} / {{ filteredImages.length }}
                  </Badge>
                  <span
                    class="max-w-md truncate font-mono text-xs font-semibold text-white/90"
                    :title="selectedImage.filename"
                  >
                    {{ selectedImage.filename }}
                  </span>
                </div>

                <div class="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    class="border-white/10 bg-black/50 font-mono text-xs text-white/80 backdrop-blur-md"
                  >
                    Zoom: {{ Math.round(zoom * 100) }}%
                  </Badge>
                  <Button
                    size="iconSm"
                    variant="ghost"
                    class="h-8 w-8 text-white/80 hover:bg-white/10 hover:text-white"
                    title="Zoom Out (-)"
                    @click="
                      zoom = Math.max(1, Number((zoom - 0.25).toFixed(2)));
                      if (zoom === 1) {
                        panX = 0;
                        panY = 0;
                      }
                    "
                  >
                    <ZoomOut class="h-4 w-4" />
                  </Button>
                  <Button
                    size="iconSm"
                    variant="ghost"
                    class="h-8 w-8 text-white/80 hover:bg-white/10 hover:text-white"
                    title="Zoom In (+)"
                    @click="
                      zoom = Math.min(5, Number((zoom + 0.25).toFixed(2)))
                    "
                  >
                    <ZoomIn class="h-4 w-4" />
                  </Button>
                  <Button
                    v-if="zoom !== 1 || panX !== 0 || panY !== 0"
                    size="iconSm"
                    variant="ghost"
                    class="h-8 w-8 text-white/80 hover:bg-white/10 hover:text-white"
                    title="Reset Zoom & Pan (0)"
                    @click="resetPanAndZoom"
                  >
                    <RotateCcw class="h-3.5 w-3.5" />
                  </Button>

                  <Separator orientation="vertical" class="h-4 bg-white/20" />

                  <!-- Toggle Inspector Button -->
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button
                        size="iconSm"
                        variant="ghost"
                        class="h-8 w-8 text-white/80 hover:bg-white/10 hover:text-white"
                        @click="showInspector = !showInspector"
                      >
                        <PanelRightClose v-if="showInspector" class="h-4 w-4" />
                        <PanelRightOpen v-else class="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p class="text-xs">Toggle Generation Data (I)</p>
                    </TooltipContent>
                  </Tooltip>

                  <!-- Quick Transfer Dropdown (3-dots) -->
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <Button
                        size="iconSm"
                        variant="ghost"
                        class="h-8 w-8 text-white/80 hover:bg-white/10 hover:text-white"
                        title="Quick Transfer & Actions"
                      >
                        <MoreHorizontal class="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" class="w-52">
                      <DropdownMenuLabel
                        class="text-muted-foreground text-xs font-semibold"
                      >
                        Transfer Image
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        class="cursor-pointer gap-2 text-xs"
                        @click="handleSendToUpscaler"
                      >
                        <Scaling class="h-3.5 w-3.5 text-blue-400" />
                        <span>Send to Upscaler</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        class="cursor-pointer gap-2 text-xs"
                        @click="handleSendToRmbg"
                      >
                        <WandSparkles class="h-3.5 w-3.5 text-pink-400" />
                        <span>Send to RMBG</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        class="cursor-pointer gap-2 text-xs"
                        @click="handleSendToFaceDetailer"
                      >
                        <ScanFace class="h-3.5 w-3.5 text-emerald-400" />
                        <span>Send to Face Detailer</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator v-if="metadata" />
                      <DropdownMenuItem
                        v-if="metadata"
                        class="cursor-pointer gap-2 text-xs"
                        @click="sendAndGoToWorkflow"
                      >
                        <Sparkles class="text-primary h-3.5 w-3.5" />
                        <span>Reuse All Settings</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <!-- Close Lightbox Button -->
                  <Button
                    size="iconSm"
                    variant="ghost"
                    class="hover:bg-destructive/80 h-8 w-8 text-white/80 hover:text-white"
                    title="Close viewer (Esc)"
                    @click="selectedImage = undefined"
                  >
                    <X class="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <!-- Main Interactive Image Area -->
              <div
                class="relative flex flex-1 items-center justify-center overflow-hidden p-6"
                @wheel="handleZoom"
                @click="handleBackdropClick"
              >
                <!-- Previous Button -->
                <Button
                  size="icon"
                  variant="secondary"
                  :disabled="selectedIndex <= 0"
                  class="absolute left-4 z-20 h-10 w-10 rounded-full border border-white/20 bg-black/60 text-white shadow-xl backdrop-blur-md hover:bg-black/90 disabled:opacity-20"
                  title="Previous image (Left Arrow)"
                  @click.stop="navigateViewer(-1)"
                >
                  <ChevronLeft class="h-6 w-6" />
                </Button>

                <!-- Full Rendered Image with Pan/Drag & Zoom -->
                <img
                  :src="imageUrl(selectedImage, false)"
                  :alt="selectedImage.filename"
                  draggable="false"
                  class="max-h-full max-w-full rounded-lg object-contain shadow-2xl select-none"
                  :class="[
                    isPanning
                      ? 'cursor-grabbing duration-0'
                      : 'cursor-grab transition-transform duration-100 ease-out'
                  ]"
                  :style="{
                    transform: `translate3d(${panX}px, ${panY}px, 0px) scale(${zoom})`
                  }"
                  @pointerdown.stop="handlePointerDown"
                  @dblclick.stop="zoom === 1 ? (zoom = 2) : resetPanAndZoom()"
                />

                <!-- Next Button -->
                <Button
                  size="icon"
                  variant="secondary"
                  :disabled="selectedIndex >= filteredImages.length - 1"
                  class="absolute right-4 z-20 h-10 w-10 rounded-full border border-white/20 bg-black/60 text-white shadow-xl backdrop-blur-md hover:bg-black/90 disabled:opacity-20"
                  title="Next image (Right Arrow)"
                  @click.stop="navigateViewer(1)"
                >
                  <ChevronRight class="h-6 w-6" />
                </Button>
              </div>
            </section>

            <!-- Right Inspector Sidebar: Smooth Slide In / Slide Out Transition -->
            <Transition
              appear
              enter-active-class="transition-transform duration-300 ease-out"
              enter-from-class="translate-x-full"
              enter-to-class="translate-x-0"
              leave-active-class="transition-transform duration-200 ease-in"
              leave-from-class="translate-x-0"
              leave-to-class="translate-x-full"
            >
              <aside
                v-if="showInspector"
                class="border-border/80 bg-card/95 relative z-20 flex h-full w-105 max-w-[90vw] shrink-0 flex-col overflow-hidden border-l shadow-2xl backdrop-blur-xl"
                @click.stop
              >
                <!-- Inspector Header (shrink-0) -->
                <div
                  class="border-border/80 flex h-13 shrink-0 items-center justify-between border-b px-4"
                >
                  <div class="flex items-center gap-2.5">
                    <div
                      class="border-primary/30 bg-primary/10 text-primary flex h-7 w-7 items-center justify-center rounded-lg border"
                    >
                      <Info class="h-4 w-4" />
                    </div>
                    <div>
                      <h2
                        class="text-foreground text-xs font-bold tracking-wide uppercase"
                      >
                        Generation Data
                      </h2>
                      <p class="text-muted-foreground text-xs">
                        PNG embedded parameters
                      </p>
                    </div>
                  </div>

                  <div class="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Button
                          size="iconSm"
                          variant="ghost"
                          class="text-muted-foreground hover:text-foreground h-8 w-8"
                          @click="openLocalPath(selectedImage.path)"
                        >
                          <ExternalLink class="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p class="text-xs">Open image externally</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger as-child>
                        <Button
                          size="iconSm"
                          variant="ghost"
                          class="text-muted-foreground hover:text-destructive h-8 w-8"
                          @click="selectedImage = undefined"
                        >
                          <X class="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p class="text-xs">Close viewer (Esc)</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                <!-- Inspector Body (min-h-0 flex-1 with smooth scrolling) -->
                <ScrollArea class="min-h-0 flex-1 overflow-hidden">
                  <div
                    v-if="metadataLoading"
                    class="flex flex-col items-center justify-center gap-2 py-12 text-center"
                  >
                    <Loader2 class="text-primary h-6 w-6 animate-spin" />
                    <p class="text-muted-foreground font-mono text-xs">
                      Extracting ComfyUI workflow metadata...
                    </p>
                  </div>

                  <div v-else class="flex flex-col gap-4 p-4 select-text">
                    <!-- Quick Summary Cards -->
                    <div class="grid grid-cols-2 gap-2 text-xs">
                      <div
                        class="border-border/80 bg-secondary/50 flex flex-col justify-between rounded-lg border p-2.5 shadow-2xs"
                      >
                        <span class="text-muted-foreground block text-xs"
                          >Dimensions</span
                        >
                        <strong
                          class="text-foreground mt-0.5 font-mono text-xs"
                        >
                          {{ metadata?.width || '?' }} ×
                          {{ metadata?.height || '?' }}
                        </strong>
                      </div>
                      <div
                        class="border-border/80 bg-secondary/50 flex flex-col justify-between rounded-lg border p-2.5 shadow-2xs"
                      >
                        <span class="text-muted-foreground block text-xs"
                          >File Size</span
                        >
                        <strong
                          class="text-foreground mt-0.5 font-mono text-xs"
                        >
                          {{ formatFileSize(selectedImage.fileSize) }}
                        </strong>
                      </div>
                    </div>

                    <!-- Generation Key-Value Grid -->
                    <div
                      class="border-border/80 bg-secondary/30 rounded-xl border p-3 font-mono text-xs"
                    >
                      <dl class="grid grid-cols-[80px_1fr] gap-x-2 gap-y-2.5">
                        <dt class="text-muted-foreground">Model</dt>
                        <dd class="text-foreground font-semibold break-all">
                          {{ metadata?.model || '—' }}
                        </dd>

                        <dt class="text-muted-foreground">Sampler</dt>
                        <dd class="text-foreground font-medium">
                          {{ metadata?.sampler || '—' }}
                        </dd>

                        <dt class="text-muted-foreground">Scheduler</dt>
                        <dd class="text-foreground font-medium">
                          {{ metadata?.scheduler || '—' }}
                        </dd>

                        <dt class="text-muted-foreground">Seed</dt>
                        <dd
                          class="flex items-center justify-between gap-1 break-all"
                        >
                          <span class="text-foreground font-semibold">{{
                            metadata?.seed || '—'
                          }}</span>
                          <Button
                            v-if="metadata?.seed"
                            size="iconSm"
                            variant="ghost"
                            class="h-6 w-6 shrink-0"
                            title="Copy Seed"
                            @click="copyWithFeedback('seed', metadata.seed)"
                          >
                            <Check
                              v-if="copiedState.seed"
                              class="h-3 w-3 text-emerald-400"
                            />
                            <Copy v-else class="h-3 w-3" />
                          </Button>
                        </dd>

                        <dt class="text-muted-foreground">Steps / CFG</dt>
                        <dd class="text-foreground font-medium">
                          {{ metadata?.steps || '—' }} /
                          {{ metadata?.cfg || '—' }}
                        </dd>

                        <dt class="text-muted-foreground">Modified</dt>
                        <dd class="text-muted-foreground text-xs">
                          {{
                            new Date(selectedImage.modifiedMs).toLocaleString()
                          }}
                        </dd>
                      </dl>
                    </div>

                    <!-- Positive Prompt Section -->
                    <section class="border-border/80 rounded-xl border p-3">
                      <div class="mb-2 flex items-center justify-between">
                        <h3
                          class="text-foreground text-xs font-bold tracking-wider uppercase"
                        >
                          Positive Prompt
                        </h3>
                        <Button
                          v-if="metadata?.prompt"
                          size="sm"
                          variant="ghost"
                          class="text-muted-foreground hover:text-primary h-6 gap-1 px-2 text-xs"
                          @click="copyWithFeedback('prompt', metadata.prompt)"
                        >
                          <Check
                            v-if="copiedState.prompt"
                            class="h-3 w-3 text-emerald-400"
                          />
                          <Copy v-else class="h-3 w-3" />
                          <span>{{
                            copiedState.prompt ? 'Copied!' : 'Copy'
                          }}</span>
                        </Button>
                      </div>

                      <div
                        v-if="promptTags.length"
                        class="flex flex-wrap gap-1.5"
                      >
                        <span
                          v-for="tag in promptTags"
                          :key="tag"
                          class="border-border/80 bg-muted/60 text-foreground hover:border-primary/40 rounded-md border px-2 py-0.5 font-mono text-xs break-all transition-colors"
                        >
                          {{ tag }}
                        </span>
                      </div>
                      <p v-else class="text-muted-foreground text-xs italic">
                        No positive prompt metadata found.
                      </p>
                    </section>

                    <!-- Negative Prompt Section -->
                    <section
                      v-if="metadata?.negativePrompt"
                      class="border-border/80 rounded-xl border p-3"
                    >
                      <div class="mb-2 flex items-center justify-between">
                        <h3
                          class="text-foreground text-xs font-bold tracking-wider uppercase"
                        >
                          Negative Prompt
                        </h3>
                        <Button
                          size="sm"
                          variant="ghost"
                          class="text-muted-foreground hover:text-primary h-6 gap-1 px-2 text-xs"
                          @click="
                            copyWithFeedback(
                              'negPrompt',
                              metadata?.negativePrompt
                            )
                          "
                        >
                          <Check
                            v-if="copiedState.negPrompt"
                            class="h-3 w-3 text-emerald-400"
                          />
                          <Copy v-else class="h-3 w-3" />
                          <span>{{
                            copiedState.negPrompt ? 'Copied!' : 'Copy'
                          }}</span>
                        </Button>
                      </div>
                      <p
                        class="text-muted-foreground font-mono text-xs leading-relaxed whitespace-pre-wrap"
                      >
                        {{ metadata.negativePrompt }}
                      </p>
                    </section>

                    <!-- Raw Workflow JSON Section -->
                    <section
                      v-if="metadata?.rawPrompt || metadata?.rawWorkflow"
                      class="border-border/80 rounded-xl border p-3"
                    >
                      <div class="flex items-center justify-between">
                        <button
                          type="button"
                          class="text-primary text-xs font-semibold hover:underline"
                          @click="showRaw = !showRaw"
                        >
                          {{ showRaw ? 'Hide' : 'Show' }} Raw Workflow Graph
                        </button>
                        <Button
                          v-if="showRaw"
                          size="sm"
                          variant="ghost"
                          class="text-muted-foreground hover:text-primary h-6 gap-1 px-2 text-xs"
                          @click="
                            copyWithFeedback(
                              'workflow',
                              metadata?.rawWorkflow || metadata?.rawPrompt
                            )
                          "
                        >
                          <Check
                            v-if="copiedState.workflow"
                            class="h-3 w-3 text-emerald-400"
                          />
                          <Copy v-else class="h-3 w-3" />
                          <span>{{
                            copiedState.workflow ? 'Copied!' : 'Copy JSON'
                          }}</span>
                        </Button>
                      </div>
                      <pre
                        v-if="showRaw"
                        class="bg-background/90 border-border/80 mt-2 max-h-72 overflow-auto rounded-lg border p-2.5 font-mono text-xs break-all whitespace-pre-wrap text-zinc-300"
                        >{{ metadata.rawWorkflow || metadata.rawPrompt }}</pre>
                    </section>
                  </div>
                </ScrollArea>
              </aside>
            </Transition>
          </div>
        </Transition>
      </Teleport>
    </div>
  </TooltipProvider>
</template>
