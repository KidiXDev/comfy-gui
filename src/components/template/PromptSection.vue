<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import {
  ArrowRightLeft,
  Bookmark,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Copyright,
  Dices,
  FolderOpen,
  HelpCircle,
  Layers,
  Palette,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Tags,
  Trash2,
  User,
  X
} from '@lucide/vue';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { vDraggable } from 'vue-draggable-plus';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import PromptPresetDialog from '../common/PromptPresetDialog.vue';
import PromptEnhanceDialog from './PromptEnhanceDialog.vue';
import WorkflowField from './WorkflowField.vue';
import { ComfyApi, type AutocompleteItem } from '../../services/comfyApi';
import {
  getPromptTokenRange,
  replacePromptToken,
  type PromptTokenRange
} from '../../services/promptAutocomplete';
import {
  adjustPromptWeight,
  estimateClipTokens,
  formatAndCleanPrompt,
  parsePromptToChips,
  reconstructPromptFromChips,
  type PromptTag
} from '../../utils/promptTools';
import { useLauncherStore } from '../../stores/launcherStore';
import { useComfyStore } from '../../stores/comfyStore';
import { usePromptSuggestionStore } from '../../stores/promptSuggestionStore';
import { useWorkflowStore } from '../../stores/workflowStore';
import { loadAppData, saveAppData } from '../../services/appStorage';

const workflowStore = useWorkflowStore();
const launcherStore = useLauncherStore();
const comfyStore = useComfyStore();
const promptSuggestionStore = usePromptSuggestionStore();

type PromptField = 'positive' | 'negative';
type TextareaRef = { $el: HTMLTextAreaElement };
type PromptTextareaSizes = Record<PromptField, number>;

const TEXTAREA_SIZES_KEY = 'prompt_textarea_sizes';
const defaultTextareaSizes: PromptTextareaSizes = {
  positive: 96,
  negative: 80
};
const textareaSizes = ref<Partial<PromptTextareaSizes>>({});

async function loadTextareaSizes() {
  try {
    const saved =
      await loadAppData<Partial<PromptTextareaSizes>>(TEXTAREA_SIZES_KEY);
    if (!saved) return;
    for (const field of ['positive', 'negative'] as const) {
      const height = saved[field];
      if (typeof height === 'number' && height > 0) {
        textareaSizes.value[field] = height;
      }
    }
  } catch (error) {
    console.warn('Failed to load prompt textarea sizes:', error);
  }
}

onMounted(loadTextareaSizes);

function saveTextareaSize(field: PromptField, event: PointerEvent) {
  const height = Math.round(
    (event.currentTarget as HTMLTextAreaElement).getBoundingClientRect().height
  );
  if (height === (textareaSizes.value[field] ?? defaultTextareaSizes[field])) {
    return;
  }
  textareaSizes.value[field] = height;
  void saveAppData(TEXTAREA_SIZES_KEY, textareaSizes.value).catch((error) =>
    console.error('Failed to save prompt textarea sizes:', error)
  );
}

const isPresetDialogOpen = ref(false);
const isEnhanceDialogOpen = ref(false);
const enhanceTarget = ref<'positive' | 'negative'>('positive');

function openEnhanceDialog(target: 'positive' | 'negative') {
  enhanceTarget.value = target;
  isEnhanceDialogOpen.value = true;
}

function handleEnhanceApply(payload: {
  mode: 'replace' | 'append';
  text: string;
  target: 'positive' | 'negative';
}) {
  if (payload.target === 'positive') {
    if (payload.mode === 'replace') {
      workflowStore.positivePrompt = payload.text;
    } else {
      workflowStore.positivePrompt = workflowStore.positivePrompt
        ? `${workflowStore.positivePrompt.replace(/,\s*$/u, '')}, ${payload.text}`
        : payload.text;
    }
  } else if (payload.mode === 'replace') {
    workflowStore.negativePrompt = payload.text;
  } else {
    workflowStore.negativePrompt = workflowStore.negativePrompt
      ? `${workflowStore.negativePrompt.replace(/,\s*$/u, '')}, ${payload.text}`
      : payload.text;
  }
}

const positiveTextarea = ref<TextareaRef>();
const negativeTextarea = ref<TextareaRef>();
const suggestions = ref<AutocompleteItem[]>([]);
const activeIndex = ref(0);
const activeField = ref<PromptField>();
let activeRange: PromptTokenRange | null = null;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchController: AbortController | undefined;

// View modes
const isPositiveChipsMode = ref(false);
const isNegativeChipsMode = ref(false);
const positiveChips = ref<PromptTag[]>([]);
const negativeChips = ref<PromptTag[]>([]);
const newPositiveTagInput = ref('');
const newNegativeTagInput = ref('');

// Copy feedback states
const copiedPositive = ref(false);
const copiedNegative = ref(false);

// Prompt library state
const libraryTarget = ref<PromptField>('positive');
const selectedCategory = ref<string>('all');
const tagSearchQuery = ref<string>('');
const lastPositiveCursorPos = ref<number | null>(null);
const lastNegativeCursorPos = ref<number | null>(null);

const categoryNames: Record<number, string> = {
  0: 'General',
  1: 'Artist',
  3: 'Copyright',
  4: 'Character',
  5: 'Meta'
};

