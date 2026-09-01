<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  Bookmark,
  FolderOpen,
  Layers,
  RefreshCw,
  Search,
  Sparkles,
  X
} from '@lucide/vue';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { Textarea } from '@/components/ui/textarea';
import PromptPresetDialog from '../common/PromptPresetDialog.vue';
import WorkflowField from './WorkflowField.vue';
import { ComfyApi, type AutocompleteItem } from '../../services/comfyApi';
import {
  getPromptTokenRange,
  replacePromptToken,
  type PromptTokenRange
} from '../../services/promptAutocomplete';
import { useLauncherStore } from '../../stores/launcherStore';
import { useComfyStore } from '../../stores/comfyStore';
import { usePromptSuggestionStore } from '../../stores/promptSuggestionStore';
import { useWorkflowStore } from '../../stores/workflowStore';

const workflowStore = useWorkflowStore();
const launcherStore = useLauncherStore();
const comfyStore = useComfyStore();
const promptSuggestionStore = usePromptSuggestionStore();
type PromptField = 'positive' | 'negative';
type TextareaRef = { $el: HTMLTextAreaElement };

const isPresetDialogOpen = ref(false);
const positiveTextarea = ref<TextareaRef>();
const negativeTextarea = ref<TextareaRef>();
const suggestions = ref<AutocompleteItem[]>([]);
const activeIndex = ref(0);
const activeField = ref<PromptField>();
let activeRange: PromptTokenRange | null = null;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchController: AbortController | undefined;

// Prompt library state
const selectedCategory = ref<string>('all');
const tagSearchQuery = ref<string>('');
const lastPositiveCursorPos = ref<number | null>(null);

const categoryNames: Record<number, string> = {
  0: 'General',
  1: 'Artist',
  3: 'Copyright',
  4: 'Character',
  5: 'Meta'
};

function updatePositiveCursor(event: Event) {
  const el = event.target as HTMLTextAreaElement;
  if (el) {
    lastPositiveCursorPos.value = el.selectionStart;
  }
}

function handlePositiveInput(event: Event) {
  scheduleAutocomplete('positive', event);
  updatePositiveCursor(event);
}

function handlePositiveBlur(event: Event) {
  closeAutocompleteAfterBlur();
  updatePositiveCursor(event);
}

function closeAutocomplete() {
  suggestions.value = [];
  activeField.value = undefined;
}

function closeAutocompleteAfterBlur() {
  setTimeout(closeAutocomplete, 120);
}

function scheduleAutocomplete(field: PromptField, event: Event) {
  clearTimeout(searchTimer);
  searchController?.abort();
  if (
    !launcherStore.config.autocompleteEnabled ||
    !comfyStore.isConnected ||
    !comfyStore.isYetEssentialAvailable
  ) {
    return closeAutocomplete();
  }

  const input = event.target as HTMLTextAreaElement;
  const range = getPromptTokenRange(input.value, input.selectionStart);
  if (!range) return closeAutocomplete();
  activeRange = range;
  searchTimer = setTimeout(async () => {
    searchController = new AbortController();
    try {
      const items = await ComfyApi.searchTags(
        launcherStore.config.serverUrl,
        range.query,
        launcherStore.config.autocompleteLimit,
        range.mode,
        searchController.signal
      );
      suggestions.value = items;
      activeIndex.value = 0;
      activeField.value = items.length > 0 ? field : undefined;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        closeAutocomplete();
      }
    }
  }, 160);
}

function selectSuggestion(field: PromptField, item: AutocompleteItem) {
  if (!activeRange) return;
  const input =
    field === 'positive'
      ? positiveTextarea.value?.$el
      : negativeTextarea.value?.$el;
  if (!input) return;
  const current =
    field === 'positive'
      ? workflowStore.positivePrompt
      : workflowStore.negativePrompt;
  const result = replacePromptToken(
    current,
    activeRange,
    item.insert_text,
    launcherStore.config.autocompleteReplaceUnderscores,
    launcherStore.config.autocompleteIncludeArtistPrefix
  );
  input.select();
  document.execCommand('insertText', false, result.text);
  if (field === 'positive') lastPositiveCursorPos.value = result.cursor;
  closeAutocomplete();
  void nextTick(() => {
    input.focus();
    input.setSelectionRange(result.cursor, result.cursor);
  });
}

function handleAutocompleteKeydown(field: PromptField, event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (activeField.value !== field || suggestions.value.length === 0) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    activeIndex.value =
      (activeIndex.value + direction + suggestions.value.length) %
      suggestions.value.length;
  } else if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault();
    selectSuggestion(field, suggestions.value[activeIndex.value]);
  } else if (event.key === 'Escape') {
    closeAutocomplete();
  }
}

