<script setup lang="ts">
import BooruPostInspector from '@/components/booru/BooruPostInspector.vue';
import { ratingColorClass } from '@/utils/booruPresentation';
import BooruSearchInput from '@/components/booru/BooruSearchInput.vue';
import {
  computed,
  onActivated,
  onDeactivated,
  onMounted,
  onUnmounted,
  nextTick,
  ref,
  watch
} from 'vue';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useVirtualizer } from '@tanstack/vue-virtual';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Search,
  ShieldAlert,
  ShieldCheck,
  ZoomIn
} from '@lucide/vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import NoticeBanner from '@/components/layout/NoticeBanner.vue';
import PageLayout from '@/components/layout/PageLayout.vue';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu';
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
  fetchBooruSettings,
  fetchBooruSources,
  formatBooruWarnings,
  getBooruMediaUrl,
  normalizeBooruRatings,
  searchBooru,
  solveBooruCloudflare,
  type BooruPost,
  type BooruSettings,
  type BooruSource
} from '../services/booruGallery';
import { loadAppData, saveAppData } from '../services/appStorage';

interface BooruGalleryState {
  ratingsBySource?: Record<string, unknown>;
}

const detailDialog = ref<InstanceType<typeof BooruPostInspector>>();
function openDetail(post: BooruPost) {
  detailDialog.value?.open(post);
}

const sources = ref<BooruSource[]>([]);
const settings = ref<BooruSettings | null>(null);
const selectedSource = ref('');
const query = ref('');
const selectedSort = ref('latest');
const selectedRatings = ref<string[]>([]);
const posts = ref<BooruPost[]>([]);
const nextCursor = ref<string | null>(null);
const ended = ref(false);
const isLoading = ref(false);
const isSetupLoading = ref(false);
const errorMessage = ref('');
const warnings = ref<string[]>([]);
let ratingsBySource: Record<string, unknown> = {};

const scrollViewport = ref<HTMLElement | null>(null);
const gridWidth = ref(1200);
let resizeObserver: ResizeObserver | undefined;
let savedScrollTop = 0;

const loadedImages = ref<Set<string>>(new Set());
const isViewActive = ref(true);

// Virtualization geometry parameters
const GRID_GAP = 14;

const CARD_ASPECT_RATIO = 4 / 3;
const CARD_FOOTER_HEIGHT = 44;
const OVERSCAN_ROWS = 3;

const POPULAR_SUGGESTIONS = [
  '1girl, solo, masterpiece',
  'scenery, landscape, fantasy',
  'cyberpunk, city, neon',
  'cat_ears, cute, smile',
  'aesthetic, highres, vibrant'
];

const activeSource = computed(() =>
  sources.value.find((source) => source.source === selectedSource.value)
);
const visibleWarnings = computed(() => formatBooruWarnings(warnings.value));

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
const totalRows = computed(() => Math.ceil(posts.value.length / columns.value));

// TanStack Virtualizer for hardware-accelerated smooth scrolling
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

function ratingsForSource(source: string) {
  const available =
    sources.value.find((item) => item.source === source)?.ratings ?? [];
  const saved = ratingsBySource[source];
  return normalizeBooruRatings(
    available,
    Array.isArray(saved)
      ? saved.filter((rating): rating is string => typeof rating === 'string')
      : undefined
  );
}

function formatSortLabel(sort: string): string {
  if (!sort) return 'Sort';
  const s = sort.toLowerCase();
  switch (s) {
    case 'latest':
      return 'Latest';
    case 'new':
      return 'Newest';
    case 'score':
      return 'Score';
    case 'favcount':
    case 'favorites':
      return 'Favorites';
    case 'views':
      return 'Views';
    case 'random':
      return 'Random';
    case 'rank':
      return 'Rank';
    default:
      return sort.charAt(0).toUpperCase() + sort.slice(1);
  }
}

function isImageLoaded(key: string): boolean {
  return loadedImages.value.has(key);
}

function onImageLoad(key: string) {
  loadedImages.value.add(key);
}