const categoryBadgeStyles: Record<number, string> = {
  0: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  1: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  3: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  4: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  5: 'bg-slate-500/10 text-slate-400 border-slate-500/30'
};

function getCategoryIcon(item: AutocompleteItem) {
  if (item.kind === 'wildcard') return Dices;
  switch (Number(item.category)) {
    case 0:
      return Tag;
    case 1:
      return Palette;
    case 3:
      return Copyright;
    case 4:
      return User;
    case 5:
      return Code2;
    default:
      return Tag;
  }
}

function getCategoryName(item: AutocompleteItem) {
  if (item.kind === 'wildcard') return 'Wildcard';
  return categoryNames[Number(item.category)] ?? 'Tag';
}

function getCategoryBadgeStyle(item: AutocompleteItem) {
  if (item.kind === 'wildcard') {
    return 'bg-pink-500/10 text-pink-400 border-pink-500/30';
  }
  return (
    categoryBadgeStyles[Number(item.category)] ||
    'bg-muted text-muted-foreground border-border'
  );
}

// Negative prompt bundle presets
const negativePresets = [
  {
    name: 'Standard Quality',
    description: 'General quality fixes, bad anatomy & blur',
    prompt:
      'worst quality, low quality, normal quality, lowres, blurry, bad anatomy, bad hands, missing fingers, extra digit, fewer digits'
  },
  {
    name: 'Anime / 2D Focus',
    description: 'Anime anatomy, bad eyes & proportions',
    prompt:
      'worst quality, low quality, blurry, bad proportions, bad eyes, extra limbs, extra arms, bad anatomy, deformed'
  },
  {
    name: 'Photorealistic / 3D',
    description: 'Avoid 3D CGI look, bad lighting & renders',
    prompt:
      'worst quality, low quality, 3d render, cartoon, illustration, drawing, painting, bad lighting, watermark, signature'
  },
  {
    name: 'Light / Minimal',
    description: 'Minimal cleanup, allows natural textures',
    prompt: 'worst quality, low quality, blurry, text, watermark'
  }
];

const positiveQuickGroups = [
  {
    label: 'Quality',
    tags: ['masterpiece', 'best quality', 'highly detailed', '8k resolution']
  },
  {
    label: 'Subject',
    tags: ['1girl', 'solo', 'scenery', 'close up', 'portrait']
  },
  {
    label: 'Lighting',
    tags: [
      'cinematic lighting',
      'volumetric lighting',
      'soft light',
      'sunlight'
    ]
  },
  {
    label: 'Style',
    tags: ['anime', 'photorealistic', 'digital art', 'depth of field']
  }
];

const negativeQuickTags = [
  'worst quality',
  'low quality',
  'blurry',
  'bad anatomy',
  'bad hands',
  'missing fingers',
  'extra digits',
  'watermark',
  'signature',
  'deformed',
  'mutated'
];

const selectedQuickGroup = ref(0);

// Watch for chips sync
watch(
  () => workflowStore.positivePrompt,
  (val) => {
    if (isPositiveChipsMode.value) {
      const currentReconstructed = reconstructPromptFromChips(
        positiveChips.value
      );
      if (currentReconstructed === val) return;
      positiveChips.value = parsePromptToChips(val);
    }
  }
);

watch(
  () => workflowStore.negativePrompt,
  (val) => {
    if (isNegativeChipsMode.value) {
      const currentReconstructed = reconstructPromptFromChips(
        negativeChips.value
      );
      if (currentReconstructed === val) return;
      negativeChips.value = parsePromptToChips(val);
    }
  }
);

function togglePositiveChipsMode() {
  isPositiveChipsMode.value = !isPositiveChipsMode.value;
  if (isPositiveChipsMode.value) {
    if (positiveChips.value.length > 0) {
      const reconstructed = reconstructPromptFromChips(positiveChips.value);
      if (reconstructed === workflowStore.positivePrompt) {
        // Prompt was not changed in text mode; preserve existing chips with disabled state
        return;
      }
    }
    positiveChips.value = parsePromptToChips(workflowStore.positivePrompt);
  }
}

function toggleNegativeChipsMode() {
  isNegativeChipsMode.value = !isNegativeChipsMode.value;
  if (isNegativeChipsMode.value) {
    if (negativeChips.value.length > 0) {
      const reconstructed = reconstructPromptFromChips(negativeChips.value);
      if (reconstructed === workflowStore.negativePrompt) {
        // Prompt was not changed in text mode; preserve existing chips with disabled state
        return;
      }
    }
    negativeChips.value = parsePromptToChips(workflowStore.negativePrompt);
  }
}

function syncPositiveChipsToStore() {
  workflowStore.positivePrompt = reconstructPromptFromChips(
    positiveChips.value
  );
}

function syncNegativeChipsToStore() {
  workflowStore.negativePrompt = reconstructPromptFromChips(
    negativeChips.value
  );
}

function toggleChipDisabled(isPositive: boolean, index: number) {
  const chips = isPositive ? positiveChips.value : negativeChips.value;
  const chip = chips[index];
  if (chip) {
    chip.disabled = !chip.disabled;
    if (isPositive) syncPositiveChipsToStore();
    else syncNegativeChipsToStore();
  }
}