function formatPostCount(count: number) {
  return count >= 1000
    ? `${(count / 1000).toFixed(1).replace(/\.0$/u, '')}k`
    : count;
}

function autocompleteMeta(item: AutocompleteItem) {
  const count = formatPostCount(item.total_post);
  return item.kind === 'wildcard'
    ? `${count} entries · Wildcard`
    : `${count} · ${categoryNames[Number(item.category)] ?? 'Other'}`;
}

const quickTags = [
  'masterpiece',
  'best quality',
  '1girl',
  'scenery',
  'cinematic lighting',
  'volumetric lighting',
  'intricate details',
  'depth of field'
];

function insertTagAtCursor(tag: string) {
  const current = workflowStore.positivePrompt;
  const el = positiveTextarea.value?.$el;

  let pos =
    el && document.activeElement === el
      ? el.selectionStart
      : (lastPositiveCursorPos.value ?? current.length);

  pos = Math.max(0, Math.min(pos, current.length));

  const before = current.slice(0, pos);
  const after = current.slice(pos);

  let prefix = '';
  if (before.length > 0) {
    const trimmedBefore = before.trimEnd();
    if (trimmedBefore.endsWith(',')) {
      prefix = ' ';
    } else {
      prefix = ', ';
    }
  }

  let suffix = '';
  if (after.length > 0) {
    const trimmedAfter = after.trimStart();
    if (!trimmedAfter.startsWith(',')) {
      suffix = ', ';
    }
  }

  const insertion = `${prefix}${tag}${suffix}`;
  workflowStore.positivePrompt = before + insertion + after;

  const newCursor = pos + prefix.length + tag.length;
  lastPositiveCursorPos.value = newCursor;

  void nextTick(() => {
    if (el) {
      el.focus();
      el.setSelectionRange(newCursor, newCursor);
    }
  });
}

watch(
  () => promptSuggestionStore.categories,
  (newCats) => {
    if (
      selectedCategory.value !== 'all' &&
      !newCats.some((c) => c.id === selectedCategory.value)
    ) {
      selectedCategory.value = 'all';
    }
  }
);

const filteredCategories = computed(() => {
  const allCats = promptSuggestionStore.categories;
  const query = tagSearchQuery.value.trim().toLowerCase();
  if (!query) {
    if (selectedCategory.value === 'all') {
      return allCats;
    }
    return allCats.filter((c) => c.id === selectedCategory.value);
  }

  return allCats
    .map((cat) => ({
      ...cat,
      tags: (cat.tags ?? []).filter((t) => t.toLowerCase().includes(query))
    }))
    .filter((cat) => cat.tags.length > 0);
});

function formatPrompt() {
  if (!workflowStore.positivePrompt) return;
  const cleaned = workflowStore.positivePrompt
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .join(', ');
  workflowStore.positivePrompt = cleaned;
}

const positiveTokenCount = computed(() => {
  if (!workflowStore.positivePrompt.trim()) return '0/75';
  const tokens = workflowStore.positivePrompt
    .split(/[\s,]+/u)
    .filter(Boolean).length;
  return `${tokens}/75`;
});

