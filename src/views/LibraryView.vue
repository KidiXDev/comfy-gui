<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowUpRight,
  BookOpen,
  Check,
  Clock,
  Copy,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  User,
  X
} from '@lucide/vue';
import { Badge as _Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { invoke } from '@tauri-apps/api/core';
import { formatShortDate } from '@/utils/formatters';
import { LibraryService } from '../services/libraryService';
import { useLibraryStore } from '../stores/libraryStore';
import type {
  LibraryListEntry,
  LoraData,
  PromptData,
  CharacterData
} from '../types/library';
import { useWorkflowStore } from '../stores/workflowStore';

const route = useRoute();
const router = useRouter();
const libraryStore = useLibraryStore();
const workflowStore = useWorkflowStore();

// ---------------------------------------------------------------------------
// Category tab state
// ---------------------------------------------------------------------------

type CategoryTab = 'prompts' | 'loras' | 'characters';

const categoryTabs: Array<{ id: CategoryTab; label: string; icon: unknown }> = [
  { id: 'prompts', label: 'Prompts', icon: Sparkles },
  { id: 'loras', label: 'LoRAs', icon: Layers },
  { id: 'characters', label: 'Characters', icon: User }
];

const activeTab = ref<CategoryTab>('prompts');

// Sync tab from URL query
onMounted(() => {
  const tabParam = route.query.tab as string;
  if (tabParam && categoryTabs.some((t) => t.id === tabParam)) {
    activeTab.value = tabParam as CategoryTab;
  }
  void loadAll();
});

watch(activeTab, (tab) => {
  void router.replace({ query: { ...route.query, tab } });
});

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadAll() {
  await Promise.all([
    libraryStore.fetchCategory('prompts'),
    libraryStore.fetchCategory('loras'),
    libraryStore.fetchCategory('characters')
  ]);
}

async function refreshCurrentTab() {
  failedThumbnails.value.clear();
  await libraryStore.fetchCategory(activeTab.value);
}

const failedThumbnails = ref<Set<string>>(new Set());

// ---------------------------------------------------------------------------
// Search / filter
// ---------------------------------------------------------------------------

const searchQuery = ref('');
const promptTypeFilter = ref<'all' | 'both' | 'positive' | 'negative'>('all');

const currentEntries = computed<LibraryListEntry[]>(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const entries = libraryStore.getEntries(activeTab.value);

  return entries.filter((entry) => {
    if (q) {
      const inName = entry.name.toLowerCase().includes(q);
      const inDesc = entry.description?.toLowerCase().includes(q) ?? false;
      return inName || inDesc;
    }
    return true;
  });
});

// ---------------------------------------------------------------------------
// Item editor / creator state
// ---------------------------------------------------------------------------

const isEditorOpen = ref(false);
const isEditorLoading = ref(false);
const editorMode = ref<'create' | 'edit'>('create');

// Common fields
const editorId = ref('');
const editorName = ref('');
const editorDescription = ref('');
const editorThumbnailId = ref('');
const editorThumbnailPreview = ref('');
const editorCreatedAt = ref(0);

// Prompt-specific
const editorPromptType = ref<'both' | 'positive' | 'negative'>('both');
const editorPositive = ref('');
const editorNegative = ref('');

// Lora-specific (display the current workflow loras when creating)
const editorLoras = ref<
  Array<{ name: string; strength: number; enabled: boolean }>
>([]);

// Character-specific
const editorCharSeries = ref('');
const editorCharTrigger = ref('');
const editorCharTags = ref('');
const editorCharSource = ref<'local' | 'animadex' | 'manual'>('local');
const editorCharAnimadexSlug = ref('');

const editorSaveError = ref('');
const editorIsSaving = ref(false);

function resetEditor() {
  editorId.value = '';
  editorName.value = '';
  editorDescription.value = '';
  editorThumbnailId.value = '';
  editorThumbnailPreview.value = '';
  editorCreatedAt.value = 0;
  editorPromptType.value = 'both';
  editorPositive.value = '';
  editorNegative.value = '';
  editorLoras.value = workflowStore.loras.map((l) => ({
    name: l.name,
    strength: l.strength,
    enabled: l.enabled
  }));
  editorCharSeries.value = '';
  editorCharTrigger.value = '';
  editorCharTags.value = '';
  editorCharSource.value = 'local';
  editorCharAnimadexSlug.value = '';
  editorSaveError.value = '';
}

function openCreateEditor() {
  resetEditor();
  if (activeTab.value === 'prompts') {
    editorPositive.value = workflowStore.positivePrompt;
    editorNegative.value = workflowStore.negativePrompt;
  }
  editorMode.value = 'create';
  isEditorOpen.value = true;
}

