<script setup lang="ts">
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
  RefreshCw,
  RotateCw,
  Search,
  Sparkles,
  Tag,
  WifiOff,
  X,
  ZoomIn
} from '@lucide/vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
  buildBooruPrompt,
  fetchBooruDetail,
  fetchBooruSettings,
  fetchBooruSources,
  formatBooruWarnings,
  getBooruMediaUrl,
  searchBooru,
  type BooruPost,
  type BooruPostDetail,
  type BooruSettings,
  type BooruSource
} from '../services/booruGallery';
import { ComfyApi } from '../services/comfyApi';
import { useComfyStore } from '../stores/comfyStore';
import { useLauncherStore } from '../stores/launcherStore';
import { usePromptSuggestionStore } from '../stores/promptSuggestionStore';

const comfyStore = useComfyStore();
const launcherStore = useLauncherStore();
const promptSuggestionStore = usePromptSuggestionStore();

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
const detail = ref<BooruPostDetail | null>(null);
const detailActivePost = ref<BooruPost | null>(null);
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref('');
const detailFallbackAttempted = ref(false);
const detailImageLoaded = ref(false);
const detailImageError = ref(false);
const copiedPrompt = ref(false);
const copiedTag = ref<string | null>(null);

const scrollViewport = ref<HTMLElement | null>(null);
const gridWidth = ref(1200);
let resizeObserver: ResizeObserver | undefined;
let savedScrollTop = 0;

const loadedImages = ref<Set<string>>(new Set());
const isViewActive = ref(true);

interface BooruTokenRange {
  start: number;
  end: number;
  query: string;
  hasCommaPrefix: boolean;
}

interface BooruSuggestionItem {
  label: string;
  insertText: string;
  category: number | string;
  categoryName: string;
  categoryClass: string;
  postCount?: number;
}

// Autocomplete State
const searchInputRef = ref<{ $el?: HTMLInputElement } | HTMLInputElement>();
const autocompleteSuggestions = ref<BooruSuggestionItem[]>([]);
const activeAutocompleteIndex = ref(0);
const isAutocompleteOpen = ref(false);
const activeQueryToken = ref('');
let activeTokenRange: BooruTokenRange | null = null;
let autocompleteTimer: ReturnType<typeof setTimeout> | undefined;
let autocompleteController: AbortController | undefined;
const activeItemRef = ref<HTMLElement | null>(null);

const categoryMetaMap: Record<
  number | string,
  { name: string; class: string }
> = {
  0: {
    name: 'General',
    class: 'border-blue-500/30 bg-blue-500/10 text-blue-300'
  },
  1: {
    name: 'Artist',
    class: 'border-purple-500/30 bg-purple-500/10 text-purple-300'
  },
  3: {
    name: 'Copyright',
    class: 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  },
  4: {
    name: 'Character',
    class: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  },
  5: {
    name: 'Meta',
    class: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300'
  },
  quality: {
    name: 'Style',
    class: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
  },
  count: {
    name: 'Count',
    class: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300'
  }
};