const negativeTokenCount = computed(() => {
  if (!workflowStore.negativePrompt.trim()) return '0/75';
  const tokens = workflowStore.negativePrompt
    .split(/[\s,]+/u)
    .filter(Boolean).length;
  return `${tokens}/75`;
});
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Positive Prompt -->
    <WorkflowField label="Positive Prompt">
      <template #action>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 text-xs font-medium tracking-wide uppercase transition-colors"
            title="Prompt Presets (Save/Load to File)"
            @click="isPresetDialogOpen = true"
          >
            <Bookmark class="text-primary h-3 w-3" />
            <span>Presets</span>
          </button>
          <span class="text-border">|</span>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 text-xs font-medium tracking-wide uppercase transition-colors"
            @click="formatPrompt"
          >
            <Sparkles class="text-primary h-3 w-3" />
            <span>Format</span>
          </button>
          <span class="text-border">|</span>
          <button
            type="button"
            class="text-muted-foreground/70 hover:text-foreground cursor-pointer text-xs font-medium transition-colors"
            @click="workflowStore.positivePrompt = ''"
          >
            Clear
          </button>
        </div>
      </template>

      <div class="relative">
        <Textarea
          ref="positiveTextarea"
          v-model="workflowStore.positivePrompt"
          rows="4"
          placeholder="Describe the image you want to generate..."
          class="w-full pb-6 font-mono text-xs leading-relaxed"
          @input="handlePositiveInput"
          @click="updatePositiveCursor"
          @keyup="updatePositiveCursor"
          @select="updatePositiveCursor"
          @keydown="handleAutocompleteKeydown('positive', $event)"
          @blur="handlePositiveBlur"
        />
        <span
          class="text-muted-foreground pointer-events-none absolute right-2.5 bottom-1.5 font-mono text-xs"
        >
          {{ positiveTokenCount }}
        </span>
        <div
          v-if="activeField === 'positive'"
          role="listbox"
          class="border-border bg-popover absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-md border p-1 shadow-lg"
        >
          <button
            v-for="(item, index) in suggestions"
            :key="`${item.label}-${item.category}`"
            type="button"
            role="option"
            :aria-selected="index === activeIndex"
            class="flex w-full cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-left font-mono text-xs"
            :class="
              index === activeIndex
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent/60'
            "
            @mousedown.prevent
            @click="selectSuggestion('positive', item)"
          >
            <span>{{ item.label }}</span>
            <span class="text-muted-foreground ml-3 text-xs">
              {{ autocompleteMeta(item) }}
            </span>
          </button>
        </div>
      </div>

      <!-- Quick Favorites Tag Buttons -->
      <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
        <span class="text-muted-foreground text-xs font-semibold">Quick:</span>
        <button
          v-for="tag in quickTags"
          :key="tag"
          type="button"
          class="border-border bg-muted/60 text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-foreground cursor-pointer rounded border px-2 py-0.5 font-mono text-xs transition-all select-none active:scale-95"
          title="Click to insert at cursor"
          @mousedown.prevent
          @click="insertTagAtCursor(tag)"
        >
          + {{ tag }}
        </button>
      </div>

      <!-- Categorized Prompt Library Accordion -->
      <div class="pt-1">
        <Accordion type="single" collapsible class="w-full">
          <AccordionItem
            value="prompt-categories"
            class="border-border/60 bg-card/40 rounded-lg border"
          >
            <AccordionTrigger
              class="hover:bg-accent/40 rounded-lg px-2.5 py-1.5 hover:no-underline"
            >
              <div class="flex items-center gap-2">
                <Layers class="text-primary h-3.5 w-3.5" />
                <span class="text-xs font-semibold tracking-wide">
                  Prompt Library Categories
                </span>
                <span class="text-muted-foreground font-mono text-xs">
                  ({{ promptSuggestionStore.categories.length }} categories)
                </span>
              </div>
            </AccordionTrigger>

            <AccordionContent class="flex flex-col gap-2.5 px-2.5 pt-1 pb-2.5">
              <!-- Search, Folder & Reload Controls -->
              <div class="border-border/50 flex flex-col gap-1.5 border-b pb-2">
                <!-- Search Input Row with Folder & Reload Actions -->
                <div class="flex items-center gap-1.5">
                  <div class="relative flex-1">
                    <Search
                      class="text-muted-foreground absolute top-2 left-2 h-3.5 w-3.5"
                    />
                    <input
                      v-model="tagSearchQuery"
                      type="text"
                      placeholder="Search prompt tags..."
                      class="border-border bg-background placeholder:text-muted-foreground/60 focus:border-primary h-8 w-full rounded-md border pr-7 pl-8 font-mono text-xs outline-none"
                    />
                    <button
                      v-if="tagSearchQuery"
                      type="button"
                      class="text-muted-foreground hover:text-foreground absolute top-2 right-2 cursor-pointer"
                      @click="tagSearchQuery = ''"
                    >
                      <X class="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <!-- Open Folder & Reload Buttons -->
                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      class="border-border bg-secondary/80 text-muted-foreground hover:text-foreground hover:border-primary/40 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors"
                      title="Open prompt suggestions JSON folder in File Explorer"
                      @click="promptSuggestionStore.openFolder()"
                    >
                      <FolderOpen class="text-primary h-3.5 w-3.5" />
                      <span class="hidden font-mono sm:inline">Folder</span>
                    </button>
                    <button
                      type="button"
                      class="border-border bg-secondary/80 text-muted-foreground hover:text-foreground hover:border-primary/40 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border text-xs font-medium transition-colors"
                      :title="
                        promptSuggestionStore.isLoading
                          ? 'Reloading...'
                          : 'Reload prompt suggestions JSON files'
                      "
                      :disabled="promptSuggestionStore.isLoading"
                      @click="promptSuggestionStore.reload()"
                    >
                      <RefreshCw
                        class="h-3.5 w-3.5"
                        :class="{
                          'animate-spin': promptSuggestionStore.isLoading
                        }"
                      />
                    </button>
                  </div>
                </div>

                <!-- Category Pills Bar -->
                <div class="flex flex-wrap items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    class="cursor-pointer rounded px-2.5 py-1 font-mono text-xs font-medium transition-colors select-none"
                    :class="
                      selectedCategory === 'all' && !tagSearchQuery
                        ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
                        : 'border-border/60 bg-secondary/80 text-muted-foreground hover:text-foreground border'
                    "
                    @click="
                      selectedCategory = 'all';
                      tagSearchQuery = '';
                    "
                  >
                    All
                  </button>
                  <button
                    v-for="cat in promptSuggestionStore.categories"
                    :key="cat.id"
                    type="button"
                    class="cursor-pointer rounded px-2.5 py-1 font-mono text-xs font-medium transition-colors select-none"
                    :class="
                      selectedCategory === cat.id && !tagSearchQuery
                        ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
                        : 'border-border/60 bg-secondary/80 text-muted-foreground hover:text-foreground border'
                    "
                    @click="
                      selectedCategory = cat.id;
                      tagSearchQuery = '';
                    "
                  >
                    {{ cat.name }}
                  </button>
                </div>
              </div>

              <!-- Tags Container Grouped by Category -->
              <div class="flex max-h-56 flex-col gap-3 overflow-y-auto pr-1">
                <div
                  v-for="cat in filteredCategories"
                  :key="cat.id"
                  class="flex flex-col gap-1.5"
                >
                  <span
                    class="text-muted-foreground text-xs font-bold tracking-wider uppercase"
                  >
                    {{ cat.name }}
                  </span>
                  <div class="flex flex-wrap gap-1.5">
                    <button
                      v-for="tag in cat.tags"
                      :key="tag"
                      type="button"
                      class="border-border/80 bg-secondary/70 text-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-primary inline-flex cursor-pointer items-center rounded-md border px-2 py-0.5 font-mono text-xs transition-all select-none active:scale-95"
                      title="Click to insert at cursor position"
                      @mousedown.prevent
                      @click="insertTagAtCursor(tag)"
                    >
                      + {{ tag }}
                    </button>
                  </div>
                </div>

                <div
                  v-if="filteredCategories.length === 0"
                  class="text-muted-foreground py-3 text-center font-mono text-xs"
                >
                  No tags match "{{ tagSearchQuery }}"
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </WorkflowField>

    <!-- Negative Prompt -->
    <WorkflowField label="Negative Prompt">
      <template #action>
        <button
          type="button"
          class="text-muted-foreground/70 hover:text-foreground cursor-pointer text-xs font-medium transition-colors"
          @click="workflowStore.negativePrompt = ''"
        >
          Clear
        </button>
      </template>

      <div class="relative">
        <Textarea
          ref="negativeTextarea"
          v-model="workflowStore.negativePrompt"
          rows="3"
          placeholder="Things to avoid in the generation..."
          class="mt-1 w-full pb-6 font-mono text-xs leading-relaxed"
          @input="scheduleAutocomplete('negative', $event)"
          @keydown="handleAutocompleteKeydown('negative', $event)"
          @blur="closeAutocompleteAfterBlur"
        />
        <span
          class="text-muted-foreground pointer-events-none absolute right-2.5 bottom-1.5 font-mono text-xs"
        >
          {{ negativeTokenCount }}
        </span>
        <div
          v-if="activeField === 'negative'"
          role="listbox"
          class="border-border bg-popover absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-md border p-1 shadow-lg"
        >
          <button
            v-for="(item, index) in suggestions"
            :key="`${item.label}-${item.category}`"
            type="button"
            role="option"
            :aria-selected="index === activeIndex"
            class="flex w-full cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-left font-mono text-xs"
            :class="
              index === activeIndex
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent/60'
            "
            @mousedown.prevent
            @click="selectSuggestion('negative', item)"
          >
            <span>{{ item.label }}</span>
            <span class="text-muted-foreground ml-3 text-xs">
              {{ autocompleteMeta(item) }}
            </span>
          </button>
        </div>
      </div>
    </WorkflowField>

    <!-- Prompt Preset Manager Dialog -->
    <PromptPresetDialog v-model:open="isPresetDialogOpen" />
  </div>
</template>
