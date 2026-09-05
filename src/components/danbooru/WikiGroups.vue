<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  BookOpen,
  Copy,
  Folder,
  FolderOpen,
  Layers,
  Search,
  SearchX,
  Sparkles,
  X
} from '@lucide/vue';
import { toast } from 'vue-sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { wikiPath, type WikiGroup } from '@/services/danbooruWiki';
import { useWorkflowStore } from '@/stores/workflowStore';

const props = defineProps<{ groups: WikiGroup[] }>();

const router = useRouter();
const workflowStore = useWorkflowStore();

const groupQuery = ref('');
const topicQuery = ref('');
const selectedCategory = ref('all');
const activeGroupKey = ref('');

// Extract unique categories from tag groups
const availableCategories = computed(() => {
  const cats = new Set<string>();
  for (const group of props.groups) {
    if (group.category) {
      cats.add(group.category);
    }
  }
  return ['all', ...Array.from(cats)];
});

// Filter groups based on category and left-pane search query
const filteredGroups = computed(() => {
  const q = groupQuery.value.trim().toLowerCase();
  const cat = selectedCategory.value;

  return props.groups.filter((group) => {
    const matchesCategory = cat === 'all' || group.category === cat;
    if (!matchesCategory) return false;
    if (!q) return true;

    return (
      group.title.toLowerCase().includes(q) ||
      group.category.toLowerCase().includes(q) ||
      group.links.some((l) => l.label.toLowerCase().includes(q))
    );
  });
});

// Total count of all topics
const totalTopicsAcrossAllGroups = computed(() =>
  props.groups.reduce((acc, g) => acc + g.links.length, 0)
);

// Determine the currently active group object
const activeGroup = computed(() => {
  if (filteredGroups.value.length === 0) return null;
  if (activeGroupKey.value) {
    const found = filteredGroups.value.find(
      (g) => `${g.category}:${g.title}` === activeGroupKey.value
    );
    if (found) return found;
  }
  return filteredGroups.value[0];
});

// Watch filtered groups and update active key if needed
watch(
  filteredGroups,
  (groups) => {
    if (groups.length === 0) {
      activeGroupKey.value = '';
      return;
    }
    const currentValid = groups.some(
      (g) => `${g.category}:${g.title}` === activeGroupKey.value
    );
    if (!currentValid && groups[0]) {
      activeGroupKey.value = `${groups[0].category}:${groups[0].title}`;
    }
  },
  { immediate: true }
);

function selectGroup(group: WikiGroup) {
  activeGroupKey.value = `${group.category}:${group.title}`;
  topicQuery.value = '';
}

// Topics within the active group, filtered by topicQuery
const filteredTopics = computed(() => {
  if (!activeGroup.value) return [];
  const q = topicQuery.value.trim().toLowerCase();
  if (!q) return activeGroup.value.links;

  return activeGroup.value.links.filter((link) =>
    `${link.label} ${link.title}`.toLowerCase().includes(q)
  );
});

function handleUsePrompt(tag: string) {
  const current = workflowStore.positivePrompt.trim();
  if (current) {
    workflowStore.positivePrompt = `${current}, ${tag}`;
  } else {
    workflowStore.positivePrompt = tag;
  }
  toast.success(`Added "${tag}" to prompt`);
}

function handleCopyTag(tag: string) {
  void navigator.clipboard.writeText(tag);
  toast.success(`Copied "${tag}"`);
}

function resetGroupFilters() {
  groupQuery.value = '';
  selectedCategory.value = 'all';
}
</script>