function formatPostCount(count?: number) {
  if (count === undefined || count === null) return '';
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/u, '')}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/u, '')}k`;
  }
  return String(count);
}

function getBooruTokenRange(
  text: string,
  cursor: number
): BooruTokenRange | null {
  if (cursor < 0 || cursor > text.length) return null;

  let start = cursor;
  while (start > 0 && ![',', ' ', '\t', '\n'].includes(text[start - 1])) {
    start--;
  }

  let end = cursor;
  while (end < text.length && ![',', ' ', '\t', '\n'].includes(text[end])) {
    end++;
  }

  const rawQuery = text
    .slice(start, cursor)
    .trim()
    .toLowerCase()
    .replaceAll(' ', '_');
  if (!rawQuery) return null;

  const beforeStart = text.slice(0, start).trimEnd();
  const hasCommaPrefix = beforeStart.endsWith(',');

  return { start, end, query: rawQuery, hasCommaPrefix };
}

function replaceBooruToken(
  text: string,
  range: BooruTokenRange,
  tag: string
): { text: string; cursor: number } {
  const prefix = text.slice(0, range.start);
  const suffix = text.slice(range.end).replace(/^[\s,]+/u, '');

  const usesCommas =
    range.hasCommaPrefix || prefix.includes(',') || suffix.includes(',');
  const separator = usesCommas ? ', ' : ' ';

  // Booru tags strictly require underscores for spaces regardless of app-wide settings
  const inserted = tag.trim().replaceAll(' ', '_');
  const newText = prefix + inserted + (suffix ? separator + suffix : separator);
  const newCursor = prefix.length + inserted.length + separator.length;

  return { text: newText, cursor: newCursor };
}

function highlightMatch(
  label: string,
  queryToken: string
): Array<{ text: string; isMatch: boolean }> {
  if (!queryToken) return [{ text: label, isMatch: false }];
  const q = queryToken.replaceAll('_', ' ').toLowerCase();
  const l = label.replaceAll('_', ' ');
  const lowerL = l.toLowerCase();
  const idx = lowerL.indexOf(q);
  if (idx === -1) {
    const qUnderscore = queryToken.replaceAll(' ', '_').toLowerCase();
    const lUnderscore = label.replaceAll(' ', '_');
    const idxU = lUnderscore.toLowerCase().indexOf(qUnderscore);
    if (idxU === -1) return [{ text: label, isMatch: false }];
    return [
      { text: label.slice(0, idxU), isMatch: false },
      { text: label.slice(idxU, idxU + qUnderscore.length), isMatch: true },
      { text: label.slice(idxU + qUnderscore.length), isMatch: false }
    ].filter((p) => p.text.length > 0);
  }
  return [
    { text: label.slice(0, idx), isMatch: false },
    { text: label.slice(idx, idx + q.length), isMatch: true },
    { text: label.slice(idx + q.length), isMatch: false }
  ].filter((p) => p.text.length > 0);
}

async function searchAutocompleteSuggestions(
  searchQuery: string,
  signal?: AbortSignal
): Promise<BooruSuggestionItem[]> {
  const normalized = searchQuery.trim().toLowerCase().replaceAll(' ', '_');
  if (!normalized) return [];

  const results: BooruSuggestionItem[] = [];
  const seenLabels = new Set<string>();

  // 1. Try remote ComfyUI yet_essential tag autocomplete endpoint if connected
  if (comfyStore.isConnected) {
    try {
      const remoteItems = await ComfyApi.searchTags(
        launcherStore.config.serverUrl,
        normalized,
        30,
        'tag',
        signal
      );
      for (const item of remoteItems) {
        // Enforce underscores for booru search tags regardless of settings
        const formattedTag = (item.insert_text || item.label)
          .trim()
          .replaceAll(' ', '_');
        const key = formattedTag.toLowerCase();
        if (!seenLabels.has(key)) {
          seenLabels.add(key);
          const category = Number(item.category);
          const catInfo = categoryMetaMap[category] ?? {
            name: 'General',
            class: 'border-blue-500/30 bg-blue-500/10 text-blue-300'
          };
          results.push({
            label: formattedTag,
            insertText: formattedTag,
            category,
            categoryName: catInfo.name,
            categoryClass: catInfo.class,
            postCount: item.total_post
          });
        }
      }
    } catch {
      // ignore aborts
    }
  }

  // 2. Supplement from local Prompt Suggestion Store
  const localCats = promptSuggestionStore.categories;
  for (const cat of localCats) {
    for (const tag of cat.tags || []) {
      // Enforce underscores for booru search tags regardless of settings
      const tagWithUnderscores = tag.trim().replaceAll(' ', '_');
      const tagNormalized = tagWithUnderscores.toLowerCase();
      if (seenLabels.has(tagNormalized)) continue;

      if (tagNormalized.includes(normalized)) {
        seenLabels.add(tagNormalized);
        const catInfo = categoryMetaMap[cat.id] ?? {
          name: cat.name.split(' ')[0] || 'Tag',
          class: 'border-blue-500/30 bg-blue-500/10 text-blue-300'
        };
        results.push({
          label: tagWithUnderscores,
          insertText: tagWithUnderscores,
          category: cat.id,
          categoryName: catInfo.name,
          categoryClass: catInfo.class
        });
      }
    }
  }

  // Ranking: exact prefix match first, then by post count
  results.sort((a, b) => {
    const aKey = a.insertText.toLowerCase();
    const bKey = b.insertText.toLowerCase();
    const aStarts = aKey.startsWith(normalized);
    const bStarts = bKey.startsWith(normalized);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    if (a.postCount !== undefined && b.postCount !== undefined) {
      return b.postCount - a.postCount;
    }
    if (a.postCount !== undefined) return -1;
    if (b.postCount !== undefined) return 1;
    return aKey.localeCompare(bKey);
  });

  return results.slice(0, 25);
}

function getSearchInputEl(): HTMLInputElement | null {
  if (!searchInputRef.value) return null;
  return (
    (searchInputRef.value as { $el?: HTMLInputElement }).$el ??
    (searchInputRef.value as HTMLInputElement)
  );
}

function closeAutocomplete() {
  isAutocompleteOpen.value = false;
  autocompleteSuggestions.value = [];
  activeQueryToken.value = '';
  activeTokenRange = null;
}

function handleSearchBlur() {
  setTimeout(() => {
    closeAutocomplete();
  }, 160);
}

function updateSearchCursor(event: Event) {
  const el = event.target as HTMLInputElement;
  if (!el) return;
  scheduleAutocomplete(el.value, el.selectionStart ?? el.value.length);
}

function handleSearchInput(event: Event) {
  const el = event.target as HTMLInputElement;
  if (!el) return;
  scheduleAutocomplete(el.value, el.selectionStart ?? el.value.length);
}

function scheduleAutocomplete(text: string, cursor: number) {
  clearTimeout(autocompleteTimer);
  autocompleteController?.abort();

  const range = getBooruTokenRange(text, cursor);
  if (!range || !range.query) {
    closeAutocomplete();
    return;
  }

  activeTokenRange = range;
  activeQueryToken.value = range.query;

  autocompleteTimer = setTimeout(async () => {
    autocompleteController = new AbortController();
    try {
      const items = await searchAutocompleteSuggestions(
        range.query,
        autocompleteController.signal
      );
      if (items.length > 0) {
        autocompleteSuggestions.value = items;
        activeAutocompleteIndex.value = 0;
        isAutocompleteOpen.value = true;
      } else {
        closeAutocomplete();
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        closeAutocomplete();
      }
    }
  }, 120);
}

function handleSearchKeydown(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (!isAutocompleteOpen.value || autocompleteSuggestions.value.length === 0)
    return;

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const dir = event.key === 'ArrowDown' ? 1 : -1;
    activeAutocompleteIndex.value =
      (activeAutocompleteIndex.value +
        dir +
        autocompleteSuggestions.value.length) %
      autocompleteSuggestions.value.length;
    void nextTick(() => {
      activeItemRef.value?.scrollIntoView({ block: 'nearest' });
    });
  } else if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault();
    const item = autocompleteSuggestions.value[activeAutocompleteIndex.value];
    if (item) {
      selectSuggestion(item);
    }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    closeAutocomplete();
  }
}

function selectSuggestion(item: BooruSuggestionItem) {
  if (!activeTokenRange) return;
  const inputEl = getSearchInputEl();
  const result = replaceBooruToken(
    query.value,
    activeTokenRange,
    item.insertText
  );
  query.value = result.text;
  closeAutocomplete();
  void nextTick(() => {
    if (inputEl) {
      inputEl.focus();
      inputEl.setSelectionRange(result.cursor, result.cursor);
    }
  });
}

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
const prompt = computed(() => {
  if (!detail.value) return '';
  return buildBooruPrompt(
    detail.value.tags,
    settings.value?.promptDefaults ?? {
      categories: ['copyright', 'character', 'general'],
      replaceUnderscores: false,
      escapeParentheses: false
    },
    settings.value?.outputFilterTags
  );
});

const tagCountTotal = computed(() => {
  if (!detail.value?.tags) return 0;
  return Object.values(detail.value.tags).reduce(
    (acc, list) => acc + list.length,
    0
  );
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

function defaultRatings(source: string) {
  if (source === 'aitag') return [];
  return source === 'safebooru' ? ['safe'] : ['general'];
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
  return getBooruMediaUrl(
    launcherStore.config.serverUrl,
    post.source,
    post.previewUrl || post.sampleUrl
  );
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function loadSources() {
  if (!comfyStore.isConnected || isSetupLoading.value) return;
  isSetupLoading.value = true;
  errorMessage.value = '';
  try {
    const [availableSources, remoteSettings] = await Promise.all([
      fetchBooruSources(launcherStore.config.serverUrl),
      fetchBooruSettings(launcherStore.config.serverUrl)
    ]);
    sources.value = availableSources;
    settings.value = remoteSettings;
    selectedSource.value = availableSources.some(
      (source) => source.source === remoteSettings.defaultSource
    )
      ? remoteSettings.defaultSource
      : availableSources[0]?.source || '';
    selectedSort.value =
      activeSource.value?.sortValues[0] ||
      (selectedSource.value === 'aitag' ? 'new' : 'latest');
    selectedRatings.value = defaultRatings(selectedSource.value);
    if (selectedSource.value) await runSearch(true);
  } catch (error) {
    errorMessage.value = `${readableError(error)}. Make sure comfyui-aaalice-nodes is installed in custom_nodes.`;
  } finally {
    isSetupLoading.value = false;
  }
}

async function changeSource(source: string) {
  selectedSource.value = source;
  selectedSort.value = activeSource.value?.sortValues[0] || 'latest';
  selectedRatings.value = defaultRatings(source);
  await runSearch(true);
}

function toggleRating(rating: string) {
  selectedRatings.value = selectedRatings.value.includes(rating)
    ? selectedRatings.value.filter((item) => item !== rating)
    : [...selectedRatings.value, rating];
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
    const page = await searchBooru(launcherStore.config.serverUrl, {
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
  if (isLoading.value || ended.value || posts.value.length === 0) return;
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
  closeAutocomplete();
  void runSearch(true);
}

function clearQuery() {
  query.value = '';
  closeAutocomplete();
  void runSearch(true);
}

const detailActiveImgUrl = computed(() => {
  if (detailFallbackAttempted.value) {
    const rawUrl =
      detail.value?.previewUrl || detailActivePost.value?.previewUrl || '';
    return rawUrl
      ? getBooruMediaUrl(
          launcherStore.config.serverUrl,
          detail.value?.source || detailActivePost.value?.source || '',
          rawUrl
        )
      : '';
  }
  if (detail.value) {
    const rawUrl =
      detail.value.sampleUrl ||
      detail.value.mediaUrl ||
      detail.value.previewUrl;
    return rawUrl
      ? getBooruMediaUrl(
          launcherStore.config.serverUrl,
          detail.value.source,
          rawUrl
        )
      : '';
  }
  if (detailActivePost.value) {
    const rawUrl =
      detailActivePost.value.sampleUrl || detailActivePost.value.previewUrl;
    return rawUrl
      ? getBooruMediaUrl(
          launcherStore.config.serverUrl,
          detailActivePost.value.source,
          rawUrl
        )
      : '';
  }
  return '';
});

function handleDetailImageError() {
  const preview =
    detail.value?.previewUrl || detailActivePost.value?.previewUrl;
  const currentUrl = detailActiveImgUrl.value;
  // If we haven't tried preview yet and preview URL is available & different
  if (
    !detailFallbackAttempted.value &&
    preview &&
    !currentUrl.includes(encodeURIComponent(preview))
  ) {
    detailFallbackAttempted.value = true;
    detailImageError.value = false;
    detailImageLoaded.value = false;
  } else {
    detailImageError.value = true;
  }
}

function retryDetailImage() {
  detailFallbackAttempted.value = false;
  detailImageError.value = false;
  detailImageLoaded.value = false;
}

async function openDetail(post: BooruPost) {
  detailActivePost.value = post;
  detailOpen.value = true;
  detailLoading.value = true;
  detailError.value = '';
  detail.value = null;
  detailFallbackAttempted.value = false;
  detailImageLoaded.value = false;
  detailImageError.value = false;
  copiedPrompt.value = false;
  copiedTag.value = null;
  try {
    detail.value = await fetchBooruDetail(
      launcherStore.config.serverUrl,
      post.source,
      post.postId
    );
  } catch (error) {
    detailError.value = readableError(error);
  } finally {
    detailLoading.value = false;
  }
}

async function copyPrompt() {
  if (!prompt.value) return;
  await navigator.clipboard.writeText(prompt.value);
  copiedPrompt.value = true;
  setTimeout(() => (copiedPrompt.value = false), 1500);
}

async function copyTag(tag: string) {
  await navigator.clipboard.writeText(tag);
  copiedTag.value = tag;
  setTimeout(() => {
    if (copiedTag.value === tag) copiedTag.value = null;
  }, 1200);
}

function ratingColorClass(rating: string): string {
  switch (rating?.toLowerCase()) {
    case 'general':
    case 'safe':
    case 'g':
    case 's':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400';
    case 'sensitive':
    case 'questionable':
    case 'q':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
    case 'explicit':
    case 'e':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-400';
    default:
      return 'border-border bg-secondary text-muted-foreground';
  }
}

function categoryBadgeClass(category: string): string {
  switch (category?.toLowerCase()) {
    case 'artist':
      return 'border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20';
    case 'character':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20';
    case 'copyright':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20';
    case 'meta':
      return 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300 hover:bg-zinc-500/20';
    default:
      return 'border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20';
  }
}

watch(
  () => comfyStore.isConnected,
  (connected) => {
    if (connected && isViewActive.value && sources.value.length === 0) {
      void loadSources();
    }
  }
);

async function activateView() {
  isViewActive.value = true;
  if (scrollViewport.value) resizeObserver?.observe(scrollViewport.value);
  if (comfyStore.isConnected && sources.value.length === 0) {
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
  void promptSuggestionStore.init();
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
  <div class="bg-background flex h-full flex-col overflow-hidden select-none">
    <!-- Top Header & Search Bar -->
    <header
      class="border-border/80 bg-card/70 flex shrink-0 flex-col gap-3 border-b px-5 py-3.5 backdrop-blur-md"
    >
      <div class="flex items-center justify-between gap-4">
        <!-- Title & Stats -->
        <div class="flex items-center gap-3">
          <div
            class="border-primary/30 bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-lg border shadow-xs"
          >
            <ImageIcon class="h-4 w-4" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-xs font-bold tracking-wider uppercase">
                Booru Gallery
              </h1>
            </div>
            <p class="text-muted-foreground text-xs">
              Explore Danbooru, Gelbooru, Safebooru, and AI TAG inspirations
            </p>
          </div>
        </div>
      </div>

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
        <div class="relative min-w-64 flex-1">
          <Search
            class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2"
          />
          <Input
            ref="searchInputRef"
            v-model="query"
            class="border-border bg-secondary/50 focus:bg-background h-9 pr-8 pl-9 font-mono text-xs transition-colors"
            placeholder="Search tags (e.g. 1girl, blue_hair, masterpiece)"
            :disabled="!sources.length"
            autocomplete="off"
            spellcheck="false"
            @input="handleSearchInput"
            @click="updateSearchCursor"
            @keyup="updateSearchCursor"
            @select="updateSearchCursor"
            @keydown="handleSearchKeydown"
            @blur="handleSearchBlur"
          />
          <button
            v-if="query"
            type="button"
            class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 p-0.5"
            @click="clearQuery"
          >
            <X class="h-3.5 w-3.5" />
          </button>

          <!-- Autocomplete Floating Dropdown Menu -->
          <div
            v-if="isAutocompleteOpen && autocompleteSuggestions.length > 0"
            role="listbox"
            class="border-border/80 bg-popover/95 absolute top-full left-0 z-50 mt-1.5 max-h-64 w-full overflow-hidden rounded-xl border shadow-xl backdrop-blur-md"
          >
            <!-- Header bar with search hint and suggestion count -->
            <div
              class="border-border/60 bg-muted/40 flex items-center justify-between border-b px-3 py-1.5 text-xs select-none"
            >
              <div class="text-muted-foreground flex items-center gap-1.5">
                <Sparkles class="h-3 w-3 text-amber-400" />
                <span class="font-medium"
                  >Suggestions for
                  <span class="text-foreground font-mono font-semibold"
                    >"{{ activeQueryToken }}"</span
                  ></span
                >
              </div>
              <span class="text-muted-foreground font-mono text-[10px]"
                >{{ autocompleteSuggestions.length }} results</span
              >
            </div>

            <!-- Scrollable Suggestions List -->
            <div class="max-h-48 overflow-y-auto p-1">
              <button
                v-for="(item, index) in autocompleteSuggestions"
                :key="`${item.label}-${item.category}`"
                :ref="
                  (el) => {
                    if (index === activeAutocompleteIndex)
                      activeItemRef = el as HTMLElement;
                  }
                "
                type="button"
                role="option"
                :aria-selected="index === activeAutocompleteIndex"
                class="flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-left font-mono text-xs transition-colors"
                :class="
                  index === activeAutocompleteIndex
                    ? 'bg-accent text-accent-foreground shadow-xs'
                    : 'text-foreground/90 hover:bg-accent/60'
                "
                @mousedown.prevent
                @click="selectSuggestion(item)"
              >
                <!-- Matched Highlight Label -->
                <div class="flex min-w-0 items-center gap-2">
                  <span class="truncate">
                    <template
                      v-for="(part, i) in highlightMatch(
                        item.label,
                        activeQueryToken
                      )"
                      :key="i"
                    >
                      <span
                        v-if="part.isMatch"
                        class="text-primary decoration-primary/40 font-bold underline"
                        >{{ part.text }}</span
                      >
                      <span v-else>{{ part.text }}</span>
                    </template>
                  </span>
                </div>

                <!-- Category Pill & Post Count -->
                <div class="ml-3 flex shrink-0 items-center gap-1.5">
                  <span
                    v-if="item.postCount"
                    class="text-muted-foreground font-mono text-[10px]"
                  >
                    {{ formatPostCount(item.postCount) }}
                  </span>
                  <span
                    class="py-0.2 rounded-full border px-1.5 font-mono text-[10px] font-medium capitalize"
                    :class="item.categoryClass"
                  >
                    {{ item.categoryName }}
                  </span>
                </div>
              </button>
            </div>

            <!-- Footer Keyboard Navigation Hint Bar -->
            <div
              class="border-border/50 bg-muted/20 text-muted-foreground flex items-center justify-between border-t px-2.5 py-1 font-mono text-[10px] select-none"
            >
              <div class="flex items-center gap-2">
                <span
                  ><kbd
                    class="border-border/80 bg-background/80 rounded border px-1 py-0.5"
                    >↑</kbd
                  ><kbd
                    class="border-border/80 bg-background/80 ml-0.5 rounded border px-1 py-0.5"
                    >↓</kbd
                  >
                  navigate</span
                >
                <span
                  ><kbd
                    class="border-border/80 bg-background/80 rounded border px-1 py-0.5"
                    >↵</kbd
                  >
                  or
                  <kbd
                    class="border-border/80 bg-background/80 rounded border px-1 py-0.5"
                    >Tab</kbd
                  >
                  select</span
                >
              </div>
              <span
                ><kbd
                  class="border-border/80 bg-background/80 rounded border px-1 py-0.5"
                  >Esc</kbd
                >
                close</span
              >
            </div>
          </div>
        </div>

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

      <!-- Rating Filters & Refresh Action Row -->
      <div class="flex flex-wrap items-center justify-between gap-2 pt-0.5">
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
            class="flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-medium capitalize transition-all"
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
        <div v-else class="flex-1" />

        <!-- Refresh Button (Icon Only, Aligned with Ratings) -->
        <Button
          variant="outline"
          size="sm"
          :disabled="!comfyStore.isConnected || isLoading || isSetupLoading"
          class="border-border bg-secondary/80 text-foreground hover:bg-accent h-7 w-7 shrink-0 p-0 shadow-xs"
          title="Refresh results"
          @click="runSearch(true)"
        >
          <RefreshCw
            class="h-3.5 w-3.5"
            :class="{ 'animate-spin': isLoading && posts.length === 0 }"
          />
          <span class="sr-only">Refresh</span>
        </Button>
      </div>
    </header>

    <!-- Main Content Area (Virtualized Scroll Container) -->
    <main
      ref="scrollViewport"
      class="flex-1 overflow-y-auto p-5"
      @scroll.passive="handleScroll"
    >
      <!-- Disconnected State -->
      <div
        v-if="!comfyStore.isConnected"
        class="border-border/80 bg-card/80 mx-auto mt-20 max-w-md rounded-2xl border p-8 text-center shadow-md backdrop-blur-xs"
      >
        <div
          class="border-border bg-secondary text-muted-foreground mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border"
        >
          <WifiOff class="h-6 w-6" />
        </div>
        <h2 class="text-foreground text-sm font-semibold">ComfyUI Offline</h2>
        <p class="text-muted-foreground mt-1.5 text-xs leading-relaxed">
          Start the local ComfyUI server to connect to the Booru Gallery proxy.
        </p>
      </div>

      <!-- Initial Setup Loading State -->
      <div
        v-else-if="isSetupLoading"
        class="border-border/80 bg-card/80 mx-auto mt-20 max-w-md rounded-2xl border p-8 text-center shadow-md backdrop-blur-xs"
      >
        <div
          class="border-border bg-secondary text-primary mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border"
        >
          <Loader2 class="h-6 w-6 animate-spin" />
        </div>
        <h2 class="text-foreground text-sm font-semibold">
          Initializing Booru Gallery
        </h2>
        <p class="text-muted-foreground mt-1.5 text-xs leading-relaxed">
          Connecting to ComfyUI custom node bridge and configuring source
          endpoints…
        </p>
      </div>

      <!-- Error State -->
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
        v-else-if="isLoading && !posts.length"
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
        <div
          v-if="visibleWarnings.length"
          class="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-300"
        >
          <AlertCircle class="h-4 w-4 shrink-0 text-amber-400" />
          <span>{{ visibleWarnings.join(' ') }}</span>
        </div>

        <div
          v-if="errorMessage"
          class="border-destructive/30 bg-destructive/10 text-destructive mb-4 flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs"
        >
          <AlertCircle class="h-4 w-4 shrink-0" />
          <span>{{ errorMessage }}</span>
        </div>

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
            <div
              v-for="post in posts.slice(
                virtualRow.index * columns,
                (virtualRow.index + 1) * columns
              )"
              :key="`${post.source}:${post.postId}`"
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
        <div class="flex justify-center py-6">
          <div
            v-if="isLoading && posts.length"
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

    <!-- Post Detail Dialog Modal -->
    <Dialog v-model:open="detailOpen">
      <DialogContent
        class="bg-card/95 border-border/80 flex h-[90vh] w-full min-w-[80vw] flex-col overflow-hidden rounded-2xl p-0 backdrop-blur-md"
      >
        <!-- Modal Header -->
        <DialogHeader
          class="border-border/80 flex shrink-0 flex-row items-center justify-between border-b px-5 py-3"
        >
          <div class="flex items-center gap-3">
            <DialogTitle class="text-xs font-bold tracking-wider uppercase">
              Booru Post Inspector
            </DialogTitle>
            <div
              v-if="detail || detailActivePost"
              class="flex items-center gap-2"
            >
              <Badge
                variant="outline"
                class="border-border font-mono text-xs uppercase"
              >
                {{ detail?.source || detailActivePost?.source }} #{{
                  detail?.postId || detailActivePost?.postId
                }}
              </Badge>
              <Badge
                variant="outline"
                :class="
                  ratingColorClass(
                    detail?.rating || detailActivePost?.rating || ''
                  )
                "
                class="font-mono text-xs capitalize"
              >
                {{ detail?.rating || detailActivePost?.rating }}
              </Badge>
              <span
                v-if="detail?.width && detail?.height"
                class="text-muted-foreground font-mono text-xs"
              >
                {{ detail.width }} × {{ detail.height }}
              </span>
              <Skeleton v-else-if="detailLoading" class="h-3.5 w-16" />
            </div>
          </div>
        </DialogHeader>

        <!-- Modal Body (2-Column Grid) -->
        <div
          class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2"
        >
          <!-- Left: High-Res Image Viewport with Skeleton Preloader -->
          <div
            class="border-border/60 relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden border-r bg-black/60 p-4"
          >
            <!-- Image Loading Skeleton (Shown while downloading full image) -->
            <div
              v-if="!detailImageLoaded && !detailImageError"
              class="bg-muted/10 absolute inset-0 flex flex-col items-center justify-center gap-3 p-6"
            >
              <div
                class="border-border/60 bg-secondary/80 flex h-14 w-14 items-center justify-center rounded-2xl border shadow-lg"
              >
                <Loader2 class="text-primary h-7 w-7 animate-spin" />
              </div>
              <div class="flex flex-col items-center gap-1 text-center">
                <span class="text-foreground text-xs font-semibold">
                  {{
                    detailFallbackAttempted
                      ? 'Loading preview thumbnail…'
                      : 'Loading high-resolution preview…'
                  }}
                </span>
                <span class="text-muted-foreground font-mono text-[10px]">
                  {{ detail?.source || detailActivePost?.source }} #{{
                    detail?.postId || detailActivePost?.postId
                  }}
                </span>
              </div>
            </div>

            <!-- Image Load Error Fallback -->
            <div
              v-else-if="detailImageError"
              class="flex max-w-sm flex-col items-center justify-center gap-3 p-6 text-center text-xs"
            >
              <div
                class="border-destructive/30 bg-destructive/10 text-destructive flex h-12 w-12 items-center justify-center rounded-2xl border shadow-inner"
              >
                <AlertCircle class="h-6 w-6" />
              </div>
              <div class="space-y-1">
                <h3 class="text-foreground text-xs font-semibold">
                  Failed to load image preview
                </h3>
                <p class="text-muted-foreground text-[11px] leading-relaxed">
                  The media provider for
                  <span
                    class="text-foreground font-mono font-medium capitalize"
                    >{{ detail?.source || detailActivePost?.source }}</span
                  >
                  may restrict direct hotlinking.
                </p>
              </div>
              <div
                class="mt-1 flex flex-wrap items-center justify-center gap-2"
              >
                <Button
                  size="sm"
                  variant="outline"
                  class="h-7 text-xs"
                  @click="retryDetailImage"
                >
                  <RotateCw class="mr-1.5 h-3 w-3" />
                  <span>Retry Image</span>
                </Button>
                <Button
                  v-if="detail?.postUrl || detailActivePost?.postUrl"
                  size="sm"
                  variant="outline"
                  class="h-7 text-xs"
                  @click="
                    openUrl(detail?.postUrl || detailActivePost?.postUrl || '')
                  "
                >
                  <ExternalLink class="mr-1.5 h-3.5 w-3.5" />
                  <span>Open original post</span>
                </Button>
              </div>
            </div>

            <!-- Image Display -->
            <img
              v-if="detailActiveImgUrl"
              :src="detailActiveImgUrl"
              :alt="`${detail?.source || detailActivePost?.source} post ${detail?.postId || detailActivePost?.postId}`"
              class="h-full w-full rounded-lg object-contain shadow-2xl transition-opacity duration-300 select-none"
              :class="detailImageLoaded ? 'opacity-100' : 'opacity-0'"
              @load="detailImageLoaded = true"
              @error="handleDetailImageError"
            />
          </div>

          <!-- Right: Metadata & Tag Inspector -->
          <div class="flex min-h-0 flex-col gap-4 overflow-y-auto p-5">
            <!-- Full Right Skeleton while detailLoading is true -->
            <template v-if="detailLoading">
              <!-- Action Buttons Skeleton -->
              <div class="flex items-center gap-2">
                <Skeleton class="h-8 flex-1 rounded-md" />
                <Skeleton class="h-8 w-28 rounded-md" />
              </div>

              <!-- Extracted Prompt Skeleton -->
              <div
                class="border-border/80 bg-secondary/30 flex flex-col gap-2.5 rounded-xl border p-3.5"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-1.5">
                    <Sparkles
                      class="h-3.5 w-3.5 animate-pulse text-amber-400/40"
                    />
                    <Skeleton class="h-3 w-28" />
                  </div>
                  <Skeleton class="h-3 w-12" />
                </div>
                <div
                  class="border-border/50 bg-background/50 flex flex-col gap-2 rounded-lg border p-3"
                >
                  <Skeleton class="h-3 w-full" />
                  <Skeleton class="h-3 w-5/6" />
                  <Skeleton class="h-3 w-4/6" />
                </div>
              </div>

              <!-- Tags Cloud Skeleton -->
              <div class="space-y-4 pt-1">
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <Skeleton class="h-3.5 w-20" />
                    <Skeleton class="h-3 w-6" />
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    <Skeleton class="h-6 w-16 rounded-md" />
                    <Skeleton class="h-6 w-24 rounded-md" />
                    <Skeleton class="h-6 w-20 rounded-md" />
                    <Skeleton class="h-6 w-28 rounded-md" />
                    <Skeleton class="h-6 w-14 rounded-md" />
                  </div>
                </div>

                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <Skeleton class="h-3.5 w-24" />
                    <Skeleton class="h-3 w-6" />
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    <Skeleton class="h-6 w-20 rounded-md" />
                    <Skeleton class="h-6 w-16 rounded-md" />
                    <Skeleton class="h-6 w-28 rounded-md" />
                    <Skeleton class="h-6 w-22 rounded-md" />
                    <Skeleton class="h-6 w-18 rounded-md" />
                    <Skeleton class="h-6 w-24 rounded-md" />
                  </div>
                </div>
              </div>
            </template>

            <!-- Loaded Metadata & Tags View -->
            <template v-else-if="detail">
              <!-- Action Buttons -->
              <div class="flex items-center gap-2">
                <Button
                  size="sm"
                  class="bg-primary text-primary-foreground hover:bg-primary/90 flex-1 text-xs font-semibold shadow-xs"
                  @click="copyPrompt"
                >
                  <Check v-if="copiedPrompt" class="h-3.5 w-3.5" />
                  <Copy v-else class="h-3.5 w-3.5" />
                  <span>{{
                    copiedPrompt
                      ? 'Copied to Clipboard!'
                      : 'Copy Extracted Prompt'
                  }}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="border-border bg-secondary hover:bg-accent text-xs font-medium"
                  @click="openUrl(detail.postUrl)"
                >
                  <ExternalLink class="h-3.5 w-3.5" />
                  <span>Open Source</span>
                </Button>
              </div>

              <!-- Extracted Prompt Box -->
              <div
                class="border-border/80 bg-secondary/30 flex flex-col gap-2 rounded-xl border p-3.5"
              >
                <div class="flex items-center justify-between">
                  <span
                    class="text-muted-foreground flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase"
                  >
                    <Sparkles class="h-3.5 w-3.5 text-amber-400" />
                    <span>Extracted Prompt</span>
                  </span>
                  <span class="text-muted-foreground font-mono text-[10px]">
                    {{ tagCountTotal }} tags
                  </span>
                </div>
                <p
                  class="text-foreground border-border/50 bg-background/50 rounded-lg border p-3 font-mono text-xs leading-relaxed wrap-break-word select-text"
                >
                  {{ prompt || 'No matching tags extracted from defaults.' }}
                </p>
              </div>

              <!-- Categorized Tags Cloud -->
              <div class="space-y-3.5 pb-2">
                <div
                  v-if="!tagCountTotal"
                  class="border-border/60 bg-muted/20 flex flex-col items-center justify-center gap-2 rounded-xl border p-6 text-center text-xs"
                >
                  <Tag class="text-muted-foreground/40 h-6 w-6" />
                  <span class="text-muted-foreground font-medium">
                    No categorized tags available for this post
                  </span>
                </div>

                <section
                  v-for="(tags, category) in detail.tags"
                  v-else
                  :key="category"
                  class="space-y-1.5"
                >
                  <div class="flex items-center justify-between">
                    <h3
                      class="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold capitalize"
                    >
                      <Tag class="h-3 w-3" />
                      <span>{{ category }}</span>
                    </h3>
                    <span class="text-muted-foreground font-mono text-[10px]">
                      {{ tags.length }}
                    </span>
                  </div>

                  <div class="flex flex-wrap gap-1.5">
                    <button
                      v-for="tag in tags"
                      :key="tag"
                      type="button"
                      class="cursor-pointer rounded-md border px-2 py-0.5 font-mono text-xs transition-all select-text"
                      :class="[
                        categoryBadgeClass(category),
                        copiedTag === tag ? 'ring-primary scale-105 ring-2' : ''
                      ]"
                      :title="`Click to copy: ${tag}`"
                      @click="copyTag(tag)"
                    >
                      <span v-if="copiedTag === tag" class="font-bold"
                        >✓ {{ tag }}</span
                      >
                      <span v-else>{{ tag }}</span>
                    </button>
                  </div>
                </section>
              </div>
            </template>

            <!-- Error / Empty State Fallback -->
            <template v-else>
              <div
                class="border-destructive/30 bg-destructive/10 text-destructive flex flex-col gap-3 rounded-xl border p-4 text-xs"
              >
                <div class="flex items-center gap-2">
                  <AlertCircle class="h-4 w-4 shrink-0" />
                  <span class="font-semibold"
                    >Unable to load metadata & tags</span
                  >
                </div>
                <p class="text-muted-foreground text-xs leading-relaxed">
                  {{
                    detailError ||
                    'The source provider did not return tags or metadata for this post.'
                  }}
                </p>
                <div class="mt-1 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    class="h-7 text-xs"
                    @click="detailActivePost && openDetail(detailActivePost)"
                  >
                    <RotateCw class="mr-1.5 h-3 w-3" />
                    <span>Retry Details</span>
                  </Button>
                  <Button
                    v-if="detailActivePost?.postUrl"
                    size="sm"
                    variant="outline"
                    class="h-7 text-xs"
                    @click="openUrl(detailActivePost.postUrl)"
                  >
                    <ExternalLink class="mr-1.5 h-3 w-3" />
                    <span>Open in browser</span>
                  </Button>
                </div>
              </div>

              <!-- Available Post Summary Info -->
              <div
                v-if="detailActivePost"
                class="border-border/80 bg-secondary/30 flex flex-col gap-2.5 rounded-xl border p-3.5"
              >
                <span
                  class="text-muted-foreground text-xs font-bold tracking-wider uppercase"
                >
                  Available Post Info
                </span>
                <div class="grid grid-cols-2 gap-2 font-mono text-xs">
                  <div>
                    <span class="text-muted-foreground">Source:</span>
                    <span
                      class="text-foreground ml-1.5 font-medium capitalize"
                      >{{ detailActivePost.source }}</span
                    >
                  </div>
                  <div>
                    <span class="text-muted-foreground">ID:</span>
                    <span class="text-foreground ml-1.5 font-medium"
                      >#{{ detailActivePost.postId }}</span
                    >
                  </div>
                  <div>
                    <span class="text-muted-foreground">Rating:</span>
                    <span
                      class="text-foreground ml-1.5 font-medium capitalize"
                      >{{ detailActivePost.rating || 'N/A' }}</span
                    >
                  </div>
                  <div v-if="detailActivePost.score">
                    <span class="text-muted-foreground">Score:</span>
                    <span class="text-foreground ml-1.5 font-medium">{{
                      detailActivePost.score
                    }}</span>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