async function openEditEditor(entry: LibraryListEntry) {
  resetEditor();
  editorMode.value = 'edit';
  isEditorLoading.value = true;
  isEditorOpen.value = true;

  try {
    if (activeTab.value === 'prompts') {
      const item = await LibraryService.getItem<PromptData>(
        entry.id,
        entry.category
      );
      editorId.value = item.id;
      editorName.value = item.name;
      editorDescription.value = item.description ?? '';
      editorThumbnailId.value = item.thumbnailId ?? '';
      editorThumbnailPreview.value = item.thumbnailUrl ?? '';
      editorCreatedAt.value = item.createdAt;
      editorPromptType.value = item.data.type;
      editorPositive.value = item.data.positive ?? '';
      editorNegative.value = item.data.negative ?? '';
    } else if (activeTab.value === 'loras') {
      const item = await LibraryService.getItem<LoraData>(
        entry.id,
        entry.category
      );
      editorId.value = item.id;
      editorName.value = item.name;
      editorDescription.value = item.description ?? '';
      editorThumbnailId.value = item.thumbnailId ?? '';
      editorThumbnailPreview.value = item.thumbnailUrl ?? '';
      editorCreatedAt.value = item.createdAt;
      editorLoras.value = item.data.loras;
    } else if (activeTab.value === 'characters') {
      const item = await LibraryService.getItem<CharacterData>(
        entry.id,
        entry.category
      );
      editorId.value = item.id;
      editorName.value = item.name;
      editorDescription.value = item.description ?? '';
      editorThumbnailId.value = item.thumbnailId ?? '';
      editorThumbnailPreview.value = item.thumbnailUrl ?? '';
      editorCreatedAt.value = item.createdAt;
      editorCharSeries.value = item.data.series ?? '';
      editorCharTrigger.value = item.data.trigger;
      editorCharTags.value = item.data.tags.join(', ');
      editorCharSource.value =
        item.data.source === 'animadex' || item.data.source === 'manual'
          ? item.data.source
          : 'local';
      editorCharAnimadexSlug.value = item.data.animadexSlug ?? '';
    }
  } finally {
    isEditorLoading.value = false;
  }
}

async function handleSave() {
  if (!editorName.value.trim()) return;
  editorIsSaving.value = true;
  editorSaveError.value = '';

  try {
    let data: PromptData | LoraData | CharacterData;

    if (activeTab.value === 'prompts') {
      data = {
        type: editorPromptType.value,
        positive:
          editorPromptType.value === 'negative'
            ? undefined
            : editorPositive.value,
        negative:
          editorPromptType.value === 'positive'
            ? undefined
            : editorNegative.value
      } satisfies PromptData;
    } else if (activeTab.value === 'loras') {
      data = { loras: editorLoras.value } satisfies LoraData;
    } else {
      data = {
        series: editorCharSeries.value.trim() || undefined,
        trigger: editorCharTrigger.value.trim(),
        tags: editorCharTags.value
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        source: editorCharSource.value,
        animadexSlug: editorCharAnimadexSlug.value.trim() || undefined
      } satisfies CharacterData;
    }

    const payload = {
      id: editorId.value || '',
      category: activeTab.value,
      name: editorName.value.trim(),
      description: editorDescription.value.trim() || undefined,
      thumbnailId: editorThumbnailId.value || undefined,
      data,
      createdAt: editorCreatedAt.value || Date.now(),
      updatedAt: Date.now()
    };

    await libraryStore.saveItem(payload);
    isEditorOpen.value = false;
  } catch (err) {
    editorSaveError.value = String(err);
  } finally {
    editorIsSaving.value = false;
  }
}

// ---------------------------------------------------------------------------
// Thumbnail picking
// ---------------------------------------------------------------------------

async function pickThumbnail() {
  try {
    const path = await invoke<string | null>('pick_file', {
      title: 'Select Thumbnail Image',
      filterName: 'Images',
      filterExtensions: ['png', 'jpg', 'jpeg', 'webp']
    });
    if (!path) return;

    // We need an ID for the thumbnail filename — use a temp one if creating
    const tempId = editorId.value || `tmp-${Date.now()}`;
    const thumbId = await LibraryService.saveThumbnailFromPath(tempId, path);
    editorThumbnailId.value = thumbId;
    editorThumbnailPreview.value = LibraryService.getThumbnailUrl(thumbId);
  } catch (err) {
    console.warn('Thumbnail pick failed:', err);
  }
}

