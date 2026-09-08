<script setup lang="ts">
import { Image, ImageOff, X } from '@lucide/vue';
import type { ChatMessageMention } from '@/types/ai';

defineProps<{
  mention: ChatMessageMention;
  editable?: boolean;
  visionSupported?: boolean;
}>();

defineEmits<{
  remove: [];
  toggleImage: [];
}>();
</script>

<template>
  <div
    class="border-primary/25 bg-primary/5 flex max-w-full items-center gap-2 rounded-lg border p-1.5 text-xs"
  >
    <img
      v-if="mention.imageDataUrl || mention.imageUrl"
      :src="mention.imageDataUrl || mention.imageUrl"
      :alt="mention.label"
      class="h-9 w-9 shrink-0 rounded object-cover"
    />
    <div class="min-w-0 flex-1">
      <p class="text-foreground truncate font-medium">{{ mention.label }}</p>
      <p class="text-muted-foreground truncate">{{ mention.detail }}</p>
      <p v-if="mention.imageUnavailable" class="text-muted-foreground">
        Image sent as metadata only
      </p>
    </div>
    <button
      v-if="editable"
      type="button"
      class="text-muted-foreground hover:text-primary rounded p-1"
      :title="
        visionSupported
          ? 'Send image to vision model'
          : 'Image stays in chat UI until a vision model is selected'
      "
      @click="$emit('toggleImage')"
    >
      <Image v-if="mention.includeImage" class="h-3.5 w-3.5" />
      <ImageOff v-else class="h-3.5 w-3.5" />
    </button>
    <button
      v-if="editable"
      type="button"
      class="text-muted-foreground hover:text-destructive rounded p-1"
      title="Remove mention"
      @click="$emit('remove')"
    >
      <X class="h-3.5 w-3.5" />
    </button>
  </div>
</template>
