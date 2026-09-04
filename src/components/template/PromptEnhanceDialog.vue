<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ArrowRight,
  Check,
  Copy,
  Loader2,
  Sparkles,
  Wand2,
  X
} from '@lucide/vue';
import { streamText } from 'ai';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  buildEnhancerSystemPrompt,
  buildEnhancerUserPrompt,
  NEGATIVE_ENHANCE_PRESETS,
  POSITIVE_ENHANCE_PRESETS
} from '../../data/aiPrompts';
import { getOpenRouterModel } from '../../services/aiService';
import { useAiStore } from '../../stores/aiStore';
import AiModelSelector from '@/components/common/AiModelSelector.vue';

interface Props {
  open: boolean;
  originalPrompt: string;
  target?: 'positive' | 'negative';
}

const props = withDefaults(defineProps<Props>(), {
  target: 'positive'
});

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
  (
    e: 'apply',
    payload: {
      mode: 'replace' | 'append';
      text: string;
      target: 'positive' | 'negative';
    }
  ): void;
}>();

const aiStore = useAiStore();

const selectedStyle = ref<string>('clothing');
const styleContext = ref('');
const customInstruction = ref('');
const enhancedPrompt = ref('');
const isStreaming = ref(false);
const errorMsg = ref('');
const copied = ref(false);
let abortController: AbortController | null = null;

const promptTarget = ref<'positive' | 'negative'>(props.target);

watch(
  () => props.target,
  (val) => {
    promptTarget.value = val;
  }
);

watch(promptTarget, (newTarget) => {
  const presets =
    newTarget === 'positive'
      ? POSITIVE_ENHANCE_PRESETS
      : NEGATIVE_ENHANCE_PRESETS;
  if (!presets.some((p) => p.id === selectedStyle.value)) {
    selectedStyle.value = presets[0].id;
  }
});

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      enhancedPrompt.value = '';
      errorMsg.value = '';
      copied.value = false;
      promptTarget.value = props.target;
      if (props.target === 'positive') {
        selectedStyle.value = 'clothing';
      }
    } else {
      stopEnhancement();
    }
  }
);

const currentPresets = computed(() =>
  promptTarget.value === 'positive'
    ? POSITIVE_ENHANCE_PRESETS
    : NEGATIVE_ENHANCE_PRESETS
);

function selectPreset(id: string) {
  selectedStyle.value = id;
}

function stopEnhancement() {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  isStreaming.value = false;
}

async function runEnhance() {
  if (!aiStore.hasApiKey) {
    errorMsg.value =
      'Please configure your OpenRouter API Key in Settings or the AI Drawer first.';
    return;
  }

  errorMsg.value = '';
  enhancedPrompt.value = '';
  isStreaming.value = true;
  abortController = new AbortController();

  const isPositive = promptTarget.value === 'positive';
  const presets = isPositive
    ? POSITIVE_ENHANCE_PRESETS
    : NEGATIVE_ENHANCE_PRESETS;
  const activePreset =
    presets.find((p) => p.id === selectedStyle.value) || presets[0];

  const userPrompt = buildEnhancerUserPrompt(
    isPositive,
    props.originalPrompt,
    activePreset.instruction,
    customInstruction.value,
    styleContext.value
  );

  try {
    const model = getOpenRouterModel(aiStore.config);

    const result = streamText({
      model,
      system: buildEnhancerSystemPrompt(aiStore.config.enhancerSystemPrompt),
      prompt: userPrompt,
      abortSignal: abortController.signal
    });

    for await (const chunk of result.textStream) {
      enhancedPrompt.value += chunk;
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      // Aborted by user
    } else {
      errorMsg.value = err instanceof Error ? err.message : String(err);
    }
  } finally {
    isStreaming.value = false;
    abortController = null;
  }
}

function handleApply(mode: 'replace' | 'append') {
  if (!enhancedPrompt.value.trim()) return;
  emit('apply', {
    mode,
    text: enhancedPrompt.value.trim(),
    target: promptTarget.value
  });
  emit('update:open', false);
}

