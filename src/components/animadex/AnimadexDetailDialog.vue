<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  Layers,
  Palette,
  Plus,
  Replace,
  Search,
  Sparkles,
  User
} from '@lucide/vue';
import { toast } from 'vue-sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useWorkflowStore } from '@/stores/workflowStore';
import type {
  AnimaDexArtist,
  AnimaDexCharacter,
  AnimaDexCopyright
} from '@/types/animadex';

const props = defineProps<{
  open: boolean;
  item: AnimaDexCharacter | AnimaDexArtist | AnimaDexCopyright | null;
  type: 'character' | 'artist' | 'copyright';
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'filter-by-copyright', copyrightSlug: string): void;
  (e: 'filter-by-tag', tag: string): void;
}>();

const router = useRouter();
const workflowStore = useWorkflowStore();

const imageLoaded = ref(false);
const imageError = ref(false);
const copiedAll = ref(false);
const copiedTag = ref<string | null>(null);

const character = computed(() =>
  props.type === 'character' ? (props.item as AnimaDexCharacter) : null
);

const artist = computed(() =>
  props.type === 'artist' ? (props.item as AnimaDexArtist) : null
);

const triggerPrompt = computed(() => {
  if (character.value?.trigger) return character.value.trigger;
  if (artist.value?.trigger) return artist.value.trigger;
  return '';
});

interface DisplayTag {
  text: string;
  isTrigger: boolean;
}

const allTags = computed<DisplayTag[]>(() => {
  const list: DisplayTag[] = [];
  const seen = new Set<string>();

  // 1. Add trigger tag(s) first
  if (triggerPrompt.value) {
    const triggerParts = triggerPrompt.value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    for (const part of triggerParts) {
      const key = part.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        list.push({ text: part, isTrigger: true });
      }
    }
  }

  // 2. Add character core tags
  if (character.value?.tags) {
    for (const tag of character.value.tags) {
      const trimmed = tag.trim();
      const key = trimmed.toLowerCase();
      if (trimmed && !seen.has(key)) {
        seen.add(key);
        list.push({ text: trimmed, isTrigger: false });
      }
    }
  }

  return list;
});

const combinedPromptText = computed(() => {
  return allTags.value.map((t) => t.text).join(', ');
});

const previewImageUrl = computed(() => {
  if (!props.item) return '';
  return (
    ('img_url' in props.item && props.item.img_url) ||
    props.item.thumb_url ||
    ''
  );
});

const formattedCount = computed(() => {
  if (!props.item || (props.item.count !== 0 && !props.item.count)) return '';
  return props.item.count.toLocaleString();
});

const formattedScore = computed(() => {
  if (artist.value && typeof artist.value.score === 'number') {
    return `${(artist.value.score * 100).toFixed(1)}%`;
  }
  return null;
});

async function copyToClipboard(text: string, label = 'Trigger') {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  } catch {
    toast.error('Failed to copy to clipboard');
  }
}

function handleCopyAllPrompt() {
  if (!combinedPromptText.value) return;
  void copyToClipboard(combinedPromptText.value, 'Full prompt');
  copiedAll.value = true;
  setTimeout(() => {
    copiedAll.value = false;
  }, 2000);
}

function handleCopyTag(tag: string) {
  void copyToClipboard(tag, `Tag "${tag}"`);
  copiedTag.value = tag;
  setTimeout(() => {
    if (copiedTag.value === tag) copiedTag.value = null;
  }, 1500);
}

function handleAppendToWorkflow(promptText: string, andNavigate = false) {
  if (!promptText.trim()) return;
  const current = workflowStore.positivePrompt.trim();
  if (current) {
    workflowStore.positivePrompt = `${current}, ${promptText.trim()}`;
  } else {
    workflowStore.positivePrompt = promptText.trim();
  }
  toast.success('Appended to Workflow positive prompt!');
  if (andNavigate) {
    emit('update:open', false);
    router.push('/workflow');
  }
}

function handleReplaceWorkflow(promptText: string, andNavigate = false) {
  if (!promptText.trim()) return;
  workflowStore.positivePrompt = promptText.trim();
  toast.success('Replaced Workflow positive prompt!');
  if (andNavigate) {
    emit('update:open', false);
    router.push('/workflow');
  }
}

async function handleOpenExternal(url?: string) {
  if (!url) return;
  try {
    await openUrl(url);
  } catch {
    window.open(url, '_blank');
  }
}

function handleFilterBySeries() {
  if (character.value?.copyright) {
    emit('filter-by-copyright', character.value.copyright);
    emit('update:open', false);
  }
}

function handleFilterByTag(tag: string) {
  emit('filter-by-tag', tag);
  emit('update:open', false);
}
</script>

