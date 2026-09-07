<script setup lang="ts">
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from '@/components/ui/resizable';

withDefaults(
  defineProps<{
    sidebarSize?: number;
    sidebarMinSize?: number;
    sidebarMaxSize?: number;
    previewMinSize?: number;
  }>(),
  {
    sidebarSize: 34,
    sidebarMinSize: 24,
    sidebarMaxSize: 50,
    previewMinSize: 50
  }
);
</script>

<template>
  <ResizablePanelGroup
    direction="horizontal"
    class="min-h-0 w-full flex-1 gap-2 overflow-hidden p-3"
  >
    <ResizablePanel
      :default-size="sidebarSize"
      :min-size="sidebarMinSize"
      :max-size="sidebarMaxSize"
      class="h-full min-h-0 min-w-0"
    >
      <slot name="sidebar" />
    </ResizablePanel>
    <ResizableHandle
      with-handle
      class="hover:bg-primary/50 transition-colors"
    />
    <ResizablePanel
      :default-size="100 - sidebarSize"
      :min-size="previewMinSize"
      class="h-full min-h-0 min-w-0"
    >
      <slot />
    </ResizablePanel>
  </ResizablePanelGroup>
</template>