async function copyEnhanced() {
  if (!enhancedPrompt.value) return;
  try {
    await navigator.clipboard.writeText(enhancedPrompt.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="(val) => emit('update:open', val)">
    <DialogContent
      class="flex max-h-[90vh] min-w-[60vw] flex-col overflow-hidden p-6"
    >
      <DialogHeader
        class="border-border flex flex-row items-center justify-between border-b pb-2"
      >
        <div class="flex items-center gap-2.5">
          <div
            class="bg-primary/10 border-primary/20 text-primary flex h-9 w-9 items-center justify-center rounded-lg border"
          >
            <Sparkles class="h-5 w-5" />
          </div>
          <div>
            <DialogTitle
              class="flex items-center gap-2 text-base font-semibold"
            >
              AI Prompt Enhancer
              <AiModelSelector compact class="ml-1" />
            </DialogTitle>
          </div>
        </div>

        <!-- Target Switcher: Positive vs Negative -->
        <div
          class="bg-secondary border-border flex items-center rounded-lg border p-0.5 text-xs"
        >
          <button
            type="button"
            class="rounded-md px-2.5 py-1 transition-colors"
            :class="
              promptTarget === 'positive'
                ? 'bg-background text-foreground font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="promptTarget = 'positive'"
          >
            Positive Prompt
          </button>
          <button
            type="button"
            class="rounded-md px-2.5 py-1 transition-colors"
            :class="
              promptTarget === 'negative'
                ? 'bg-background text-foreground font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="promptTarget = 'negative'"
          >
            Negative Prompt
          </button>
        </div>
      </DialogHeader>

      <!-- Main Body: Controls & Diff Columns -->
      <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-3">
        <!-- Preset Style Selector -->
        <div class="flex flex-col gap-1.5">
          <label class="text-muted-foreground text-xs font-medium"
            >Enhancement Style</label
          >
          <div
            class="grid grid-cols-2 gap-2 sm:grid-cols-3"
            :class="
              promptTarget === 'positive' ? 'md:grid-cols-5' : 'md:grid-cols-3'
            "
          >
            <button
              v-for="preset in currentPresets"
              :key="preset.id"
              type="button"
              class="flex cursor-pointer flex-col items-start rounded-lg border p-2.5 text-left text-xs transition-all"
              :class="
                selectedStyle === preset.id
                  ? 'border-primary bg-primary/5 text-foreground ring-primary/30 ring-1'
                  : 'border-border bg-card text-muted-foreground hover:border-border/80 hover:text-foreground'
              "
              @click="selectPreset(preset.id)"
            >
              <span
                class="text-foreground flex items-center gap-1.5 font-medium"
              >
                <Wand2 class="text-primary h-3 w-3" />
                {{ preset.label }}
              </span>
              <span class="text-muted-foreground mt-1 line-clamp-2 text-xs">{{
                preset.desc
              }}</span>
            </button>
          </div>
        </div>

        <!-- Context & Custom Instruction Inputs -->
        <div class="flex flex-col gap-2.5">
          <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <!-- Thematic / Universe Context -->
            <div class="flex flex-col gap-1">
              <div class="flex items-center justify-between">
                <label class="text-muted-foreground text-xs font-medium">
                  Theme / Universe Context
                  <span class="text-muted-foreground/70 font-normal"
                    >(Optional)</span
                  >
                </label>
                <span class="text-muted-foreground/70 text-xs">
                  Emulates without naming source
                </span>
              </div>
              <input
                v-model="styleContext"
                type="text"
                placeholder="e.g. Genshin Impact, Cyberpunk, Victorian Gothic..."
                class="border-border bg-background placeholder:text-muted-foreground/60 focus:ring-primary rounded-lg border px-3 py-1.5 text-xs focus:ring-1 focus:outline-none"
                @keydown.enter.prevent="runEnhance"
              />
            </div>

            <!-- Additional Custom Instruction -->
            <div class="flex flex-col gap-1">
              <label class="text-muted-foreground text-xs font-medium">
                Custom Instruction
                <span class="text-muted-foreground/70 font-normal"
                  >(Optional)</span
                >
              </label>
              <input
                v-model="customInstruction"
                type="text"
                placeholder="e.g. Add flowing cape, gold jewelry, ornate embroidery..."
                class="border-border bg-background placeholder:text-muted-foreground/60 focus:ring-primary rounded-lg border px-3 py-1.5 text-xs focus:ring-1 focus:outline-none"
                @keydown.enter.prevent="runEnhance"
              />
            </div>
          </div>

          <!-- Enhance Action Trigger Bar -->
          <div class="flex items-center justify-between pt-0.5">
            <div
              class="text-muted-foreground flex items-center gap-1.5 text-xs"
            >
              <span class="text-foreground font-medium">Active Preset:</span>
              <span class="capitalize">
                {{
                  currentPresets.find((p) => p.id === selectedStyle)?.label ||
                  selectedStyle
                }}
              </span>
              <span v-if="styleContext.trim()" class="text-primary font-medium">
                • Theme: "{{ styleContext.trim() }}"
              </span>
            </div>
            <div class="flex items-center gap-2">
              <Button
                v-if="isStreaming"
                type="button"
                variant="outline"
                size="sm"
                class="text-destructive hover:bg-destructive/10 gap-1"
                @click="stopEnhancement"
              >
                <X class="h-3.5 w-3.5" />
                <span>Stop</span>
              </Button>
              <Button
                type="button"
                size="sm"
                :disabled="isStreaming"
                class="gap-1.5"
                @click="runEnhance"
              >
                <Loader2 v-if="isStreaming" class="h-3.5 w-3.5 animate-spin" />
                <Sparkles v-else class="h-3.5 w-3.5" />
                <span>{{
                  isStreaming ? 'Enhancing...' : 'Enhance Prompt'
                }}</span>
              </Button>
            </div>
          </div>
        </div>

        <!-- Error banner if any -->
        <div
          v-if="errorMsg"
          class="bg-destructive/10 border-destructive/20 text-destructive rounded-lg border p-2.5 text-xs"
        >
          {{ errorMsg }}
        </div>

        <!-- Side-by-Side Comparison Panels -->
        <div class="grid min-h-56 flex-1 grid-cols-1 gap-3 md:grid-cols-2">
          <!-- Left: Original Prompt -->
          <div
            class="border-border bg-muted/20 flex flex-col overflow-hidden rounded-xl border"
          >
            <div
              class="border-border bg-card/60 flex items-center justify-between border-b px-3 py-2"
            >
              <span
                class="text-muted-foreground text-xs font-semibold tracking-wider uppercase"
              >
                Original Prompt
              </span>
              <span class="text-muted-foreground font-mono text-xs">
                {{ originalPrompt.length }} chars
              </span>
            </div>
            <div
              class="text-foreground/80 flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap select-text"
            >
              {{ originalPrompt || '(Empty prompt)' }}
            </div>
          </div>

          <!-- Right: Enhanced Prompt -->
          <div
            class="border-border bg-card flex flex-col overflow-hidden rounded-xl border"
          >
            <div
              class="border-border bg-primary/5 flex items-center justify-between border-b px-3 py-2"
            >
              <div class="flex items-center gap-1.5">
                <Sparkles class="text-primary h-3.5 w-3.5" />
                <span
                  class="text-primary text-xs font-semibold tracking-wider uppercase"
                >
                  Enhanced Prompt
                </span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-muted-foreground font-mono text-xs">
                  {{ enhancedPrompt.length }} chars
                </span>
                <Button
                  v-if="enhancedPrompt"
                  variant="ghost"
                  size="icon-sm"
                  class="text-muted-foreground hover:text-foreground h-6 w-6"
                  title="Copy to clipboard"
                  @click="copyEnhanced"
                >
                  <Check v-if="copied" class="h-3.5 w-3.5 text-emerald-500" />
                  <Copy v-else class="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <!-- Enhanced content viewport -->
            <div
              class="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap select-text"
            >
              <span v-if="enhancedPrompt">{{ enhancedPrompt }}</span>
              <span
                v-else-if="isStreaming"
                class="text-muted-foreground flex items-center gap-2"
              >
                <Loader2 class="text-primary h-3.5 w-3.5 animate-spin" />
                Generating enhanced prompt...
              </span>
              <span v-else class="text-muted-foreground italic">
                Click "Enhance Prompt" above to generate with AI.
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Actions -->
      <div
        class="border-border flex items-center justify-between border-t pt-3"
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          @click="emit('update:open', false)"
        >
          Close
        </Button>

        <div class="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            :disabled="!enhancedPrompt || isStreaming"
            class="gap-1.5"
            @click="handleApply('append')"
          >
            <span>Append to Current</span>
          </Button>

          <Button
            type="button"
            size="sm"
            :disabled="!enhancedPrompt || isStreaming"
            class="bg-primary text-primary-foreground gap-1.5 shadow-xs"
            @click="handleApply('replace')"
          >
            <ArrowRight class="h-3.5 w-3.5" />
            <span>Replace Prompt</span>
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