function removeChip(chips: PromptTag[], index: number, isPositive: boolean) {
  chips.splice(index, 1);
  if (isPositive) syncPositiveChipsToStore();
  else syncNegativeChipsToStore();
}

function addNewChip(isPositive: boolean) {
  const rawInput = isPositive
    ? newPositiveTagInput.value
    : newNegativeTagInput.value;
  if (!rawInput.trim()) return;

  const newChips = parsePromptToChips(rawInput);
  if (newChips.length > 0) {
    if (isPositive) {
      positiveChips.value.push(...newChips);
      newPositiveTagInput.value = '';
      syncPositiveChipsToStore();
    } else {
      negativeChips.value.push(...newChips);
      newNegativeTagInput.value = '';
      syncNegativeChipsToStore();
    }
  }
}

function updateCursor(field: PromptField, event: Event) {
  const el = event.target as HTMLTextAreaElement;
  if (el) {
    if (field === 'positive') lastPositiveCursorPos.value = el.selectionStart;
    else lastNegativeCursorPos.value = el.selectionStart;
  }
}

function handleInput(field: PromptField, event: Event) {
  scheduleAutocomplete(field, event);
  updateCursor(field, event);
}

function handleBlur(field: PromptField, event: Event) {
  closeAutocompleteAfterBlur();
  updateCursor(field, event);
}

function closeAutocomplete() {
  suggestions.value = [];
  activeField.value = undefined;
}

function closeAutocompleteAfterBlur() {
  setTimeout(closeAutocomplete, 150);
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
  }, 140);
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
  else lastNegativeCursorPos.value = result.cursor;
  closeAutocomplete();
  void nextTick(() => {
    input.focus();
    input.setSelectionRange(result.cursor, result.cursor);
  });
}

/**
 * Handles keyboard navigation & shortcut weight editing (Ctrl+Up / Ctrl+Down).
 */
function handleKeydown(field: PromptField, event: KeyboardEvent) {
  const isCtrlOrMeta = event.ctrlKey || event.metaKey;
  const isAlt = event.altKey;
  const isWeightModifier = isCtrlOrMeta || isAlt;

  // 1. Hotkey: Weight increase / decrease with Ctrl+Up / Ctrl+Down or Alt+Up / Alt+Down
  if (
    isWeightModifier &&
    (event.key === 'ArrowUp' || event.key === 'ArrowDown')
  ) {
    event.preventDefault();
    const input =
      field === 'positive'
        ? positiveTextarea.value?.$el
        : negativeTextarea.value?.$el;
    if (!input) return;

    const delta = event.key === 'ArrowUp' ? 0.05 : -0.05;
    const current =
      field === 'positive'
        ? workflowStore.positivePrompt
        : workflowStore.negativePrompt;

    const result = adjustPromptWeight(
      current,
      input.selectionStart,
      input.selectionEnd,
      delta
    );

    if (field === 'positive') {
      workflowStore.positivePrompt = result.text;
      lastPositiveCursorPos.value = result.selectionEnd;
    } else {
      workflowStore.negativePrompt = result.text;
      lastNegativeCursorPos.value = result.selectionEnd;
    }

    void nextTick(() => {
      input.focus();
      input.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
    return;
  }

  // 2. Autocomplete suggestions navigation
  if (
    !isCtrlOrMeta &&
    !isAlt &&
    activeField.value === field &&
    suggestions.value.length > 0
  ) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      activeIndex.value =
        (activeIndex.value + direction + suggestions.value.length) %
        suggestions.value.length;
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      const chosen = suggestions.value[activeIndex.value];
      if (chosen) {
        event.preventDefault();
        selectSuggestion(field, chosen);
      }
    } else if (event.key === 'Escape') {
      closeAutocomplete();
    }
  }
}

function formatPostCount(count: number) {
  return count >= 1000
    ? `${(count / 1000).toFixed(1).replace(/\.0$/u, '')}k`
    : count;
}

function autocompleteMeta(item: AutocompleteItem) {
  const count = formatPostCount(item.total_post);
  return item.kind === 'wildcard' ? `${count} entries` : `${count} posts`;
}

function insertTagAtCursor(tag: string, target: PromptField = 'positive') {
  const isPos = target === 'positive';
  const current = isPos
    ? workflowStore.positivePrompt
    : workflowStore.negativePrompt;
  const el = isPos ? positiveTextarea.value?.$el : negativeTextarea.value?.$el;

  const lastCursor = isPos
    ? lastPositiveCursorPos.value
    : lastNegativeCursorPos.value;
  let pos =
    el && document.activeElement === el
      ? el.selectionStart
      : (lastCursor ?? current.length);
  pos = Math.max(0, Math.min(pos, current.length));

  const before = current.slice(0, pos);
  const after = current.slice(pos);

  let prefix = '';
  if (before.length > 0) {
    const trimmedBefore = before.trimEnd();
    prefix = trimmedBefore.endsWith(',') ? ' ' : ', ';
  }

  let suffix = '';
  if (after.length > 0) {
    const trimmedAfter = after.trimStart();
    if (!trimmedAfter.startsWith(',')) {
      suffix = ', ';
    }
  }

  const insertion = `${prefix}${tag}${suffix}`;
  const newPrompt = before + insertion + after;

  if (isPos) workflowStore.positivePrompt = newPrompt;
  else workflowStore.negativePrompt = newPrompt;

  const newCursor = pos + prefix.length + tag.length;
  if (isPos) lastPositiveCursorPos.value = newCursor;
  else lastNegativeCursorPos.value = newCursor;

  void nextTick(() => {
    if (el) {
      el.focus();
      el.setSelectionRange(newCursor, newCursor);
    }
  });
}