<template>
  <Dialog :open="open" @update:open="(val) => emit('update:open', val)">
    <DialogContent
      class="border-border/60 bg-background/95 min-w-[60vw] overflow-hidden p-0 shadow-2xl backdrop-blur-xl sm:rounded-2xl"
    >
      <DialogHeader class="sr-only">
        <DialogTitle>{{ item?.name ?? 'Detail' }}</DialogTitle>
        <DialogDescription
          >Character or artist prompt information</DialogDescription
        >
      </DialogHeader>

      <div
        v-if="item"
        class="grid max-h-[85vh] grid-cols-1 overflow-hidden md:grid-cols-12"
      >
        <!-- Left: Image Preview -->
        <div
          class="bg-muted/20 relative flex min-h-75 items-center justify-center overflow-hidden md:col-span-5 md:min-h-130"
        >
          <!-- Image skeleton -->
          <div
            v-if="!imageLoaded && !imageError && previewImageUrl"
            class="bg-muted/40 absolute inset-0 animate-pulse"
          />

          <img
            v-if="previewImageUrl && !imageError"
            :src="previewImageUrl"
            :alt="item.name"
            class="h-full w-full object-contain object-center transition-opacity duration-300"
            :class="{ 'opacity-0': !imageLoaded, 'opacity-100': imageLoaded }"
            @load="imageLoaded = true"
            @error="imageError = true"
          />

          <div
            v-if="!previewImageUrl || imageError"
            class="text-muted-foreground flex flex-col items-center justify-center gap-2 p-6"
          >
            <User v-if="type === 'character'" class="h-16 w-16 opacity-30" />
            <Palette
              v-else-if="type === 'artist'"
              class="h-16 w-16 opacity-30"
            />
            <Layers v-else class="h-16 w-16 opacity-30" />
            <span class="text-xs opacity-50">Image preview unavailable</span>
          </div>

          <!-- Direct Image View Button -->
          <Button
            v-if="previewImageUrl && !imageError"
            variant="secondary"
            size="sm"
            class="bg-background/80 hover:bg-background absolute right-3 bottom-3 h-7 cursor-pointer gap-1.5 rounded-lg px-2.5 text-xs shadow-xs backdrop-blur-md"
            @click="handleOpenExternal(previewImageUrl)"
          >
            <ArrowUpRight class="h-3 w-3" />
            <span>Full Image</span>
          </Button>
        </div>

        <!-- Right: Information & Action Details -->
        <div class="flex max-h-[85vh] flex-col overflow-hidden md:col-span-7">
          <ScrollArea class="h-full w-full p-6">
            <div class="flex flex-col gap-5 pr-2">
              <!-- Top Header & Badges -->
              <div class="flex flex-col gap-2">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h2
                      class="text-foreground text-xl font-bold tracking-tight"
                    >
                      {{ item.name }}
                    </h2>
                    <div class="mt-1 flex items-center gap-2">
                      <button
                        v-if="
                          character &&
                          (character.copyright_name || character.copyright)
                        "
                        type="button"
                        class="text-primary cursor-pointer text-xs font-medium hover:underline"
                        @click="handleFilterBySeries"
                      >
                        {{ character.copyright_name || character.copyright }}
                      </button>
                      <span
                        v-else-if="artist"
                        class="text-muted-foreground text-xs"
                      >
                        Artist Style Prompt
                      </span>
                      <span v-else class="text-muted-foreground text-xs">
                        Series Franchise
                      </span>
                    </div>
                  </div>

                  <!-- External Reference Button -->
                  <Button
                    v-if="'url' in item && item.url"
                    variant="outline"
                    size="sm"
                    class="h-8 shrink-0 cursor-pointer gap-1.5 rounded-lg px-2.5 text-xs"
                    @click="handleOpenExternal(item.url)"
                  >
                    <span>Danbooru</span>
                    <ExternalLink class="h-3 w-3" />
                  </Button>
                </div>

                <!-- Metadata badges -->
                <div class="flex flex-wrap items-center gap-1.5 pt-1">
                  <Badge variant="secondary" class="text-xs font-normal">
                    {{ formattedCount }} posts
                  </Badge>

                  <Badge
                    v-if="formattedScore"
                    variant="secondary"
                    class="border border-emerald-500/30 bg-emerald-500/15 text-xs text-emerald-400"
                  >
                    Score: {{ formattedScore }}
                  </Badge>

                  <Badge
                    v-if="character?.loras && character.loras.length > 0"
                    variant="secondary"
                    class="border border-purple-500/30 bg-purple-600/20 text-xs text-purple-300"
                  >
                    {{ character.loras.length }} LoRA{{
                      character.loras.length > 1 ? 's' : ''
                    }}
                    Available
                  </Badge>
                </div>
              </div>

              <!-- Unified Prompt & Tags Field (Trigger tags placed first) -->
              <div
                v-if="allTags.length > 0"
                class="border-border/60 bg-muted/20 flex flex-col gap-3 rounded-xl border p-4"
              >
                <!-- Header -->
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <Sparkles class="text-primary h-4 w-4" />
                    <span
                      class="text-muted-foreground text-xs font-semibold tracking-wider uppercase"
                    >
                      Prompt & Tags ({{ allTags.length }})
                    </span>
                  </div>

                  <div class="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      class="h-7 cursor-pointer gap-1 px-2.5 text-xs font-medium"
                      @click="handleCopyAllPrompt"
                    >
                      <Check
                        v-if="copiedAll"
                        class="h-3.5 w-3.5 text-emerald-500"
                      />
                      <Copy v-else class="h-3.5 w-3.5" />
                      <span>{{ copiedAll ? 'Copied' : 'Copy Prompt' }}</span>
                    </Button>
                  </div>
                </div>

                <!-- Combined Full Prompt Box -->
                <div
                  class="bg-background/80 border-border/40 text-foreground max-h-36 overflow-y-auto rounded-lg border p-3 font-mono text-xs leading-relaxed select-text"
                >
                  {{ combinedPromptText }}
                </div>

                <!-- Action Buttons to Workflow -->
                <div class="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    class="h-8 cursor-pointer gap-1.5 px-3 text-xs font-medium"
                    @click="handleAppendToWorkflow(combinedPromptText, false)"
                  >
                    <Plus class="h-3.5 w-3.5" />
                    <span>Append to Workflow</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="secondary"
                    class="h-8 cursor-pointer gap-1.5 px-3 text-xs"
                    @click="handleReplaceWorkflow(combinedPromptText, false)"
                  >
                    <Replace class="h-3.5 w-3.5" />
                    <span>Replace Prompt</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    class="ml-auto h-8 cursor-pointer gap-1.5 px-3 text-xs"
                    @click="handleAppendToWorkflow(combinedPromptText, true)"
                  >
                    <span>Use & Open Workflow</span>
                    <ArrowUpRight class="h-3.5 w-3.5" />
                  </Button>
                </div>

                <!-- Interactive Tag Chips (Trigger tags placed first) -->
                <div
                  class="border-border/40 flex flex-col gap-1.5 border-t pt-2.5"
                >
                  <div class="flex items-center justify-between">
                    <span class="text-muted-foreground text-xs font-medium">
                      All Tags (Click to copy, + to append):
                    </span>
                    <span class="text-muted-foreground/70 text-xs">
                      Highlighted tags are triggers
                    </span>
                  </div>

                  <div
                    class="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto pr-1"
                  >
                    <button
                      v-for="tagItem in allTags"
                      :key="tagItem.text"
                      type="button"
                      class="group relative inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors"
                      :class="
                        tagItem.isTrigger
                          ? 'border-primary/50 bg-primary/15 text-primary hover:bg-primary/25 font-medium'
                          : 'border-border/50 bg-secondary/30 text-secondary-foreground hover:border-primary/50 hover:bg-secondary'
                      "
                      :title="`Click to copy: ${tagItem.text}`"
                      @click="handleCopyTag(tagItem.text)"
                    >
                      <Sparkles
                        v-if="tagItem.isTrigger"
                        class="text-primary h-3 w-3 shrink-0"
                      />
                      <Check
                        v-if="copiedTag === tagItem.text"
                        class="h-3 w-3 shrink-0 text-emerald-500"
                      />
                      <span>{{ tagItem.text }}</span>
                      <span
                        class="text-primary hover:text-primary/80 ml-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                        title="Append tag to workflow prompt"
                        @click.stop="
                          handleAppendToWorkflow(tagItem.text, false)
                        "
                      >
                        <Plus class="h-3 w-3" />
                      </span>
                      <span
                        class="text-muted-foreground hover:text-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        title="Search by this tag"
                        @click.stop="handleFilterByTag(tagItem.text)"
                      >
                        <Search class="h-3 w-3" />
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Associated LoRAs -->
              <div
                v-if="
                  character && character.loras && character.loras.length > 0
                "
                class="flex flex-col gap-2"
              >
                <span
                  class="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase"
                >
                  <Layers class="h-3.5 w-3.5 text-purple-400" />
                  Trained LoRA Models
                </span>

                <div class="flex flex-col gap-2">
                  <div
                    v-for="lora in character.loras"
                    :key="lora.name"
                    class="flex items-center justify-between gap-3 rounded-xl border border-purple-500/20 bg-purple-500/5 p-2.5 transition-colors hover:border-purple-500/40"
                  >
                    <div class="flex items-center gap-2.5 overflow-hidden">
                      <img
                        v-if="lora.thumb"
                        :src="lora.thumb"
                        :alt="lora.name"
                        class="bg-muted/40 h-10 w-10 shrink-0 rounded-lg object-cover"
                      />
                      <div class="flex flex-col overflow-hidden">
                        <span
                          class="text-foreground truncate text-xs font-semibold"
                          :title="lora.name"
                        >
                          {{ lora.name }}
                        </span>
                        <span class="text-muted-foreground text-xs"
                          >Civitai Model</span
                        >
                      </div>
                    </div>

                    <Button
                      v-if="lora.url"
                      size="sm"
                      variant="outline"
                      class="h-7 shrink-0 cursor-pointer gap-1 border-purple-500/30 px-2 text-xs hover:bg-purple-500/10"
                      @click="handleOpenExternal(lora.url)"
                    >
                      <span>Civitai</span>
                      <ExternalLink class="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
