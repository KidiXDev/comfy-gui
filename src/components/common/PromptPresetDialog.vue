<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  Bookmark,
  Check,
  Clock,
  Copy,
  FileText,
  FolderOpen,
  Plus,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X
} from '@lucide/vue';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { formatShortDate } from '@/utils/formatters';
import {
  PresetService,
  type PromptPresetFile
} from '../../services/presetService';
import { useWorkflowStore } from '../../stores/workflowStore';
import type { PromptPreset } from '../../types/workflow';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
}>();

const workflowStore = useWorkflowStore();

const activeTab = ref<'load' | 'save'>('load');
const presets = ref<PromptPresetFile[]>([]);
const isLoading = ref(false);
const searchQuery = ref('');
const filterType = ref<'all' | 'both' | 'positive' | 'negative'>('all');
const appendMode = ref(false);
const copiedPresetId = ref<string | null>(null);

// Form state for saving
const saveName = ref('');
const saveDescription = ref('');
const saveType = ref<'both' | 'positive' | 'negative'>('both');
const editPositivePrompt = ref('');
const editNegativePrompt = ref('');
const saveSuccessMessage = ref('');

function resetToCurrentPrompt() {
  editPositivePrompt.value = workflowStore.positivePrompt;
  editNegativePrompt.value = workflowStore.negativePrompt;
}

async function fetchPresets() {
  isLoading.value = true;
  presets.value = await PresetService.listPresets<PromptPreset>('prompts');
  isLoading.value = false;
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      void fetchPresets();
      saveSuccessMessage.value = '';
      resetToCurrentPrompt();
      if (!saveName.value) {
        saveName.value = `Preset ${new Date().toLocaleDateString()}`;
      }
    }
  }
);

onMounted(() => {
  if (props.open) {
    void fetchPresets();
  }
});

const filteredPresets = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return presets.value.filter((p) => {
    // Type filter
    if (filterType.value !== 'all' && p.data.type !== filterType.value) {
      return false;
    }
    // Search query filter
    if (q) {
      const matchName = p.data.name.toLowerCase().includes(q);
      const matchPos = p.data.positive?.toLowerCase().includes(q) ?? false;
      const matchNeg = p.data.negative?.toLowerCase().includes(q) ?? false;
      const matchDesc = p.data.description?.toLowerCase().includes(q) ?? false;
      return matchName || matchPos || matchNeg || matchDesc;
    }
    return true;
  });
});

function applyPrompt(
  preset: PromptPreset,
  applyMode: 'both' | 'positive' | 'negative' = 'both'
) {
  if ((applyMode === 'both' || applyMode === 'positive') && preset.positive) {
    if (appendMode.value && workflowStore.positivePrompt.trim()) {
      workflowStore.positivePrompt += `, ${preset.positive}`;
    } else {
      workflowStore.positivePrompt = preset.positive;
    }
  }

  if ((applyMode === 'both' || applyMode === 'negative') && preset.negative) {
    if (appendMode.value && workflowStore.negativePrompt.trim()) {
      workflowStore.negativePrompt += `, ${preset.negative}`;
    } else {
      workflowStore.negativePrompt = preset.negative;
    }
  }

  emit('update:open', false);
}

async function handleSavePreset() {
  if (!saveName.value.trim()) return;

  const data: PromptPreset = {
    id: `prompt-${Date.now()}`,
    name: saveName.value.trim(),
    type: saveType.value,
    description: saveDescription.value.trim() || undefined,
    createdAt: Date.now()
  };

  if (saveType.value === 'both' || saveType.value === 'positive') {
    data.positive = editPositivePrompt.value;
  }
  if (saveType.value === 'both' || saveType.value === 'negative') {
    data.negative = editNegativePrompt.value;
  }

  await PresetService.savePreset('prompts', saveName.value.trim(), data);
  saveSuccessMessage.value = `Saved "${saveName.value.trim()}" to file!`;
  saveName.value = '';
  saveDescription.value = '';
  await fetchPresets();
  setTimeout(() => {
    activeTab.value = 'load';
    saveSuccessMessage.value = '';
  }, 900);
}