function mediaUrl(post: BooruPost) {
  return getBooruMediaUrl(post.source, post.previewUrl || post.sampleUrl);
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function loadSources() {
  if (isSetupLoading.value) return;
  isSetupLoading.value = true;
  errorMessage.value = '';
  try {
    const [availableSources, remoteSettings, savedState] = await Promise.all([
      fetchBooruSources(),
      fetchBooruSettings(),
      loadAppData<BooruGalleryState>('booru_gallery_state').catch((error) => {
        console.error('Failed to load Booru gallery state:', error);
        return null;
      })
    ]);
    sources.value = availableSources;
    settings.value = remoteSettings;
    const storedRatings = savedState?.ratingsBySource;
    ratingsBySource =
      storedRatings &&
      typeof storedRatings === 'object' &&
      !Array.isArray(storedRatings)
        ? storedRatings
        : {};
    selectedSource.value = availableSources.some(
      (source) => source.source === remoteSettings.defaultSource
    )
      ? remoteSettings.defaultSource
      : availableSources[0]?.source || '';
    selectedSort.value =
      activeSource.value?.sortValues[0] ||
      (selectedSource.value === 'aitag' ? 'new' : 'latest');
    selectedRatings.value = ratingsForSource(selectedSource.value);
    if (selectedSource.value) await runSearch(true);
  } catch (error) {
    errorMessage.value = readableError(error);
  } finally {
    isSetupLoading.value = false;
  }
}

async function changeSource(source: string) {
  selectedSource.value = source;
  selectedSort.value = activeSource.value?.sortValues[0] || 'latest';
  selectedRatings.value = ratingsForSource(source);
  await runSearch(true);
}

function toggleRating(rating: string) {
  const nextRatings = selectedRatings.value.includes(rating)
    ? selectedRatings.value.filter((item) => item !== rating)
    : [...selectedRatings.value, rating];
  selectedRatings.value = normalizeBooruRatings(
    activeSource.value?.ratings ?? [],
    nextRatings
  );
  ratingsBySource[selectedSource.value] = selectedRatings.value;
  void saveAppData('booru_gallery_state', { ratingsBySource }).catch((error) =>
    console.error('Failed to save Booru gallery state:', error)
  );
}

const isCloudflareBlocked = computed(
  () =>
    selectedSource.value === 'konachan.com' &&
    (errorMessage.value.toLowerCase().includes('cloudflare') ||
      errorMessage.value.includes('403'))
);

const isSolvingCloudflare = ref(false);

async function handleSolveCloudflare() {
  if (isSolvingCloudflare.value) return;
  isSolvingCloudflare.value = true;
  try {
    await solveBooruCloudflare('konachan.com');
    errorMessage.value = '';
    if (posts.value.length > 0) {
      await runSearch(false);
    } else {
      await runSearch(true);
    }
  } catch (error) {
    errorMessage.value = readableError(error);
  } finally {
    isSolvingCloudflare.value = false;
  }
}

async function retryPagination() {
  errorMessage.value = '';
  await runSearch(false);
}

async function runSearch(reset = false) {
  if (!selectedSource.value || isLoading.value) return;
  isLoading.value = true;
  errorMessage.value = '';
  if (reset) {
    posts.value = [];
    nextCursor.value = null;
    ended.value = false;
    loadedImages.value.clear();
    savedScrollTop = 0;
    scrollViewport.value?.scrollTo({ top: 0 });
  }
  try {
    const page = await searchBooru({
      source: selectedSource.value,
      query: query.value.trim(),
      ratings: selectedRatings.value,
      sort: selectedSort.value,
      cursor: reset ? null : nextCursor.value
    });
    const seen = new Set(
      posts.value.map((post) => `${post.source}:${post.postId}`)
    );
    posts.value = [
      ...posts.value,
      ...page.posts.filter((post) => !seen.has(`${post.source}:${post.postId}`))
    ];
    nextCursor.value = page.nextCursor;
    ended.value = page.ended || !page.nextCursor;
    warnings.value = page.warnings;
  } catch (error) {
    errorMessage.value = readableError(error);
  } finally {
    isLoading.value = false;
  }
}

// Auto-fetch when user scrolls near the bottom (Infinite Scroll)
function handleScroll(e: Event) {
  const target = e.target as HTMLElement;
  if (!target) return;
  savedScrollTop = target.scrollTop;
  if (
    isLoading.value ||
    ended.value ||
    Boolean(errorMessage.value) ||
    posts.value.length === 0
  )
    return;
  const bottomThreshold = 600;
  if (
    target.scrollHeight - target.scrollTop - target.clientHeight <
    bottomThreshold
  ) {
    void runSearch(false);
  }
}

// Watch virtual rows to trigger pre-fetch when approaching list end
watch(virtualRows, (rows) => {
  if (
    !isViewActive.value ||
    rows.length === 0 ||
    isLoading.value ||
    ended.value ||
    Boolean(errorMessage.value) ||
    posts.value.length === 0
  )
    return;
  const lastRow = rows.at(-1);
  if (lastRow && lastRow.index >= totalRows.value - 2) {
    void runSearch(false);
  }
});

function applySuggestion(suggestedQuery: string) {
  query.value = suggestedQuery;
}

function copyPostUrl(url: string) {
  void navigator.clipboard.writeText(url);
}

async function activateView() {
  isViewActive.value = true;
  if (scrollViewport.value) resizeObserver?.observe(scrollViewport.value);
  if (sources.value.length === 0) {
    void loadSources();
  }
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
}

onMounted(() => {
  if (scrollViewport.value) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          // 20px padding left + right
          gridWidth.value = entry.contentRect.width - 40;
        }
      }
    });
    activateView();
  }
  void loadSources();
});

