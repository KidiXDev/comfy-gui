<script setup lang="ts">
import { Plus, X } from '@lucide/vue';
import { vDraggable } from 'vue-draggable-plus';
import { Button } from '@/components/ui/button';
import { usePromptChips } from '@/composables/usePromptChips';

defineProps<{ negative?: boolean }>();
const prompt = defineModel<string>({ required: true });
const { chips, newTag, sync, toggle, remove, add } = usePromptChips(prompt);
</script>
<template>
  <div
    :class="negative ? 'max-h-112 min-h-24' : 'max-h-128 min-h-28'"
    class="border-border bg-background flex resize-y flex-col justify-between gap-2.5 overflow-auto rounded-md border p-2.5"
  >
    <div
      v-draggable="[
        chips,
        {
          animation: 200,
          ghostClass: negative ? 'ghost-chip-negative' : 'ghost-chip',
          chosenClass: negative ? 'chosen-chip-negative' : 'chosen-chip',
          dragClass: 'drag-chip',
          onEnd: sync
        }
      ]"
      class="flex flex-1 flex-wrap content-start items-start gap-1.5 overflow-y-auto pr-1"
    >
      <div
        v-for="(chip, idx) in chips"
        :key="chip.id"
        class="group inline-flex shrink-0 cursor-grab items-center gap-1.5 self-start rounded-md border px-2 py-0.5 font-mono text-xs shadow-2xs transition-colors select-none active:cursor-grabbing"
        :class="[
          chip.disabled
            ? 'border-border/40 bg-muted/30 text-muted-foreground/50 border-dashed line-through opacity-50'
            : 'border-border/80 bg-secondary/80 text-foreground hover:border-primary/50'
        ]"
        @dblclick="toggle(idx)"
      >
        <span class="font-medium" :class="{ 'line-through': chip.disabled }">{{
          chip.text
        }}</span>

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
          @click.stop="remove(idx)"
        >
          <X class="h-2.5 w-2.5" />
        </button>
      </div>

      <div
        v-if="chips.length === 0"
        class="text-muted-foreground py-2 text-xs italic"
      >
        {{
          negative
            ? 'No negative prompt tags.'
            : 'No prompt tags. Type in the input below to add tags.'
        }}
      </div>
    </div>

    <!-- Add new tag chip bar -->
    <div class="border-border/40 flex items-center gap-1.5 border-t pt-2">
      <input
        v-model="newTag"
        type="text"
        placeholder="Type new tag(s) and press Enter..."
        class="border-border bg-secondary/50 focus:border-primary h-7 flex-1 rounded px-2 font-mono text-xs outline-none"
        @keydown.enter.prevent="add()"
      />
      <Button size="sm" variant="secondary" class="h-7 text-xs" @click="add()">
        <Plus class="mr-1 h-3 w-3" /> Add Tag
      </Button>
    </div>
  </div>
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