function applyNegativePreset(presetPrompt: string) {
  if (workflowStore.negativePrompt.trim()) {
    // Append and format
    workflowStore.negativePrompt = formatAndCleanPrompt(
      `${workflowStore.negativePrompt}, ${presetPrompt}`
    );
  } else {
    workflowStore.negativePrompt = presetPrompt;
  }
}

function swapPrompts() {
  const temp = workflowStore.positivePrompt;
  workflowStore.positivePrompt = workflowStore.negativePrompt;
  workflowStore.negativePrompt = temp;
}

function formatPrompt(field: PromptField) {
  if (field === 'positive') {
    workflowStore.positivePrompt = formatAndCleanPrompt(
      workflowStore.positivePrompt
    );
  } else {
    workflowStore.negativePrompt = formatAndCleanPrompt(
      workflowStore.negativePrompt
    );
  }
}

async function copyPrompt(field: PromptField) {
  const text =
    field === 'positive'
      ? workflowStore.positivePrompt
      : workflowStore.negativePrompt;
  if (!text) return;
  await navigator.clipboard.writeText(text);
  if (field === 'positive') {
    copiedPositive.value = true;
    setTimeout(() => {
      copiedPositive.value = false;
    }, 1800);
  } else {
    copiedNegative.value = true;
    setTimeout(() => {
      copiedNegative.value = false;
    }, 1800);
  }
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
    if (selectedCategory.value === 'all') return allCats;
    return allCats.filter((c) => c.id === selectedCategory.value);
  }

  return allCats
    .map((cat) => ({
      ...cat,
      tags: (cat.tags ?? []).filter((t) => t.toLowerCase().includes(query))
    }))
    .filter((cat) => cat.tags.length > 0);
});

const positiveTokenInfo = computed(() =>
  estimateClipTokens(workflowStore.positivePrompt)
);
const negativeTokenInfo = computed(() =>
  estimateClipTokens(workflowStore.negativePrompt)
);
</script>