onActivated(activateView);
onDeactivated(deactivateView);
onUnmounted(deactivateView);
</script>

<template>
  <PageLayout
    title="Booru Gallery"
    subtitle="Explore Danbooru, Gelbooru, Safebooru, and AI TAG inspirations"
    content-class="flex flex-col overflow-hidden p-0"
  >
    <template #icon>
      <ImageIcon class="h-4 w-4" />
    </template>

    <template #below-header>
      <div
        class="border-border/80 bg-card/70 relative z-20 flex shrink-0 flex-col gap-3 border-b px-5 py-3.5 backdrop-blur-md"
      >
        <!-- Search Controls Bar -->
        <form
          class="flex flex-wrap items-center gap-2.5"
          @submit.prevent="runSearch(true)"
        >
          <!-- Source Selector -->
          <Select
            :model-value="selectedSource"
            :disabled="!sources.length || isLoading"
            @update:model-value="changeSource(String($event))"
          >
            <SelectTrigger class="bg-secondary/80 h-9 w-38 text-xs font-medium">
              <SelectValue placeholder="Source">
                {{ activeSource?.displayName || 'Source' }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup class="max-h-40 overflow-y-auto">
                <SelectItem
                  v-for="source in sources"
                  :key="source.source"
                  :value="source.source"
                >
                  {{ source.displayName }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <!-- Search Input with Enhanced Autocomplete Dropdown -->
          <BooruSearchInput v-model="query" :disabled="!sources.length" />
          <!-- Sort Selector -->
          <Select v-model="selectedSort" :disabled="!activeSource || isLoading">
            <SelectTrigger class="bg-secondary/80 h-9 w-34 text-xs font-medium">
              <SelectValue placeholder="Sort">
                {{ formatSortLabel(selectedSort) }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup class="max-h-40 overflow-y-auto">
                <SelectItem
                  v-for="sort in activeSource?.sortValues || []"
                  :key="sort"
                  :value="sort"
                >
                  {{ formatSortLabel(sort) }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <!-- Search Submit Button -->
          <Button
            type="submit"
            size="sm"
            class="bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 text-xs font-semibold shadow-xs"
            :disabled="!sources.length || isLoading"
          >
            <Loader2
              v-if="isLoading && posts.length === 0"
              class="h-3.5 w-3.5 animate-spin"
            />
            <Search v-else class="h-3.5 w-3.5" />
            <span>Search</span>
          </Button>
        </form>

        <!-- Rating Filters -->
        <div
          v-if="activeSource?.ratings.length"
          class="flex flex-wrap items-center gap-2"
        >
          <span class="text-muted-foreground text-xs font-medium">
            Ratings:
          </span>
          <button
            v-for="rating in activeSource.ratings"
            :key="rating"
            type="button"
            class="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-medium capitalize transition-all"
            :class="
              selectedRatings.includes(rating)
                ? ratingColorClass(rating)
                : 'border-border/80 bg-secondary/40 text-muted-foreground hover:text-foreground'
            "
            :aria-pressed="selectedRatings.includes(rating)"
            @click="toggleRating(rating)"
          >
            <span
              class="h-1.5 w-1.5 rounded-full"
              :class="
                selectedRatings.includes(rating)
                  ? 'bg-current shadow-xs'
                  : 'bg-muted-foreground'
              "
            />
            <span>{{ rating }}</span>
          </button>
        </div>
      </div>
    </template>

    <!-- Main Content Area (Virtualized Scroll Container) -->
    <main
      ref="scrollViewport"
      class="flex-1 overflow-y-auto p-5"
      @scroll.passive="handleScroll"
    >
      <!-- Cloudflare Challenge Error State -->
      <div
        v-if="isCloudflareBlocked && !posts.length"
        class="mx-auto mt-12 max-w-lg rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-xs leading-relaxed text-amber-200 shadow-sm"
      >
        <div class="flex items-start gap-3">
          <ShieldAlert class="h-5 w-5 shrink-0 text-amber-400" />
          <div class="space-y-2">
            <span class="block text-sm font-semibold text-amber-300"
              >Cloudflare Verification Required</span
            >
            <p class="text-muted-foreground leading-normal">
              konachan.com requires Cloudflare verification. Click the button
              below to solve the verification check first.
            </p>
            <div class="pt-1">
              <Button
                size="sm"
                class="cursor-pointer bg-amber-600 font-medium text-white shadow-xs hover:bg-amber-500"
                @click="handleSolveCloudflare"
                :disabled="isSolvingCloudflare"
              >
                <Loader2
                  v-if="isSolvingCloudflare"
                  class="mr-1.5 h-3.5 w-3.5 animate-spin"
                />
                <ShieldCheck v-else class="mr-1.5 h-3.5 w-3.5" />
                {{
                  isSolvingCloudflare
                    ? 'Verifying in window...'
                    : 'Solve Cloudflare Challenge'
                }}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- Generic Error State -->
      <div
        v-else-if="errorMessage && !posts.length"
        class="border-destructive/30 bg-destructive/10 text-destructive mx-auto mt-12 max-w-lg rounded-xl border p-5 text-xs leading-relaxed shadow-sm"
      >
        <div class="flex items-start gap-3">
          <AlertCircle class="h-5 w-5 shrink-0" />
          <div class="space-y-1">
            <span class="font-semibold">Unable to fetch posts</span>
            <p>{{ errorMessage }}</p>
          </div>
        </div>
      </div>

      <!-- Full-Page Skeleton Loader on Initial Search -->
      <div
        v-else-if="(isSetupLoading || isLoading) && !posts.length"
        class="grid gap-3.5"
        :style="{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
        }"
      >
        <div
          v-for="i in columns * 3"
          :key="i"
          class="border-border/70 bg-card/60 flex flex-col overflow-hidden rounded-xl border"
        >
          <div
            class="bg-muted/40 relative flex aspect-3/4 w-full animate-pulse items-center justify-center overflow-hidden"
          >
            <ImageIcon class="text-muted-foreground/20 h-8 w-8" />
          </div>
          <div class="flex items-center justify-between p-2.5">
            <Skeleton class="h-3 w-16" />
            <Skeleton class="h-3 w-8" />
          </div>
        </div>
      </div>

      <!-- Loaded Virtualized Gallery Results -->
      <template v-else>
        <!-- Warnings / Soft Errors -->
        <NoticeBanner v-if="visibleWarnings.length" class="mb-4">
          {{ visibleWarnings.join(' ') }}
        </NoticeBanner>

        <!-- Cloudflare Challenge Banner during pagination -->
        <div
          v-if="isCloudflareBlocked"
          class="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200"
        >
          <div class="flex items-center gap-2">
            <ShieldAlert class="h-4 w-4 shrink-0 text-amber-400" />
            <span
              >Cloudflare verification required for konachan.com. Please
              re-verify to fetch more posts.</span
            >
          </div>
          <Button
            size="sm"
            class="h-7 cursor-pointer bg-amber-600 px-3 text-xs text-white hover:bg-amber-500"
            @click="handleSolveCloudflare"
            :disabled="isSolvingCloudflare"
          >
            <Loader2
              v-if="isSolvingCloudflare"
              class="mr-1.5 h-3 w-3 animate-spin"
            />
            <ShieldCheck v-else class="mr-1.5 h-3 w-3" />
            {{ isSolvingCloudflare ? 'Verifying...' : 'Solve Challenge' }}
          </Button>
        </div>

        <NoticeBanner v-else-if="errorMessage" tone="destructive" class="mb-4">
          {{ errorMessage }}
        </NoticeBanner>

        <!-- TanStack Virtualized Responsive Grid -->
        <div
          v-if="posts.length"
          class="relative w-full"
          :style="{ height: `${totalVirtualHeight}px` }"
        >
          <div
            v-for="virtualRow in virtualRows"
            :key="virtualRow.index"
            class="absolute top-0 left-0 grid w-full gap-3.5"
            :style="{
              height: `${virtualRow.size - GRID_GAP}px`,
              transform: `translateY(${virtualRow.start}px)`,
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
            }"
          >
            <!-- Card Item -->
            <ContextMenu
              v-for="post in posts.slice(
                virtualRow.index * columns,
                (virtualRow.index + 1) * columns
              )"
              :key="`${post.source}:${post.postId}`"
            >
              <ContextMenuTrigger as-child>
                <div
                  role="button"
                  tabindex="0"
                  class="group border-border/70 bg-card/60 hover:bg-card/90 hover:border-border relative flex cursor-pointer flex-col overflow-hidden rounded-xl border text-left transition-colors duration-200 [content-visibility:auto]"
                  @click="openDetail(post)"
                  @keydown.enter="openDetail(post)"
                  @keydown.space.prevent="openDetail(post)"
                >
                  <!-- Card Image Viewport with Skeleton Preloader -->
                  <div
                    class="bg-muted/40 relative aspect-3/4 w-full overflow-hidden"
                  >
                    <!-- Skeleton placeholder displayed until image is fully loaded -->
                    <div
                      v-if="!isImageLoaded(`${post.source}:${post.postId}`)"
                      class="bg-muted/50 absolute inset-0 flex animate-pulse items-center justify-center"
                    >
                      <ImageIcon class="text-muted-foreground/30 h-7 w-7" />
                    </div>

                    <!-- High-Performance Lazy Decoded Image -->
                    <img
                      :src="mediaUrl(post)"
                      :alt="`${post.source} post ${post.postId}`"
                      loading="lazy"
                      decoding="async"
                      class="h-full w-full object-cover transition-opacity duration-300"
                      :class="
                        isImageLoaded(`${post.source}:${post.postId}`)
                          ? 'opacity-100'
                          : 'opacity-0'
                      "
                      @load="onImageLoad(`${post.source}:${post.postId}`)"
                    />

                    <!-- Floating Source Badge (Top Left) -->
                    <div
                      v-if="post.source"
                      class="absolute top-2 left-2 z-10 flex items-center gap-1 transition-opacity duration-200"
                    >
                      <Badge
                        variant="secondary"
                        class="border-white/10 bg-black/60 font-mono text-[10px] font-medium text-white/90 capitalize shadow-sm backdrop-blur-md"
                      >
                        {{ post.source }}
                      </Badge>
                    </div>

                    <!-- Floating Rating Badge (Top Right) -->
                    <div class="absolute top-2 right-2 z-10">
                      <Badge
                        variant="outline"
                        :class="ratingColorClass(post.rating)"
                        class="px-1.5 py-0 text-[10px] font-bold tracking-wider uppercase backdrop-blur-md"
                      >
                        {{ post.rating || 'G' }}
                      </Badge>
                    </div>

                    <!-- Floating Action Overlay on Hover with black-to-transparent gradient to top -->
                    <div
                      class="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-1.5 bg-linear-to-t from-black/90 via-black/50 to-transparent px-2.5 pt-6 pb-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    >
                      <Button
                        size="iconSm"
                        variant="secondary"
                        class="h-7 w-7 rounded-full border border-white/20 bg-black/70 text-white shadow-md transition-colors hover:bg-white/20 hover:text-white"
                        title="View Post Details & Tags"
                        @click.stop="openDetail(post)"
                      >
                        <ZoomIn class="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="iconSm"
                        variant="secondary"
                        class="h-7 w-7 rounded-full border border-white/20 bg-black/70 text-white shadow-md transition-colors hover:bg-white/20 hover:text-white"
                        title="Open in Source Provider"
                        @click.stop="openUrl(post.postUrl)"
                      >
                        <ExternalLink class="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <!-- Card Footer Metadata -->
                  <div class="flex flex-col justify-between p-2.5">
                    <p
                      class="text-foreground truncate font-mono text-xs font-medium transition-colors"
                      :title="`Post #${post.postId}`"
                    >
                      #{{ post.postId }}
                    </p>
                    <div
                      class="text-muted-foreground mt-1 flex items-center justify-between font-mono text-xs"
                    >
                      <span class="truncate capitalize">{{ post.source }}</span>
                      <span
                        v-if="post.width && post.height"
                        class="shrink-0 font-mono text-[10px]"
                      >
                        {{ post.width }}×{{ post.height }}
                      </span>
                      <span
                        v-else
                        class="shrink-0 font-mono text-[10px] capitalize"
                      >
                        {{ post.rating || 'G' }}
                      </span>
                    </div>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent class="w-48">
                <ContextMenuItem @select="openDetail(post)">
                  <ZoomIn /> View Details & Tags
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem @select="openUrl(post.postUrl)">
                  <ExternalLink /> Open Source Post
                </ContextMenuItem>
                <ContextMenuItem @select="copyPostUrl(post.postUrl)">
                  <Copy /> Copy Post URL
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>
        </div>

        <!-- Empty Results View with Clickable Suggestions -->
        <div
          v-if="!posts.length && !isLoading"
          class="mx-auto my-16 max-w-md text-center"
        >
          <div
            class="border-border bg-secondary text-muted-foreground mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border shadow-xs"
          >
            <Search class="h-5 w-5" />
          </div>
          <h3 class="text-foreground text-sm font-semibold">No posts found</h3>
          <p class="text-muted-foreground mt-1 text-xs">
            Try adjusting your search tags, rating filters, or try a suggested
            query:
          </p>

          <div class="mt-4 flex flex-wrap justify-center gap-1.5">
            <button
              v-for="suggestion in POPULAR_SUGGESTIONS"
              :key="suggestion"
              type="button"
              class="border-border bg-secondary/60 text-muted-foreground hover:text-foreground hover:border-primary/40 cursor-pointer rounded-lg border px-2.5 py-1 font-mono text-xs transition-colors"
              @click="applySuggestion(suggestion)"
            >
              {{ suggestion }}
            </button>
          </div>
        </div>

        <!-- Bottom Infinite Scroll Loading Indicator & End Notice -->
        <div class="flex flex-col items-center justify-center gap-3 py-6">
          <!-- Cloudflare Challenge Banner during pagination -->
          <div
            v-if="isCloudflareBlocked && posts.length"
            class="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 shadow-xs"
          >
            <div class="flex items-center gap-2">
              <ShieldAlert class="h-4 w-4 shrink-0 text-amber-400" />
              <span>Cloudflare verification required to load more posts.</span>
            </div>
            <Button
              size="sm"
              class="h-7 cursor-pointer bg-amber-600 px-3 text-xs text-white hover:bg-amber-500"
              @click="handleSolveCloudflare"
              :disabled="isSolvingCloudflare"
            >
              <Loader2
                v-if="isSolvingCloudflare"
                class="mr-1.5 h-3 w-3 animate-spin"
              />
              <ShieldCheck v-else class="mr-1.5 h-3 w-3" />
              {{ isSolvingCloudflare ? 'Verifying...' : 'Solve Challenge' }}
            </Button>
          </div>

          <!-- Generic Pagination Error Banner -->
          <div
            v-else-if="errorMessage && posts.length"
            class="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive"
          >
            <AlertCircle class="h-4 w-4 shrink-0" />
            <span>{{ errorMessage }}</span>
            <Button
              size="sm"
              variant="outline"
              class="h-7 text-xs"
              @click="retryPagination"
            >
              Retry
            </Button>
          </div>

          <div
            v-else-if="isLoading && posts.length"
            class="border-border/80 bg-card/80 text-muted-foreground flex items-center gap-2.5 rounded-full border px-4 py-2 text-xs font-medium shadow-sm backdrop-blur-md"
          >
            <Loader2 class="text-primary h-4 w-4 animate-spin" />
            <span>Fetching more inspirations…</span>
          </div>
          <div
            v-else-if="ended && posts.length"
            class="text-muted-foreground flex items-center gap-1.5 font-mono text-xs"
          >
            <Check class="h-3.5 w-3.5 text-emerald-400" />
            <span>Reached end of gallery results</span>
          </div>
          <Button
            v-else-if="!ended && posts.length"
            variant="outline"
            size="sm"
            class="border-border bg-secondary text-foreground hover:bg-accent px-5 text-xs font-semibold shadow-xs"
            @click="runSearch(false)"
          >
            <ChevronDown class="h-4 w-4" />
            <span>Load More Results</span>
          </Button>
        </div>
      </template>
    </main>
  </PageLayout>

  <!-- Post Detail Dialog Modal -->
  <BooruPostInspector ref="detailDialog" :settings="settings" />
</template>