<template>
  <div class="flex h-full min-h-0 w-full overflow-hidden select-none">
    <!-- Left Pane: Navigator Directory Sidebar -->
    <aside
      class="border-border/60 bg-card/20 flex w-64 shrink-0 flex-col border-r sm:w-72"
    >
      <!-- Filter controls -->
      <div class="border-border/50 flex flex-col gap-2 border-b p-3">
        <!-- Search Input -->
        <div class="relative w-full">
          <Search
            class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
          />
          <Input
            v-model="groupQuery"
            class="border-border/60 bg-secondary/40 focus:bg-background h-7 pr-6 pl-8 text-xs transition-colors"
            placeholder="Search collections…"
          />
          <button
            v-if="groupQuery"
            type="button"
            class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer"
            @click="groupQuery = ''"
          >
            <X class="size-3" />
          </button>
        </div>

        <!-- Category Dropdown -->
        <Select v-model="selectedCategory">
          <SelectTrigger class="border-border/60 bg-secondary/40 h-7 text-xs">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup class="max-h-40 overflow-y-auto">
              <SelectItem value="all">
                All Categories ({{ props.groups.length }})
              </SelectItem>
              <SelectItem
                v-for="cat in availableCategories.filter((c) => c !== 'all')"
                :key="cat"
                :value="cat"
              >
                {{ cat }}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <!-- Collections List -->
      <div class="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        <div
          v-if="filteredGroups.length === 0"
          class="text-muted-foreground py-8 text-center text-xs"
        >
          <p>No collections found</p>
          <Button
            variant="ghost"
            size="sm"
            class="mt-1 h-6 text-xs"
            @click="resetGroupFilters"
          >
            Reset
          </Button>
        </div>

        <button
          v-for="group in filteredGroups"
          :key="`${group.category}:${group.title}`"
          type="button"
          class="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer"
          :class="
            activeGroup &&
            activeGroup.title === group.title &&
            activeGroup.category === group.category
              ? 'bg-primary/10 text-primary font-medium'
              : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
          "
          @click="selectGroup(group)"
        >
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <Folder
              v-if="
                !activeGroup ||
                activeGroup.title !== group.title ||
                activeGroup.category !== group.category
              "
              class="size-3.5 shrink-0 opacity-60"
            />
            <FolderOpen v-else class="text-primary size-3.5 shrink-0" />
            <span class="truncate">{{ group.title }}</span>
          </div>

          <span
            class="font-mono text-[11px] opacity-60"
            :class="
              activeGroup &&
              activeGroup.title === group.title &&
              activeGroup.category === group.category
                ? 'text-primary opacity-100 font-semibold'
                : ''
            "
          >
            {{ group.links.length }}
          </span>
        </button>
      </div>

      <!-- Directory Footer -->
      <div
        class="border-border/50 text-muted-foreground bg-muted/10 flex items-center justify-between border-t px-3 py-2 text-[11px]"
      >
        <span class="flex items-center gap-1.5">
          <Layers class="size-3 text-primary/70" />
          <span>{{ filteredGroups.length }} collections</span>
        </span>
        <span class="font-mono">{{ totalTopicsAcrossAllGroups }} tags</span>
      </div>
    </aside>

    <!-- Right Pane: Tag Chips Explorer -->
    <section class="flex flex-1 flex-col overflow-hidden bg-background">
      <!-- Collection Header Bar -->
      <div
        v-if="activeGroup"
        class="border-border/50 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-5 py-3"
      >
        <div class="flex items-center gap-2.5">
          <span
            class="bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 text-[11px] font-medium"
          >
            {{ activeGroup.category }}
          </span>
          <h2 class="text-base font-bold tracking-tight text-foreground">
            {{ activeGroup.title }}
          </h2>
          <span class="text-muted-foreground font-mono text-xs">
            ({{ activeGroup.links.length }})
          </span>
        </div>

        <div class="flex items-center gap-2">
          <!-- In-group Search -->
          <div class="relative w-48 sm:w-56">
            <Search
              class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
            />
            <Input
              v-model="topicQuery"
              class="border-border/60 bg-secondary/40 focus:bg-background h-7 pr-6 pl-7 text-xs transition-colors"
              placeholder="Filter tags…"
            />
            <button
              v-if="topicQuery"
              type="button"
              class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer"
              @click="topicQuery = ''"
            >
              <X class="size-3" />
            </button>
          </div>

          <!-- Open Wiki Page -->
          <Button
            variant="ghost"
            size="sm"
            class="h-7 gap-1 text-xs font-medium"
            @click="router.push(wikiPath(activeGroup.title))"
          >
            <BookOpen class="text-primary size-3.5" />
            <span>Wiki</span>
          </Button>
        </div>
      </div>

      <!-- Tag Chips Grid -->
      <div v-if="activeGroup" class="flex-1 overflow-y-auto p-4 sm:p-5">
        <div
          v-if="filteredTopics.length"
          class="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
        >
          <div
            v-for="link in filteredTopics"
            :key="`${link.title}-${link.depth}`"
            class="group border-border/50 hover:border-primary/50 bg-secondary/20 hover:bg-secondary/50 flex items-center justify-between gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors"
          >
            <div class="flex min-w-0 flex-1 items-center gap-1.5">
              <span
                v-if="link.depth > 0"
                class="bg-primary/50 size-1 shrink-0 rounded-full"
              />
              <RouterLink
                :to="wikiPath(link.title)"
                class="text-foreground group-hover:text-primary truncate font-medium capitalize transition-colors"
                :title="link.label"
              >
                {{ link.label }}
              </RouterLink>
            </div>

            <!-- Hover Quick Actions -->
            <div
              class="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <button
                type="button"
                title="Append to positive prompt"
                class="text-muted-foreground hover:text-amber-400 p-0.5 transition-colors cursor-pointer"
                @click="handleUsePrompt(link.title)"
              >
                <Sparkles class="size-3" />
              </button>
              <button
                type="button"
                title="Copy tag name"
                class="text-muted-foreground hover:text-foreground p-0.5 transition-colors cursor-pointer"
                @click="handleCopyTag(link.title)"
              >
                <Copy class="size-3" />
              </button>
            </div>
          </div>
        </div>

        <!-- Empty state within active group -->
        <div
          v-else
          class="text-muted-foreground flex flex-col items-center justify-center py-16 text-center text-xs"
        >
          <SearchX class="mb-2 size-6 opacity-50" />
          <p>No tags match “{{ topicQuery }}” in this collection</p>
          <Button
            variant="ghost"
            size="sm"
            class="mt-2 h-7 text-xs"
            @click="topicQuery = ''"
          >
            Clear search
          </Button>
        </div>
      </div>

      <!-- Empty state when no collection selected -->
      <div
        v-else
        class="text-muted-foreground flex flex-1 items-center justify-center text-xs"
      >
        Select a collection from the sidebar
      </div>
    </section>
  </div>
</template>