async function handleDeletePreset(filename: string) {
  await PresetService.deletePreset('prompts', filename);
  await fetchPresets();
}

function handleOpenFolder() {
  void PresetService.openFolder('prompts');
}

function copyPromptText(preset: PromptPreset, id: string) {
  const text = [preset.positive, preset.negative]
    .filter(Boolean)
    .join('\n\nNegative:\n');
  void navigator.clipboard.writeText(text);
  copiedPresetId.value = id;
  setTimeout(() => {
    if (copiedPresetId.value === id) copiedPresetId.value = null;
  }, 1500);
}
</script>

<template>
  <Dialog :open="open" @update:open="(val) => emit('update:open', val)">
    <DialogContent
      class="border-border bg-card flex max-h-[88vh] w-full max-w-5xl min-w-[70vw] flex-col gap-0 overflow-hidden p-0 shadow-2xl"
    >
      <!-- Dialog Header -->
      <DialogHeader
        class="border-border bg-background/50 flex flex-row items-center justify-between border-b px-5 py-3.5"
      >
        <div class="flex items-center gap-2.5">
          <div
            class="bg-primary/10 text-primary border-primary/20 flex h-8 w-8 items-center justify-center rounded-lg border"
          >
            <Bookmark class="h-4 w-4" />
          </div>
          <div>
            <DialogTitle
              class="text-foreground text-sm font-bold tracking-tight"
            >
              Prompt Presets
            </DialogTitle>
            <DialogDescription class="text-muted-foreground text-xs">
              Save, load, and manage prompt presets stored as real JSON files on
              disk.
            </DialogDescription>
          </div>
        </div>

        <!-- Header Actions: Open Folder in Explorer & Refresh -->
        <div class="flex items-center gap-2 pr-6">
          <Button
            size="sm"
            variant="outline"
            title="Open Presets Folder in File Explorer"
            class="border-border bg-secondary hover:bg-accent h-7.5 gap-1 px-2.5 text-xs"
            @click="handleOpenFolder"
          >
            <FolderOpen class="h-3.5 w-3.5" />
            <span>Open Folder</span>
          </Button>

          <Button
            size="iconSm"
            variant="outline"
            :disabled="isLoading"
            title="Refresh presets from disk"
            class="border-border bg-secondary hover:bg-accent h-7.5 w-7.5"
            @click="fetchPresets"
          >
            <RefreshCw
              class="h-3.5 w-3.5"
              :class="{ 'animate-spin': isLoading }"
            />
          </Button>
        </div>
      </DialogHeader>

      <!-- Main Tabs Container -->
      <Tabs v-model="activeTab" class="flex flex-1 flex-col overflow-hidden">
        <div class="border-border bg-muted/20 border-b px-6 py-3">
          <TabsList class="bg-muted/80 h-10 gap-1 rounded-lg p-1">
            <TabsTrigger
              value="load"
              class="data-[state=active]:bg-background data-[state=active]:text-foreground flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold transition-all data-[state=active]:shadow-xs"
            >
              <FileText class="h-3.5 w-3.5" />
              Load Preset ({{ presets.length }})
            </TabsTrigger>
            <TabsTrigger
              value="save"
              class="data-[state=active]:bg-background data-[state=active]:text-foreground flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold transition-all data-[state=active]:shadow-xs"
            >
              <PlusCircle class="h-3.5 w-3.5" />
              Save Current Prompt
            </TabsTrigger>
          </TabsList>
        </div>

        <!-- TAB 1: LOAD PRESETS -->
        <TabsContent
          value="load"
          class="m-0 flex flex-1 flex-col overflow-hidden outline-hidden"
        >
          <!-- Filter & Search Toolbar -->
          <div
            class="border-border bg-card/20 flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3"
          >
            <div class="relative min-w-65 flex-1">
              <Search
                class="text-muted-foreground absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2"
              />
              <Input
                v-model="searchQuery"
                placeholder="Search preset name or prompt text..."
                class="bg-background/80 focus:ring-primary/30 h-8 w-full pr-8 pl-8.5 text-xs"
              />
              <button
                v-if="searchQuery"
                type="button"
                class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer"
                @click="searchQuery = ''"
              >
                <X class="h-3.5 w-3.5" />
              </button>
            </div>

            <!-- Scope Tabs -->
            <div class="flex items-center gap-1">
              <span class="text-muted-foreground mr-1 text-xs font-medium"
                >Scope:</span
              >
              <button
                v-for="st in [
                  { label: 'All', val: 'all' },
                  { label: 'Both', val: 'both' },
                  { label: 'Positive', val: 'positive' },
                  { label: 'Negative', val: 'negative' }
                ]"
                :key="st.val"
                type="button"
                class="cursor-pointer rounded-md px-2 py-0.5 font-mono text-xs font-semibold transition-colors"
                :class="
                  filterType === st.val
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'border-border bg-muted text-muted-foreground hover:text-foreground hover:bg-accent border'
                "
                @click="filterType = st.val as any"
              >
                {{ st.label }}
              </button>
            </div>

            <!-- Append Mode Toggle -->
            <div class="border-border flex items-center gap-1.5 border-l pl-3">
              <Label
                class="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1.5 text-xs"
              >
                <input
                  v-model="appendMode"
                  type="checkbox"
                  class="text-primary accent-primary rounded"
                />
                <span class="text-xs font-medium">Append to prompt</span>
              </Label>
            </div>
          </div>

          <!-- Presets List Area -->
          <ScrollArea class="h-[52vh] px-5 py-4">
            <!-- Empty State -->
            <div
              v-if="filteredPresets.length === 0"
              class="flex h-56 flex-col items-center justify-center gap-2 text-center"
            >
              <div
                class="bg-muted text-muted-foreground flex h-12 w-12 items-center justify-center rounded-full"
              >
                <FileText class="h-6 w-6 opacity-40" />
              </div>
              <span class="text-foreground text-xs font-semibold"
                >No presets found</span
              >
              <p class="text-muted-foreground max-w-sm text-xs">
                {{
                  searchQuery
                    ? `No presets match "${searchQuery}".`
                    : `No prompt preset files saved yet. Click "Save Current Prompt" to create your first real JSON preset
                file.`
                }}
              </p>
            </div>

            <!-- Presets Grid / Cards -->
            <div v-else class="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              <div
                v-for="item in filteredPresets"
                :key="item.filename"
                class="group/item border-border bg-card hover:border-primary/50 relative flex flex-col justify-between rounded-xl border p-3.5 transition-all hover:shadow-md"
              >
                <div class="flex flex-col gap-2">
                  <!-- Header: Name, Scope Badge, Timestamp -->
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex flex-col gap-0.5">
                      <h4 class="text-foreground text-xs font-bold">
                        {{ item.data.name }}
                      </h4>
                      <p
                        v-if="item.data.description"
                        class="text-muted-foreground text-xs"
                      >
                        {{ item.data.description }}
                      </p>
                    </div>

                    <!-- Type Tag Badge -->
                    <div class="flex items-center gap-1.5">
                      <span
                        class="rounded px-1.5 py-0.5 font-mono text-xs font-bold uppercase"
                        :class="
                          item.data.type === 'both'
                            ? 'border border-purple-500/20 bg-purple-500/10 text-purple-400'
                            : item.data.type === 'positive'
                              ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                              : 'border border-rose-500/20 bg-rose-500/10 text-rose-400'
                        "
                      >
                        {{ item.data.type }}
                      </span>
                    </div>
                  </div>

                  <!-- Positive Preview Text -->
                  <div
                    v-if="item.data.positive"
                    class="bg-muted/40 border-border/60 flex flex-col gap-1 rounded-md border p-2 text-xs"
                  >
                    <span
                      class="font-mono text-xs font-bold tracking-wider text-emerald-400 uppercase"
                      >Positive</span
                    >
                    <p
                      class="text-foreground/90 line-clamp-2 font-mono text-xs leading-relaxed"
                    >
                      {{ item.data.positive }}
                    </p>
                  </div>

                  <!-- Negative Preview Text -->
                  <div
                    v-if="item.data.negative"
                    class="bg-muted/40 border-border/60 flex flex-col gap-1 rounded-md border p-2 text-xs"
                  >
                    <span
                      class="font-mono text-xs font-bold tracking-wider text-rose-400 uppercase"
                      >Negative</span
                    >
                    <p
                      class="text-muted-foreground line-clamp-2 font-mono text-xs leading-relaxed"
                    >
                      {{ item.data.negative }}
                    </p>
                  </div>
                </div>

                <!-- Footer Actions: Apply Buttons & Delete -->
                <div
                  class="border-border/60 mt-3 flex items-center justify-between border-t pt-2.5"
                >
                  <div
                    class="text-muted-foreground/70 flex items-center gap-1 font-mono text-xs"
                  >
                    <Clock class="h-2.5 w-2.5" />
                    <span>{{ formatShortDate(item.updatedAt) }}</span>
                  </div>

                  <div class="flex items-center gap-1.5">
                    <!-- Copy text -->
                    <Button
                      size="iconSm"
                      variant="ghost"
                      class="text-muted-foreground hover:text-foreground h-7 w-7"
                      title="Copy Prompt Text"
                      @click="copyPromptText(item.data, item.id)"
                    >
                      <Check
                        v-if="copiedPresetId === item.id"
                        class="h-3.5 w-3.5 text-emerald-400"
                      />
                      <Copy v-else class="h-3.5 w-3.5" />
                    </Button>

                    <!-- Delete file -->
                    <Button
                      size="iconSm"
                      variant="ghost"
                      class="text-muted-foreground hover:text-destructive h-7 w-7"
                      title="Delete Preset File"
                      @click="handleDeletePreset(item.filename)"
                    >
                      <Trash2 class="h-3.5 w-3.5" />
                    </Button>

                    <!-- Apply Actions -->
                    <template v-if="item.data.type === 'both'">
                      <Button
                        size="sm"
                        variant="outline"
                        class="h-7 px-2 text-xs"
                        title="Apply only Positive prompt"
                        @click="applyPrompt(item.data, 'positive')"
                      >
                        + Pos
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        class="h-7 px-2 text-xs"
                        title="Apply only Negative prompt"
                        @click="applyPrompt(item.data, 'negative')"
                      >
                        + Neg
                      </Button>
                      <Button
                        size="sm"
                        class="bg-primary text-primary-foreground hover:bg-primary/90 h-7 px-2.5 text-xs font-semibold"
                        @click="applyPrompt(item.data, 'both')"
                      >
                        Apply Both
                      </Button>
                    </template>

                    <template v-else>
                      <Button
                        size="sm"
                        class="bg-primary text-primary-foreground hover:bg-primary/90 h-7 px-2.5 text-xs font-semibold"
                        @click="applyPrompt(item.data, item.data.type)"
                      >
                        Apply
                        {{ item.data.type === 'positive' ? 'Pos' : 'Neg' }}
                      </Button>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <!-- TAB 2: SAVE CURRENT PROMPT -->
        <TabsContent
          value="save"
          class="m-0 flex flex-1 flex-col overflow-hidden outline-hidden"
        >
          <ScrollArea class="h-[56vh] px-6 py-5.5">
            <div class="flex w-full flex-col gap-5">
              <!-- Success Banner -->
              <div
                v-if="saveSuccessMessage"
                class="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-400"
              >
                <Check class="h-4 w-4" />
                <span>{{ saveSuccessMessage }}</span>
              </div>

              <!-- Preset Name -->
              <div class="flex flex-col gap-1.5">
                <Label class="text-foreground text-xs font-bold"
                  >Preset Name</Label
                >
                <Input
                  v-model="saveName"
                  placeholder="e.g. Masterpiece Cyberpunk Anime"
                  class="text-xs"
                />
              </div>

              <!-- Scope Selection: Both, Positive Only, Negative Only -->
              <div class="flex flex-col gap-1.5">
                <Label class="text-foreground text-xs font-bold"
                  >Preset Scope / Target</Label
                >
                <div class="grid grid-cols-3 gap-2">
                  <button
                    v-for="st in [
                      {
                        val: 'both',
                        title: 'Both Prompts',
                        desc: 'Save Positive & Negative'
                      },
                      {
                        val: 'positive',
                        title: 'Positive Only',
                        desc: 'Save only Positive'
                      },
                      {
                        val: 'negative',
                        title: 'Negative Only',
                        desc: 'Save only Negative'
                      }
                    ]"
                    :key="st.val"
                    type="button"
                    class="border-border hover:border-primary/60 flex cursor-pointer flex-col gap-0.5 rounded-lg border p-2.5 text-left transition-all"
                    :class="
                      saveType === st.val
                        ? 'border-primary bg-primary/10 ring-primary/20 ring-1'
                        : 'bg-card text-muted-foreground'
                    "
                    @click="saveType = st.val as any"
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

              <!-- Optional Description -->
              <div class="flex flex-col gap-1.5">
                <Label class="text-foreground text-xs font-bold"
                  >Description (Optional)</Label
                >
                <Input
                  v-model="saveDescription"
                  placeholder="e.g. Optimized for anime SDXL checkpoints"
                  class="text-xs"
                />
              </div>

              <!-- Editable Prompt Content Preview -->
              <div class="border-border flex flex-col gap-3 border-t pt-3.5">
                <div class="flex items-center justify-between">
                  <span
                    class="text-muted-foreground text-xs font-bold tracking-wider uppercase"
                  >
                    Prompt Content to Save
                  </span>
                  <button
                    type="button"
                    class="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 font-mono text-xs transition-colors"
                    title="Reset to current workflow prompt"
                    @click="resetToCurrentPrompt"
                  >
                    <RotateCcw class="text-primary h-3 w-3" />
                    <span>Reset to Workflow</span>
                  </button>
                </div>

                <div
                  v-if="saveType === 'both' || saveType === 'positive'"
                  class="flex flex-col gap-1.5"
                >
                  <div class="flex items-center justify-between">
                    <span
                      class="font-mono text-xs font-bold text-emerald-400 uppercase"
                      >Positive Prompt</span
                    >
                    <span class="text-muted-foreground font-mono text-xs"
                      >Editable</span
                    >
                  </div>
                  <Textarea
                    v-model="editPositivePrompt"
                    rows="3"
                    placeholder="Type or edit positive prompt to save..."
                    class="bg-background focus:ring-primary/30 font-mono text-xs leading-relaxed"
                  />
                </div>

                <div
                  v-if="saveType === 'both' || saveType === 'negative'"
                  class="flex flex-col gap-1.5"
                >
                  <div class="flex items-center justify-between">
                    <span
                      class="font-mono text-xs font-bold text-rose-400 uppercase"
                      >Negative Prompt</span
                    >
                    <span class="text-muted-foreground font-mono text-xs"
                      >Editable</span
                    >
                  </div>
                  <Textarea
                    v-model="editNegativePrompt"
                    rows="3"
                    placeholder="Type or edit negative prompt to save..."
                    class="bg-background focus:ring-primary/30 font-mono text-xs leading-relaxed"
                  />
                </div>
              </div>
            </div>
          </ScrollArea>

          <!-- Save Tab Footer -->
          <div
            class="border-border bg-muted/30 flex items-center justify-between border-t px-6 py-3"
          >
            <span class="text-muted-foreground text-xs">
              Will be saved as a readable
              <code class="text-foreground font-mono font-semibold">.json</code>
              file in your presets directory.
            </span>

            <Button
              class="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 px-4 text-xs font-semibold"
              :disabled="!saveName.trim()"
              @click="handleSavePreset"
            >
              <Plus class="h-3.5 w-3.5" />
              <span>Save Preset to File</span>
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>
</template>