function handleThumbnailDrop(event: DragEvent) {
  const file = event.dataTransfer?.files?.[0];
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target?.result as string;
    if (!dataUrl) return;
    const tempId = editorId.value || `tmp-${Date.now()}`;
    try {
      const thumbId = await LibraryService.saveThumbnailFromDataUrl(
        tempId,
        dataUrl
      );
      editorThumbnailId.value = thumbId;
      editorThumbnailPreview.value = LibraryService.getThumbnailUrl(thumbId);
    } catch (err) {
      console.warn('Thumbnail drag-drop failed:', err);
    }
  };
  reader.readAsDataURL(file);
}

// ---------------------------------------------------------------------------
// Apply actions
// ---------------------------------------------------------------------------

async function applyPrompt(
  entry: LibraryListEntry,
  mode: 'both' | 'positive' | 'negative'
) {
  const item = await LibraryService.getItem<PromptData>(
    entry.id,
    entry.category
  );
  const data = item.data;
  if ((mode === 'both' || mode === 'positive') && data.positive) {
    workflowStore.positivePrompt = data.positive;
  }
  if ((mode === 'both' || mode === 'negative') && data.negative) {
    workflowStore.negativePrompt = data.negative;
  }
  void router.push('/workflow');
}

async function applyLora(entry: LibraryListEntry, append = false) {
  const item = await LibraryService.getItem<LoraData>(entry.id, entry.category);
  const newItems = item.data.loras.map((l, i) => ({
    id: `lora-${i}-${Date.now()}`,
    name: l.name,
    strength: l.strength,
    enabled: l.enabled
  }));
  if (append) {
    workflowStore.loras.push(...newItems);
  } else {
    workflowStore.loras = newItems;
  }
  void router.push('/workflow');
}

async function copyCharacterTags(entry: LibraryListEntry) {
  const item = await LibraryService.getItem<CharacterData>(
    entry.id,
    entry.category
  );
  const allTags = [item.data.trigger, ...item.data.tags].join(', ');
  await navigator.clipboard.writeText(allTags);
  copiedEntryId.value = entry.id;
  setTimeout(() => {
    if (copiedEntryId.value === entry.id) copiedEntryId.value = null;
  }, 1500);
}

async function injectCharacterToPrompt(entry: LibraryListEntry) {
  const item = await LibraryService.getItem<CharacterData>(
    entry.id,
    entry.category
  );
  const allTags = [item.data.trigger, ...item.data.tags].join(', ');
  if (workflowStore.positivePrompt.trim()) {
    workflowStore.positivePrompt += `, ${allTags}`;
  } else {
    workflowStore.positivePrompt = allTags;
  }
  void router.push('/workflow');
}

// ---------------------------------------------------------------------------
// Delete Confirmation
// ---------------------------------------------------------------------------

const itemToDelete = ref<LibraryListEntry | null>(null);
const isDeleteDialogOpen = ref(false);
const isDeleting = ref(false);

function requestDelete(entry: LibraryListEntry) {
  itemToDelete.value = entry;
  isDeleteDialogOpen.value = true;
}

function requestDeleteFromEditor() {
  if (!editorId.value) return;
  const current = libraryStore
    .getEntries(activeTab.value)
    .find((e) => e.id === editorId.value);
  if (current) {
    requestDelete(current);
  } else {
    requestDelete({
      id: editorId.value,
      category: activeTab.value,
      name: editorName.value,
      createdAt: editorCreatedAt.value || Date.now(),
      updatedAt: Date.now()
    });
  }
}

async function confirmDelete() {
  if (!itemToDelete.value) return;
  isDeleting.value = true;
  try {
    const target = itemToDelete.value;
    await libraryStore.deleteItem(target.id, target.category);
    if (isEditorOpen.value && editorId.value === target.id) {
      isEditorOpen.value = false;
    }
    isDeleteDialogOpen.value = false;
    itemToDelete.value = null;
  } catch (err) {
    console.error('Failed to delete library item:', err);
  } finally {
    isDeleting.value = false;
  }
}

// ---------------------------------------------------------------------------
// Copy feedback
// ---------------------------------------------------------------------------
const copiedEntryId = ref<string | null>(null);
</script>

