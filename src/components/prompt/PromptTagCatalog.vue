<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Layers, Search, X, FolderOpen, RefreshCw } from '@lucide/vue';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { usePromptSuggestionStore } from '@/stores/promptSuggestionStore';
import type { PromptField } from '@/composables/usePromptTextEditing';

const promptSuggestionStore = usePromptSuggestionStore();
const emit = defineEmits<{ insert: [tag: string, target: PromptField] }>();
const libraryTarget = ref<PromptField>('positive');
const selectedCategory = ref<string>('all');
const tagSearchQuery = ref<string>('');
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
</script>
<template>
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

        <AccordionContent class="flex flex-col gap-2.5 px-2.5 pt-1 pb-2.5">
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
                  @click="emit('insert', tag, libraryTarget)"
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
</template>