<template>
  <TooltipProvider>
    <div class="flex flex-col gap-3.5">
      <!-- 1. POSITIVE PROMPT SECTION -->
      <WorkflowField label="Positive Prompt">
        <template #action>
          <div class="flex items-center gap-1.5">
            <!-- Shortcut Tip Tooltip -->
            <Tooltip>
              <TooltipTrigger as-child>
                <button
                  type="button"
                  class="text-muted-foreground hover:text-foreground inline-flex cursor-help items-center gap-1 text-xs transition-colors"
                >
                  <HelpCircle class="h-3 w-3" />
                  <span>Shortcuts</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" class="max-w-xs p-2.5 text-xs">
                <div class="space-y-1.5">
                  <p class="text-primary font-semibold">Prompt Shortcuts</p>
                  <p
                    class="text-muted-foreground flex items-center justify-between gap-2"
                  >
                    <span>Adjust weight by ±0.05</span>
                    <kbd
                      class="bg-muted border-border text-foreground rounded border px-1.5 py-0.5 font-mono text-xs"
                      >Ctrl + Up/Down</kbd
                    >
                  </p>
                  <p
                    class="text-muted-foreground flex items-center justify-between gap-2"
                  >
                    <span>Insert suggestion</span>
                    <kbd
                      class="bg-muted border-border text-foreground rounded border px-1.5 py-0.5 font-mono text-xs"
                      >Tab / Enter</kbd
                    >
                  </p>
                  <p
                    class="text-muted-foreground flex items-center justify-between gap-2"
                  >
                    <span>Close suggestions</span>
                    <kbd
                      class="bg-muted border-border text-foreground rounded border px-1.5 py-0.5 font-mono text-xs"
                      >Esc</kbd
                    >
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>

            <span class="text-border">|</span>

            <!-- Presets Button -->
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

            <!-- Chips / Text Mode Toggle -->
            <button
              type="button"
              class="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 text-xs font-medium transition-colors"
              :class="{ 'text-primary font-semibold': isPositiveChipsMode }"
              :title="
                isPositiveChipsMode
                  ? 'Switch to Raw Text Editor'
                  : 'Switch to Interactive Tag Chips'
              "
              @click="togglePositiveChipsMode"
            >
              <Tags class="h-3 w-3" />
              <span>{{ isPositiveChipsMode ? 'Text' : 'Chips' }}</span>
            </button>

            <!-- AI Enhance Button -->
            <button
              type="button"
              class="text-primary hover:text-primary/80 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold transition-colors"
              title="Enhance prompt with AI"
              @click="openEnhanceDialog('positive')"
            >
              <Sparkles class="h-3 w-3" />
              <span>AI Enhance</span>
            </button>

            <span class="text-border">|</span>

            <!-- Format Button -->
            <button
              type="button"
              class="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 text-xs font-medium transition-colors"
              title="Clean formatting, fix commas, and deduplicate tags"
              @click="formatPrompt('positive')"
            >
              <Sparkles class="text-primary h-3 w-3" />
              <span>Format</span>
            </button>

            <span class="text-border">|</span>

            <!-- Copy Prompt Button -->
            <button
              type="button"
              class="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 text-xs font-medium transition-colors"
              title="Copy Positive Prompt to Clipboard"
              @click="copyPrompt('positive')"
            >
              <Check v-if="copiedPositive" class="h-3 w-3 text-emerald-400" />
              <Copy v-else class="h-3 w-3" />
            </button>

            <span class="text-border">|</span>

            <!-- Swap Prompts Button -->
            <button
              type="button"
              class="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 text-xs font-medium transition-colors"
              title="Swap Positive & Negative prompts"
              @click="swapPrompts"
            >
              <ArrowRightLeft class="h-3 w-3" />
            </button>

            <span class="text-border">|</span>

            <!-- Clear Button -->
            <button
              type="button"
              class="text-muted-foreground/70 hover:text-destructive inline-flex cursor-pointer items-center gap-1 text-xs font-medium transition-colors"
              title="Clear positive prompt"
              @click="workflowStore.positivePrompt = ''"
            >
              <Trash2 class="h-3 w-3" />
            </button>
          </div>
        </template>

        <!-- Positive Content: Either Textarea or Interactive Chips -->
        <div v-if="!isPositiveChipsMode" class="relative">
          <Textarea
            ref="positiveTextarea"
            v-model="workflowStore.positivePrompt"
            :rows="4"
            :style="{
              height: `${textareaSizes.positive ?? defaultTextareaSizes.positive}px`
            }"
            placeholder="Describe the image you want to generate... (Tip: Select tag and press Ctrl+Up/Down to adjust weight)"
            class="field-sizing-fixed min-h-24 w-full resize-y font-mono text-xs leading-relaxed"
            @input="handleInput('positive', $event)"
            @click="updateCursor('positive', $event)"
            @keyup="updateCursor('positive', $event)"
            @select="updateCursor('positive', $event)"
            @keydown="handleKeydown('positive', $event)"
            @blur="handleBlur('positive', $event)"
            @pointerup="saveTextareaSize('positive', $event)"
          />

          <!-- Autocomplete Floating Dropdown -->
          <div
            v-if="activeField === 'positive'"
            role="listbox"
            class="border-border bg-popover/95 absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border p-1 shadow-xl backdrop-blur-md"
          >
            <button
              v-for="(item, index) in suggestions"
              :key="`${item.label}-${item.category}`"
              type="button"
              role="option"
              :aria-selected="index === activeIndex"
              class="flex w-full cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-left font-mono text-xs transition-colors"
              :class="
                index === activeIndex
                  ? 'bg-primary/20 text-foreground border-primary/30 border font-semibold'
                  : 'hover:bg-accent/60 text-foreground'
              "
              @mousedown.prevent
              @click="selectSuggestion('positive', item)"
            >
              <div class="flex items-center gap-2 overflow-hidden">
                <span
                  class="flex h-5 w-5 shrink-0 items-center justify-center rounded border"
                  :class="getCategoryBadgeStyle(item)"
                  :title="getCategoryName(item)"
                >
                  <component :is="getCategoryIcon(item)" class="h-3 w-3" />
                </span>
                <span class="truncate">{{ item.label }}</span>
              </div>
              <span class="text-muted-foreground ml-3 shrink-0 text-xs">
                {{ autocompleteMeta(item) }}
              </span>
            </button>
          </div>
        </div>

        <!-- Interactive Tag Chips Mode -->
        <div
          v-else
          class="border-border bg-background flex max-h-128 min-h-28 resize-y flex-col justify-between gap-2.5 overflow-auto rounded-md border p-2.5"
        >
          <div
            v-draggable="[
              positiveChips,
              {
                animation: 200,
                ghostClass: 'ghost-chip',
                chosenClass: 'chosen-chip',
                dragClass: 'drag-chip',
                onEnd: syncPositiveChipsToStore
              }
            ]"
            class="flex flex-1 flex-wrap content-start items-start gap-1.5 overflow-y-auto pr-1"
          >
            <div
              v-for="(chip, idx) in positiveChips"
              :key="chip.id"
              class="group inline-flex shrink-0 cursor-grab items-center gap-1.5 self-start rounded-md border px-2 py-0.5 font-mono text-xs shadow-2xs transition-colors select-none active:cursor-grabbing"
              :class="[
                chip.disabled
                  ? 'border-border/40 bg-muted/30 text-muted-foreground/50 border-dashed line-through opacity-50'
                  : 'border-border/80 bg-secondary/80 text-foreground hover:border-primary/50'
              ]"
              @dblclick="toggleChipDisabled(true, idx)"
            >
              <span
                class="font-medium"
                :class="{ 'line-through': chip.disabled }"
                >{{ chip.text }}</span
              >

              <!-- Weight indicator badge -->
              <span
                v-if="chip.weight !== 1.0"
                class="py-0.2 rounded px-1 text-xs font-bold"
                :class="[
                  chip.disabled
                    ? 'bg-muted text-muted-foreground/40'
                    : chip.weight > 1.0
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-amber-500/20 text-amber-400'
                ]"
              >
                {{ chip.weight }}x
              </span>

              <!-- Remove tag button -->
              <button
                type="button"
                class="hover:bg-destructive/20 hover:text-destructive text-muted-foreground/60 ml-0.5 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded transition-colors hover:opacity-100"
                title="Remove tag"
                @click.stop="removeChip(positiveChips, idx, true)"
              >
                <X class="h-2.5 w-2.5" />
              </button>
            </div>

            <div
              v-if="positiveChips.length === 0"
              class="text-muted-foreground py-2 text-xs italic"
            >
              No prompt tags. Type in the input below to add tags.
            </div>
          </div>

          <!-- Add new tag chip bar -->
          <div class="border-border/40 flex items-center gap-1.5 border-t pt-2">
            <input
              v-model="newPositiveTagInput"
              type="text"
              placeholder="Type new tag(s) and press Enter..."
              class="border-border bg-secondary/50 focus:border-primary h-7 flex-1 rounded px-2 font-mono text-xs outline-none"
              @keydown.enter.prevent="addNewChip(true)"
            />
            <Button
              size="sm"
              variant="secondary"
              class="h-7 text-xs"
              @click="addNewChip(true)"
            >
              <Plus class="mr-1 h-3 w-3" /> Add Tag
            </Button>
          </div>
        </div>

        <!-- Categorized Quick Tags Bar -->
        <div class="flex flex-col gap-1.5 pt-0.5">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1">
              <span class="text-muted-foreground mr-1 text-xs font-semibold"
                >Quick:</span
              >
              <button
                v-for="(grp, idx) in positiveQuickGroups"
                :key="grp.label"
                type="button"
                class="cursor-pointer rounded px-1.5 py-0.5 text-xs font-medium transition-colors select-none"
                :class="
                  selectedQuickGroup === idx
                    ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                "
                @mousedown.prevent
                @click="selectedQuickGroup = idx"
              >
                {{ grp.label }}
              </button>
            </div>

            <!-- Token Counter (Bottom Right) -->
            <span
              class="font-mono text-xs"
              :class="
                positiveTokenInfo.chunks > 1
                  ? 'font-medium text-amber-400'
                  : 'text-muted-foreground'
              "
              title="Estimated CLIP tokens"
            >
              {{ positiveTokenInfo.count }}/{{ positiveTokenInfo.maxChunk }}
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            <button
              v-for="tag in positiveQuickGroups[selectedQuickGroup]?.tags"
              :key="tag"
              type="button"
              class="border-border bg-muted/60 text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-foreground cursor-pointer rounded border px-2 py-0.5 font-mono text-xs shadow-2xs transition-all select-none active:scale-95"
              title="Click to insert at cursor"
              @mousedown.prevent
              @click="insertTagAtCursor(tag, 'positive')"
            >
              + {{ tag }}
            </button>
          </div>
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
                    Prompt Library & Tag Catalog
                  </span>
                  <span class="text-muted-foreground font-mono text-xs">
                    ({{ promptSuggestionStore.categories.length }} categories)
                  </span>
                </div>
              </AccordionTrigger>

              <AccordionContent
                class="flex flex-col gap-2.5 px-2.5 pt-1 pb-2.5"
              >
                <!-- Search, Target Selector & Controls -->
                <div class="border-border/50 flex flex-col gap-2 border-b pb-2">
                  <!-- Search Row with Target Selector -->
                  <div class="flex items-center gap-1.5">
                    <div class="relative flex-1">
                      <Search
                        class="text-muted-foreground absolute top-2 left-2.5 h-3.5 w-3.5"
                      />
                      <input
                        v-model="tagSearchQuery"
                        type="text"
                        placeholder="Search tags across library..."
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

                    <!-- Insert Target Switch -->
                    <div
                      class="border-border/80 bg-secondary/70 flex items-center rounded-lg border p-0.5 text-xs"
                    >
                      <button
                        type="button"
                        class="cursor-pointer rounded px-2 py-1 font-medium transition-colors select-none"
                        :class="
                          libraryTarget === 'positive'
                            ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
                            : 'text-muted-foreground hover:text-foreground'
                        "
                        @click="libraryTarget = 'positive'"
                      >
                        + Positive
                      </button>
                      <button
                        type="button"
                        class="cursor-pointer rounded px-2 py-1 font-medium transition-colors select-none"
                        :class="
                          libraryTarget === 'negative'
                            ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
                            : 'text-muted-foreground hover:text-foreground'
                        "
                        @click="libraryTarget = 'negative'"
                      >
                        - Negative
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
                  <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
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
                        :title="`Click to insert into ${libraryTarget} prompt`"
                        @mousedown.prevent
                        @click="insertTagAtCursor(tag, libraryTarget)"
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

      <!-- 2. NEGATIVE PROMPT SECTION -->
      <WorkflowField label="Negative Prompt">
        <template #action>
          <div class="flex items-center gap-1.5">
            <!-- Negative Presets Dropdown -->
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <button
                  type="button"
                  class="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 text-xs font-medium tracking-wide uppercase transition-colors"
                  title="Apply standard negative prompt preset"
                >
                  <SlidersHorizontal class="text-primary h-3 w-3" />
                  <span>Bundles</span>
                  <ChevronDown class="h-3 w-3 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-56 p-1">
                <DropdownMenuItem
                  v-for="np in negativePresets"
                  :key="np.name"
                  class="flex cursor-pointer flex-col items-start gap-0.5 py-1.5"
                  @click="applyNegativePreset(np.prompt)"
                >
                  <span class="text-foreground text-xs font-semibold">{{
                    np.name
                  }}</span>
                  <span class="text-muted-foreground line-clamp-1 text-xs">{{
                    np.description
                  }}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <span class="text-border">|</span>

            <!-- Chips / Text Mode Toggle -->
            <button
              type="button"
              class="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 text-xs font-medium transition-colors"
              :class="{ 'text-primary font-semibold': isNegativeChipsMode }"
              :title="
                isNegativeChipsMode
                  ? 'Switch to Raw Text Editor'
                  : 'Switch to Interactive Tag Chips'
              "
              @click="toggleNegativeChipsMode"
            >
              <Tags class="h-3 w-3" />
              <span>{{ isNegativeChipsMode ? 'Text' : 'Chips' }}</span>
            </button>

            <!-- AI Enhance Button -->
            <button
              type="button"
              class="text-primary hover:text-primary/80 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold transition-colors"
              title="Enhance negative prompt with AI"
              @click="openEnhanceDialog('negative')"
            >
              <Sparkles class="h-3 w-3" />
              <span>AI Enhance</span>
            </button>

            <span class="text-border">|</span>

            <!-- Format Button -->
            <button
              type="button"
              class="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 text-xs font-medium transition-colors"
              title="Clean formatting & deduplicate negative tags"
              @click="formatPrompt('negative')"
            >
              <Sparkles class="text-primary h-3 w-3" />
              <span>Format</span>
            </button>

            <span class="text-border">|</span>

            <!-- Copy Prompt Button -->
            <button
              type="button"
              class="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 text-xs font-medium transition-colors"
              title="Copy Negative Prompt to Clipboard"
              @click="copyPrompt('negative')"
            >
              <Check v-if="copiedNegative" class="h-3 w-3 text-emerald-400" />
              <Copy v-else class="h-3 w-3" />
            </button>

            <span class="text-border">|</span>

            <!-- Clear Button -->
            <button
              type="button"
              class="text-muted-foreground/70 hover:text-destructive inline-flex cursor-pointer items-center gap-1 text-xs font-medium transition-colors"
              title="Clear negative prompt"
              @click="workflowStore.negativePrompt = ''"
            >
              <Trash2 class="h-3 w-3" />
            </button>
          </div>
        </template>

        <!-- Negative Content: Textarea or Interactive Chips -->
        <div v-if="!isNegativeChipsMode" class="relative">
          <Textarea
            ref="negativeTextarea"
            v-model="workflowStore.negativePrompt"
            :rows="3"
            :style="{
              height: `${textareaSizes.negative ?? defaultTextareaSizes.negative}px`
            }"
            placeholder="Things to avoid in generation... (e.g. worst quality, blurry, bad anatomy)"
            class="field-sizing-fixed min-h-20 w-full resize-y font-mono text-xs leading-relaxed"
            @input="handleInput('negative', $event)"
            @click="updateCursor('negative', $event)"
            @keyup="updateCursor('negative', $event)"
            @select="updateCursor('negative', $event)"
            @keydown="handleKeydown('negative', $event)"
            @blur="handleBlur('negative', $event)"
            @pointerup="saveTextareaSize('negative', $event)"
          />

          <!-- Autocomplete Floating Dropdown for Negative -->
          <div
            v-if="activeField === 'negative'"
            role="listbox"
            class="border-border bg-popover/95 absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border p-1 shadow-xl backdrop-blur-md"
          >
            <button
              v-for="(item, index) in suggestions"
              :key="`${item.label}-${item.category}`"
              type="button"
              role="option"
              :aria-selected="index === activeIndex"
              class="flex w-full cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-left font-mono text-xs transition-colors"
              :class="
                index === activeIndex
                  ? 'bg-primary/20 text-foreground border-primary/30 border font-semibold'
                  : 'hover:bg-accent/60 text-foreground'
              "
              @mousedown.prevent
              @click="selectSuggestion('negative', item)"
            >
              <div class="flex items-center gap-2 overflow-hidden">
                <span
                  class="flex h-5 w-5 shrink-0 items-center justify-center rounded border"
                  :class="getCategoryBadgeStyle(item)"
                  :title="getCategoryName(item)"
                >
                  <component :is="getCategoryIcon(item)" class="h-3 w-3" />
                </span>
                <span class="truncate">{{ item.label }}</span>
              </div>
              <span class="text-muted-foreground ml-3 shrink-0 text-xs">
                {{ autocompleteMeta(item) }}
              </span>
            </button>
          </div>
        </div>

        <!-- Interactive Tag Chips Mode for Negative -->
        <div
          v-else
          class="border-border bg-background flex max-h-112 min-h-24 resize-y flex-col justify-between gap-2.5 overflow-auto rounded-md border p-2.5"
        >
          <div
            v-draggable="[
              negativeChips,
              {
                animation: 200,
                ghostClass: 'ghost-chip-negative',
                chosenClass: 'chosen-chip-negative',
                dragClass: 'drag-chip',
                onEnd: syncNegativeChipsToStore
              }
            ]"
            class="flex flex-1 flex-wrap content-start items-start gap-1.5 overflow-y-auto pr-1"
          >
            <div
              v-for="(chip, idx) in negativeChips"
              :key="chip.id"
              class="group inline-flex shrink-0 cursor-grab items-center gap-1.5 self-start rounded-md border px-2 py-0.5 font-mono text-xs shadow-2xs transition-colors select-none active:cursor-grabbing"
              :class="[
                chip.disabled
                  ? 'border-border/40 bg-muted/30 text-muted-foreground/50 border-dashed line-through opacity-50'
                  : 'border-border/80 bg-secondary/80 text-foreground hover:border-primary/50'
              ]"
              @dblclick="toggleChipDisabled(false, idx)"
            >
              <span
                class="font-medium"
                :class="{ 'line-through': chip.disabled }"
                >{{ chip.text }}</span
              >

              <!-- Weight indicator badge -->
              <span
                v-if="chip.weight !== 1.0"
                class="py-0.2 rounded px-1 text-xs font-bold"
                :class="[
                  chip.disabled
                    ? 'bg-muted text-muted-foreground/40'
                    : chip.weight > 1.0
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-amber-500/20 text-amber-400'
                ]"
              >
                {{ chip.weight }}x
              </span>

              <!-- Remove tag button -->
              <button
                type="button"
                class="hover:bg-destructive/20 hover:text-destructive text-muted-foreground/60 ml-0.5 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded transition-colors hover:opacity-100"
                title="Remove tag"
                @click.stop="removeChip(negativeChips, idx, false)"
              >
                <X class="h-2.5 w-2.5" />
              </button>
            </div>

            <div
              v-if="negativeChips.length === 0"
              class="text-muted-foreground py-2 text-xs italic"
            >
              No negative prompt tags.
            </div>
          </div>

          <!-- Add new negative tag chip bar -->
          <div class="border-border/40 flex items-center gap-1.5 border-t pt-2">
            <input
              v-model="newNegativeTagInput"
              type="text"
              placeholder="Type new negative tag(s) and press Enter..."
              class="border-border bg-secondary/50 focus:border-primary h-7 flex-1 rounded px-2 font-mono text-xs outline-none"
              @keydown.enter.prevent="addNewChip(false)"
            />
            <Button
              size="sm"
              variant="secondary"
              class="h-7 text-xs"
              @click="addNewChip(false)"
            >
              <Plus class="mr-1 h-3 w-3" /> Add Tag
            </Button>
          </div>
        </div>

        <!-- Quick Negative Tags Bar -->
        <div class="flex items-center justify-between gap-1.5 pt-0.5">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-muted-foreground text-xs font-semibold"
              >Quick:</span
            >
            <button
              v-for="tag in negativeQuickTags"
              :key="tag"
              type="button"
              class="border-border bg-muted/60 text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive-foreground cursor-pointer rounded border px-2 py-0.5 font-mono text-xs shadow-2xs transition-all select-none active:scale-95"
              title="Click to insert into negative prompt"
              @mousedown.prevent
              @click="insertTagAtCursor(tag, 'negative')"
            >
              + {{ tag }}
            </button>
          </div>

          <!-- Token Counter for Negative (Bottom Right) -->
          <span
            class="shrink-0 font-mono text-xs"
            :class="
              negativeTokenInfo.chunks > 1
                ? 'font-medium text-amber-400'
                : 'text-muted-foreground'
            "
            title="Estimated CLIP tokens"
          >
            {{ negativeTokenInfo.count }}/{{ negativeTokenInfo.maxChunk }}
          </span>
        </div>
      </WorkflowField>

      <!-- Prompt Preset Manager Dialog -->
      <PromptPresetDialog v-model:open="isPresetDialogOpen" />

      <!-- AI Prompt Enhancer Diff Dialog -->
      <PromptEnhanceDialog
        v-model:open="isEnhanceDialogOpen"
        :target="enhanceTarget"
        :original-prompt="
          enhanceTarget === 'positive'
            ? workflowStore.positivePrompt
            : workflowStore.negativePrompt
        "
        @apply="handleEnhanceApply"
      />
    </div>
  </TooltipProvider>
</template>

<style scoped>
:deep(.ghost-chip) {
  opacity: 0.35 !important;
  border: 2px dashed #3b82f6 !important;
  background-color: rgba(59, 130, 246, 0.18) !important;
  border-radius: 0.375rem !important;
}

:deep(.chosen-chip) {
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3) !important;
  outline: 2px solid #3b82f6 !important;
  border-radius: 0.375rem !important;
}

:deep(.drag-chip) {
  cursor: grabbing !important;
  opacity: 0.95 !important;
  transform: rotate(1.5deg) scale(1.04) !important;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4) !important;
}

:deep(.ghost-chip-negative) {
  opacity: 0.35 !important;
  border: 2px dashed #ef4444 !important;
  background-color: rgba(239, 68, 68, 0.18) !important;
  border-radius: 0.375rem !important;
}

:deep(.chosen-chip-negative) {
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3) !important;
  outline: 2px solid #ef4444 !important;
  border-radius: 0.375rem !important;
}
</style>