<template>
  <div class="bg-background flex h-full flex-col overflow-hidden">
    <!-- Page Header -->
    <div
      class="border-border bg-card/60 flex shrink-0 items-center justify-between border-b px-5 py-3 backdrop-blur-sm"
    >
      <div class="flex items-center gap-3">
        <div
          class="bg-primary/10 border-primary/20 text-primary flex h-9 w-9 items-center justify-center rounded-xl border"
        >
          <BookOpen class="h-4.5 w-4.5" />
        </div>
        <div>
          <h1 class="text-foreground text-sm font-bold tracking-tight">
            Library
          </h1>
          <p class="text-muted-foreground text-xs">
            Centralized presets for prompts, LoRAs, and characters
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          class="h-8 gap-1.5 px-3 text-xs"
          title="Open library folder"
          @click="LibraryService.openFolder(activeTab)"
        >
          <FolderOpen class="h-3.5 w-3.5" />
          <span>Folder</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          class="h-8 gap-1.5 px-3 text-xs"
          :disabled="libraryStore.isLoading(activeTab)"
          @click="refreshCurrentTab"
        >
          <RefreshCw
            class="h-3.5 w-3.5"
            :class="{ 'animate-spin': libraryStore.isLoading(activeTab) }"
          />
          <span>Refresh</span>
        </Button>
        <Button
          size="sm"
          class="bg-primary text-primary-foreground hover:bg-primary/90 h-8 gap-1.5 px-3 text-xs font-semibold"
          @click="openCreateEditor"
        >
          <Plus class="h-3.5 w-3.5" />
          <span
            >Add to
            {{ categoryTabs.find((t) => t.id === activeTab)?.label }}</span
          >
        </Button>
      </div>
    </div>

    <!-- Category Tabs -->
    <div
      class="border-border bg-muted/20 flex shrink-0 items-center gap-1 border-b px-5 py-2.5"
    >
      <button
        v-for="tab in categoryTabs"
        :key="tab.id"
        type="button"
        class="flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all"
        :class="
          activeTab === tab.id
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        "
        @click="activeTab = tab.id"
      >
        <component :is="tab.icon" class="h-3.5 w-3.5" />
        {{ tab.label }}
        <span
          class="rounded-full px-1.5 py-0.5 font-mono text-xs"
          :class="
            activeTab === tab.id
              ? 'bg-primary-foreground/20 text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          "
        >
          {{ libraryStore.getEntries(tab.id).length }}
        </span>
      </button>
    </div>

    <!-- Search bar + Prompt filter -->
    <div
      class="border-border bg-card/20 flex shrink-0 flex-wrap items-center gap-3 border-b px-5 py-2.5"
    >
      <div class="relative min-w-60 flex-1">
        <Search
          class="text-muted-foreground absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2"
        />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by name or description..."
          class="bg-background border-border placeholder:text-muted-foreground text-foreground focus:border-primary/60 h-8 w-full rounded-lg border pr-8 pl-8.5 text-xs transition-colors outline-none"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
          @click="searchQuery = ''"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </div>

      <!-- Prompt type scope filter -->
      <div v-if="activeTab === 'prompts'" class="flex items-center gap-1">
        <span class="text-muted-foreground mr-1 text-xs font-medium"
          >Scope:</span
        >
        <button
          v-for="st in [
            { label: 'All', val: 'all' },
            { label: 'Both', val: 'both' },
            { label: '+Pos', val: 'positive' },
            { label: '-Neg', val: 'negative' }
          ]"
          :key="st.val"
          type="button"
          class="cursor-pointer rounded-md px-2 py-0.5 font-mono text-xs font-semibold transition-colors"
          :class="
            promptTypeFilter === st.val
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'border-border bg-muted text-muted-foreground hover:text-foreground border'
          "
          @click="promptTypeFilter = st.val as any"
        >
          {{ st.label }}
        </button>
      </div>

      <span class="text-muted-foreground font-mono text-xs">
        {{ currentEntries.length }} item{{
          currentEntries.length !== 1 ? 's' : ''
        }}
      </span>
    </div>

    <!-- Content Area -->
    <ScrollArea class="flex-1 px-5 py-4">
      <!-- Loading skeleton -->
      <div
        v-if="libraryStore.isLoading(activeTab)"
        class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      >
        <div
          v-for="n in 6"
          :key="n"
          class="bg-card border-border flex min-h-40 animate-pulse overflow-hidden rounded-xl border"
        >
          <div class="flex min-w-0 flex-1 flex-col justify-between p-3.5">
            <div>
              <div class="mb-3 flex items-center justify-between">
                <div class="bg-muted h-4 w-16 rounded" />
                <div class="bg-muted h-3 w-14 rounded" />
              </div>
              <div class="bg-muted mb-2 h-4 w-2/3 rounded" />
              <div class="bg-muted h-3 w-1/2 rounded" />
            </div>
            <div class="bg-muted mt-3 h-7 w-full rounded" />
          </div>
          <div
            class="bg-muted border-border/40 w-28 shrink-0 border-l sm:w-32 md:w-36"
          />
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-else-if="currentEntries.length === 0"
        class="flex h-64 flex-col items-center justify-center gap-3 text-center"
      >
        <div
          class="bg-muted text-muted-foreground flex h-14 w-14 items-center justify-center rounded-full"
        >
          <component
            :is="categoryTabs.find((t) => t.id === activeTab)?.icon"
            class="h-7 w-7 opacity-40"
          />
        </div>
        <div>
          <p class="text-foreground text-sm font-semibold">
            {{
              searchQuery
                ? `No results for "${searchQuery}"`
                : `No ${activeTab} yet`
            }}
          </p>
          <p class="text-muted-foreground mt-1 text-xs">
            {{
              searchQuery
                ? 'Try a different search term.'
                : `Click "Add to ${categoryTabs.find((t) => t.id === activeTab)?.label}" to create your first entry.`
            }}
          </p>
        </div>
        <Button
          v-if="!searchQuery"
          size="sm"
          class="bg-primary text-primary-foreground hover:bg-primary/90 mt-1 h-8 gap-1.5 px-3 text-xs"
          @click="openCreateEditor"
        >
          <Plus class="h-3.5 w-3.5" />
          Add first entry
        </Button>
      </div>

      <!-- Cards grid -->
      <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="entry in currentEntries"
          :key="entry.id"
          class="border-border bg-card hover:border-primary/50 relative flex min-h-40 cursor-pointer flex-row overflow-hidden rounded-xl border transition-all hover:shadow-md"
          @click="openEditEditor(entry)"
        >
          <!-- Left: Content & Actions -->
          <div class="flex min-w-0 flex-1 flex-col justify-between p-3.5">
            <!-- Top: Badge + Date + Title + Desc -->
            <div>
              <div class="flex items-center justify-between gap-2">
                <span
                  class="rounded-md px-1.5 py-0.5 font-mono text-xs font-bold uppercase"
                  :class="{
                    'border border-emerald-500/30 bg-emerald-500/15 text-emerald-400':
                      activeTab === 'prompts',
                    'border border-violet-500/30 bg-violet-500/15 text-violet-400':
                      activeTab === 'loras',
                    'border border-amber-500/30 bg-amber-500/15 text-amber-400':
                      activeTab === 'characters'
                  }"
                >
                  {{ activeTab }}
                </span>

                <div
                  class="text-muted-foreground/70 flex items-center gap-1 font-mono text-xs"
                >
                  <Clock class="h-2.5 w-2.5" />
                  <span>{{ formatShortDate(entry.updatedAt) }}</span>
                </div>
              </div>

              <div class="mt-2">
                <h3
                  class="text-foreground truncate text-sm leading-snug font-bold"
                  :title="entry.name"
                >
                  {{ entry.name }}
                </h3>
                <p
                  v-if="entry.description"
                  class="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed"
                  :title="entry.description"
                >
                  {{ entry.description }}
                </p>
              </div>
            </div>

            <!-- Bottom: Action Buttons -->
            <div
              class="border-border/60 mt-3 flex items-center justify-between gap-2 border-t pt-2.5"
            >
              <!-- Left: Edit / Delete -->
              <div class="flex shrink-0 items-center gap-1">
                <Button
                  size="iconSm"
                  variant="ghost"
                  class="text-muted-foreground hover:text-foreground h-7 w-7"
                  title="Edit details"
                  @click.stop="openEditEditor(entry)"
                >
                  <SlidersHorizontal class="h-3.5 w-3.5" />
                </Button>

                <Button
                  size="iconSm"
                  variant="ghost"
                  class="text-muted-foreground hover:text-destructive h-7 w-7"
                  title="Delete preset"
                  @click.stop="requestDelete(entry)"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </Button>
              </div>

              <!-- Right: apply actions per category -->
              <div class="flex flex-wrap items-center justify-end gap-1.5">
                <!-- PROMPTS -->
                <template v-if="activeTab === 'prompts'">
                  <Button
                    size="sm"
                    variant="outline"
                    class="h-7 px-2 text-xs"
                    title="Apply positive only"
                    @click.stop="applyPrompt(entry, 'positive')"
                  >
                    + Pos
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    class="h-7 px-2 text-xs"
                    title="Apply negative only"
                    @click.stop="applyPrompt(entry, 'negative')"
                  >
                    − Neg
                  </Button>
                  <Button
                    size="sm"
                    class="bg-primary text-primary-foreground hover:bg-primary/90 h-7 px-2.5 text-xs font-semibold"
                    @click.stop="applyPrompt(entry, 'both')"
                  >
                    Apply
                  </Button>
                </template>

                <!-- LORAS -->
                <template v-else-if="activeTab === 'loras'">
                  <Button
                    size="sm"
                    variant="outline"
                    class="h-7 px-2 text-xs"
                    title="Append to current LoRA stack"
                    @click.stop="applyLora(entry, true)"
                  >
                    + Append
                  </Button>
                  <Button
                    size="sm"
                    class="bg-primary text-primary-foreground hover:bg-primary/90 h-7 px-2.5 text-xs font-semibold"
                    @click.stop="applyLora(entry, false)"
                  >
                    Apply
                  </Button>
                </template>

                <!-- CHARACTERS -->
                <template v-else-if="activeTab === 'characters'">
                  <Button
                    size="iconSm"
                    variant="ghost"
                    class="text-muted-foreground hover:text-foreground h-7 w-7"
                    title="Copy all tags"
                    @click.stop="copyCharacterTags(entry)"
                  >
                    <Check
                      v-if="copiedEntryId === entry.id"
                      class="h-3.5 w-3.5 text-emerald-400"
                    />
                    <Copy v-else class="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    class="bg-primary text-primary-foreground hover:bg-primary/90 h-7 px-2.5 text-xs font-semibold"
                    title="Inject tags into positive prompt"
                    @click.stop="injectCharacterToPrompt(entry)"
                  >
                    <ArrowUpRight class="mr-1 h-3 w-3" />
                    Inject
                  </Button>
                </template>
              </div>
            </div>
          </div>

          <!-- Right: Portrait Thumbnail -->
          <div
            class="bg-muted/40 border-border/50 relative w-28 shrink-0 self-stretch overflow-hidden border-l sm:w-32 md:w-36"
          >
            <img
              v-if="entry.thumbnailUrl && !failedThumbnails.has(entry.id)"
              :src="entry.thumbnailUrl"
              :alt="entry.name"
              class="h-full w-full object-cover object-center"
              @error="failedThumbnails.add(entry.id)"
            />
            <div
              v-else
              class="from-primary/5 to-primary/20 flex h-full w-full items-center justify-center bg-linear-to-br"
            >
              <component
                :is="categoryTabs.find((t) => t.id === activeTab)?.icon"
                class="text-primary/25 h-10 w-10"
              />
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>

    <!-- ---------------------------------------------------------------
         Item Editor Dialog
    --------------------------------------------------------------- -->
    <Dialog :open="isEditorOpen" @update:open="(v) => (isEditorOpen = v)">
      <DialogContent
        class="border-border bg-card flex max-h-[90vh] w-full min-w-[60vw] flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader
          class="border-border bg-background/50 shrink-0 border-b px-5 py-4"
        >
          <DialogTitle
            class="text-foreground flex items-center gap-2 text-sm font-bold"
          >
            <component
              :is="categoryTabs.find((t) => t.id === activeTab)?.icon"
              class="text-primary h-4 w-4"
            />
            {{
              editorMode === 'create'
                ? `Add ${categoryTabs.find((t) => t.id === activeTab)?.label} Entry`
                : `Edit "${editorName}"`
            }}
          </DialogTitle>
        </DialogHeader>

        <div
          v-if="isEditorLoading"
          class="flex items-center justify-center py-12"
        >
          <Loader2 class="text-primary h-6 w-6 animate-spin" />
        </div>

        <div
          v-else
          class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5"
        >
          <!-- Error banner -->
          <div
            v-if="editorSaveError"
            class="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400"
          >
            <X class="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{{ editorSaveError }}</span>
          </div>

          <div class="grid grid-cols-1 items-start gap-6 md:grid-cols-3">
            <!-- Left (2 cols): Core form fields & category-specific inputs -->
            <div class="flex flex-col gap-4 md:col-span-2">
              <!-- Common: Name -->
              <div class="flex flex-col gap-1.5">
                <Label class="text-foreground text-xs font-bold"
                  >Name <span class="text-destructive">*</span></Label
                >
                <Input
                  v-model="editorName"
                  placeholder="Give this entry a name..."
                  class="text-xs"
                />
              </div>

              <!-- Common: Description -->
              <div class="flex flex-col gap-1.5">
                <Label class="text-foreground text-xs font-bold"
                  >Description</Label
                >
                <Input
                  v-model="editorDescription"
                  placeholder="Short description..."
                  class="text-xs"
                />
              </div>

              <div class="border-border border-t" />

              <!-- ── PROMPT FIELDS ── -->
              <template v-if="activeTab === 'prompts'">
                <div class="flex flex-col gap-1.5">
                  <Label class="text-foreground text-xs font-bold">Scope</Label>
                  <div class="grid grid-cols-3 gap-2">
                    <button
                      v-for="st in [
                        { val: 'both', title: 'Both', desc: 'Pos & Neg' },
                        {
                          val: 'positive',
                          title: 'Positive',
                          desc: 'Pos only'
                        },
                        { val: 'negative', title: 'Negative', desc: 'Neg only' }
                      ]"
                      :key="st.val"
                      type="button"
                      class="border-border hover:border-primary/60 flex cursor-pointer flex-col gap-0.5 rounded-lg border p-2 text-left transition-all"
                      :class="
                        editorPromptType === st.val
                          ? 'border-primary bg-primary/10 ring-primary/20 ring-1'
                          : 'bg-card text-muted-foreground'
                      "
                      @click="editorPromptType = st.val as any"
                    >
                      <span class="text-foreground text-xs font-bold">{{
                        st.title
                      }}</span>
                      <span class="text-muted-foreground text-xs">{{
                        st.desc
                      }}</span>
                    </button>
                  </div>
                </div>

                <div
                  v-if="editorPromptType !== 'negative'"
                  class="flex flex-col gap-1.5"
                >
                  <Label
                    class="font-mono text-xs font-bold text-emerald-400 uppercase"
                    >Positive Prompt</Label
                  >
                  <Textarea
                    v-model="editorPositive"
                    rows="3"
                    placeholder="Positive prompt text..."
                    class="bg-background font-mono text-xs"
                  />
                </div>

                <div
                  v-if="editorPromptType !== 'positive'"
                  class="flex flex-col gap-1.5"
                >
                  <Label
                    class="font-mono text-xs font-bold text-rose-400 uppercase"
                    >Negative Prompt</Label
                  >
                  <Textarea
                    v-model="editorNegative"
                    rows="3"
                    placeholder="Negative prompt text..."
                    class="bg-background font-mono text-xs"
                  />
                </div>
              </template>

              <!-- ── LORA FIELDS ── -->
              <template v-else-if="activeTab === 'loras'">
                <div class="flex flex-col gap-2">
                  <div class="flex items-center justify-between">
                    <Label class="text-foreground text-xs font-bold"
                      >LoRA Stack</Label
                    >
                    <span class="text-muted-foreground font-mono text-xs">
                      {{ editorLoras.length }} LoRA{{
                        editorLoras.length !== 1 ? 's' : ''
                      }}
                    </span>
                  </div>

                  <div
                    v-if="editorLoras.length === 0"
                    class="border-border text-muted-foreground rounded-lg border border-dashed p-4 text-center text-xs"
                  >
                    No LoRAs in stack. This entry will save an empty LoRA stack.
                  </div>

                  <div
                    v-else
                    class="border-border flex max-h-48 flex-col gap-1.5 overflow-y-auto rounded-lg border p-2"
                  >
                    <div
                      v-for="(lora, i) in editorLoras"
                      :key="i"
                      class="border-border bg-card/60 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
                    >
                      <span class="truncate font-mono">{{
                        lora.name || '(No model)'
                      }}</span>
                      <div class="flex shrink-0 items-center gap-2">
                        <span
                          class="rounded px-1.5 py-0.5 font-mono text-xs font-bold"
                          :class="
                            lora.enabled
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-muted text-muted-foreground'
                          "
                        >
                          {{ lora.enabled ? 'ON' : 'OFF' }}
                        </span>
                        <span
                          class="border-border bg-muted text-primary rounded border px-1.5 py-0.5 font-mono text-xs font-bold"
                        >
                          {{ lora.strength }}x
                        </span>
                      </div>
                    </div>
                  </div>

                  <p class="text-muted-foreground text-xs">
                    The LoRA stack above is pre-filled from your current
                    workflow. Edit from the workflow panel before saving.
                  </p>
                </div>
              </template>

              <!-- ── CHARACTER FIELDS ── -->
              <template v-else-if="activeTab === 'characters'">
                <div class="flex flex-col gap-1.5">
                  <Label class="text-foreground text-xs font-bold">
                    Trigger Tag <span class="text-destructive">*</span>
                  </Label>
                  <Input
                    v-model="editorCharTrigger"
                    placeholder="e.g. hatsune_miku"
                    class="font-mono text-xs"
                  />
                </div>

                <div class="flex flex-col gap-1.5">
                  <Label class="text-foreground text-xs font-bold"
                    >Series / Copyright</Label
                  >
                  <Input
                    v-model="editorCharSeries"
                    placeholder="e.g. Vocaloid"
                    class="text-xs"
                  />
                </div>

                <div class="flex flex-col gap-1.5">
                  <Label class="text-foreground text-xs font-bold">
                    Additional Tags
                  </Label>
                  <Textarea
                    v-model="editorCharTags"
                    rows="3"
                    placeholder="long hair, blue hair, twin tails, teal eyes, detached sleeves, ..."
                    class="bg-background font-mono text-xs"
                  />
                  <p class="text-muted-foreground text-xs">
                    Include clothing, hair, eyes, accessories — the more
                    complete the better.
                  </p>
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div class="flex flex-col gap-1.5">
                    <Label class="text-foreground text-xs font-bold"
                      >Source</Label
                    >
                    <Select v-model="editorCharSource">
                      <SelectTrigger class="h-8 w-full text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="local"
                            >Local (manually entered)</SelectItem
                          >
                          <SelectItem value="animadex"
                            >Imported from Animadex</SelectItem
                          >
                          <SelectItem value="manual"
                            >Manual verification</SelectItem
                          >
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div class="flex flex-col gap-1.5">
                    <Label class="text-foreground text-xs font-bold"
                      >Animadex Slug</Label
                    >
                    <Input
                      v-model="editorCharAnimadexSlug"
                      placeholder="e.g. hatsune-miku"
                      class="font-mono text-xs"
                    />
                  </div>
                </div>
              </template>
            </div>

            <!-- Right (1 col): Portrait Thumbnail Box -->
            <div class="flex flex-col gap-2 md:col-span-1">
              <Label class="text-foreground text-xs font-bold">Thumbnail</Label>
              <div
                class="border-border hover:border-primary/50 bg-muted/20 relative flex aspect-3/4 w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed transition-colors"
                @click="pickThumbnail"
                @dragover.prevent
                @drop.prevent="handleThumbnailDrop"
              >
                <img
                  v-if="editorThumbnailPreview"
                  :src="editorThumbnailPreview"
                  alt="Thumbnail preview"
                  class="h-full w-full object-cover object-center"
                />
                <div
                  v-else
                  class="flex flex-col items-center gap-2 p-4 text-center"
                >
                  <div
                    class="bg-muted text-muted-foreground flex h-10 w-10 items-center justify-center rounded-full"
                  >
                    <ImageIcon class="h-5 w-5 opacity-60" />
                  </div>
                  <div>
                    <p class="text-foreground text-xs font-semibold">
                      Drop portrait image
                    </p>
                    <p class="text-muted-foreground mt-0.5 text-xs">
                      or click to browse
                    </p>
                  </div>
                  <span
                    class="border-border bg-muted/60 text-muted-foreground mt-1 rounded px-2 py-0.5 font-mono text-xs"
                  >
                    3:4 / Portrait
                  </span>
                </div>
                <button
                  v-if="editorThumbnailPreview"
                  type="button"
                  class="absolute top-2 right-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black/90"
                  title="Remove thumbnail"
                  @click.stop="
                    editorThumbnailId = '';
                    editorThumbnailPreview = '';
                  "
                >
                  <X class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter
          class="border-border bg-muted/30 flex shrink-0 items-center justify-between border-t px-5 py-3 sm:justify-between"
        >
          <div>
            <Button
              v-if="editorMode === 'edit'"
              variant="ghost"
              size="default"
              class="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 gap-1 px-2.5 text-xs"
              @click="requestDeleteFromEditor"
            >
              <Trash2 class="h-3.5 w-3.5" />
              <span>Delete</span>
            </Button>
          </div>
          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              size="default"
              class="text-xs"
              @click="isEditorOpen = false"
            >
              Cancel
            </Button>
            <Button
              size="default"
              class="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs font-semibold"
              :disabled="!editorName.trim() || editorIsSaving"
              @click="handleSave"
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ---------------------------------------------------------------
         Delete Confirmation Dialog
    --------------------------------------------------------------- -->
    <AlertDialog
      :open="isDeleteDialogOpen"
      @update:open="(v) => (isDeleteDialogOpen = v)"
    >
      <AlertDialogContent class="border-border bg-card sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle class="text-foreground text-base font-bold">
            Delete Preset?
          </AlertDialogTitle>
          <AlertDialogDescription class="text-muted-foreground leading-relaxed">
            Are you sure you want to delete
            <span class="text-foreground font-semibold"
              >"{{ itemToDelete?.name }}"</span
            >? This will permanently remove this item from your
            {{ itemToDelete?.category ?? 'preset' }} library.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter class="gap-2 sm:gap-2">
          <AlertDialogCancel> Cancel </AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold"
            :disabled="isDeleting"
            @click="confirmDelete"
          >
            <Loader2
              v-if="isDeleting"
              class="mr-1.5 h-3.5 w-3.5 animate-spin"
            />
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
