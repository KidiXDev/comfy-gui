<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { RotateCcw, X, ZoomIn, ZoomOut } from '@lucide/vue';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  src?: string;
  alt?: string;
  title?: string;
}

const props = withDefaults(defineProps<Props>(), {
  src: '',
  alt: 'Image Preview',
  title: ''
});

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'close'): void;
}>();

const zoom = ref(1);
const panX = ref(0);
const panY = ref(0);
const isPanning = ref(false);
let startDragX = 0;
let startDragY = 0;
let startPanX = 0;
let startPanY = 0;
let hasDragged = false;

function resetPanAndZoom() {
  zoom.value = 1;
  panX.value = 0;
  panY.value = 0;
}

function handleClose() {
  emit('update:open', false);
  emit('close');
  resetPanAndZoom();
}

function handlePointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  isPanning.value = true;
  hasDragged = false;
  startDragX = event.clientX;
  startDragY = event.clientY;
  startPanX = panX.value;
  startPanY = panY.value;

  const onPointerMove = (e: PointerEvent) => {
    if (!isPanning.value) return;
    const dx = e.clientX - startDragX;
    const dy = e.clientY - startDragY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasDragged = true;
    }
    panX.value = startPanX + dx;
    panY.value = startPanY + dy;
  };

  const onPointerUp = () => {
    isPanning.value = false;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}

function handleBackdropClick(event: MouseEvent) {
  if (!hasDragged && event.target === event.currentTarget) {
    handleClose();
  }
}

function handleZoom(event: WheelEvent) {
  event.preventDefault();
  event.stopPropagation();
  const newZoom = Math.min(
    5,
    Math.max(1, Number((zoom.value - event.deltaY * 0.002).toFixed(2)))
  );
  if (newZoom === 1) {
    panX.value = 0;
    panY.value = 0;
  }
  zoom.value = newZoom;
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.key === 'Escape') {
    handleClose();
  } else if (event.key === '+' || event.key === '=') {
    zoom.value = Math.min(5, Number((zoom.value + 0.25).toFixed(2)));
  } else if (event.key === '-') {
    zoom.value = Math.max(1, Number((zoom.value - 0.25).toFixed(2)));
    if (zoom.value === 1) {
      panX.value = 0;
      panY.value = 0;
    }
  } else if (event.key === '0') {
    resetPanAndZoom();
  }
}

watch(
  () => [props.open, props.src] as const,
  ([isOpen]) => {
    resetPanAndZoom();
    if (isOpen) {
      window.addEventListener('keydown', handleKeydown);
    } else {
      window.removeEventListener('keydown', handleKeydown);
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-250 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open && src"
        class="fixed inset-0 z-100 flex items-center justify-center overflow-hidden bg-black/70 backdrop-blur-md select-none"
        @click="handleBackdropClick"
        @wheel.prevent.stop="handleZoom"
      >
        <!-- Top Floating Header Overlay -->
        <div
          class="absolute top-0 right-0 left-0 z-20 flex items-center justify-between bg-linear-to-b from-black/80 via-black/40 to-transparent p-4"
          @click.stop
        >
          <!-- Left Title / Info -->
          <div class="flex items-center gap-3">
            <span
              v-if="title"
              class="max-w-md truncate font-mono text-xs font-semibold text-white/90"
              :title="title"
            >
              {{ title }}
            </span>
          </div>

          <!-- Right Action Controls -->
          <div class="flex items-center gap-2">
            <!-- Custom Slot Actions (Reuse Settings, Copy, Download, etc.) -->
            <slot name="actions" />

            <span
              class="rounded-md border border-white/10 bg-black/50 px-2 py-1 font-mono text-xs text-white/80 backdrop-blur-md"
            >
              {{ Math.round(zoom * 100) }}%
            </span>

            <Button
              size="iconSm"
              variant="ghost"
              class="h-8 w-8 text-white/80 hover:bg-white/10 hover:text-white"
              title="Zoom Out (-)"
              @click="
                zoom = Math.max(1, Number((zoom - 0.25).toFixed(2)));
                if (zoom === 1) {
                  panX = 0;
                  panY = 0;
                }
              "
            >
              <ZoomOut class="h-4 w-4" />
            </Button>

            <Button
              size="iconSm"
              variant="ghost"
              class="h-8 w-8 text-white/80 hover:bg-white/10 hover:text-white"
              title="Zoom In (+)"
              @click="zoom = Math.min(5, Number((zoom + 0.25).toFixed(2)))"
            >
              <ZoomIn class="h-4 w-4" />
            </Button>

            <Button
              v-if="zoom !== 1 || panX !== 0 || panY !== 0"
              size="iconSm"
              variant="ghost"
              class="h-8 w-8 text-white/80 hover:bg-white/10 hover:text-white"
              title="Reset Zoom & Pan (0)"
              @click="resetPanAndZoom"
            >
              <RotateCcw class="h-3.5 w-3.5" />
            </Button>

            <Button
              size="iconSm"
              variant="ghost"
              class="hover:bg-destructive/80 h-8 w-8 text-white/80 hover:text-white"
              title="Close (Esc)"
              @click="handleClose"
            >
              <X class="h-4 w-4" />
            </Button>
          </div>
        </div>

        <!-- Fullscreen Image with Pan and Zoom -->
        <img
          :src="src"
          :alt="alt || title || 'Fullscreen Image'"
          draggable="false"
          class="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl select-none"
          :class="[
            isPanning
              ? 'cursor-grabbing duration-0'
              : 'cursor-grab transition-transform duration-100 ease-out'
          ]"
          :style="{
            transform: `translate3d(${panX}px, ${panY}px, 0px) scale(${zoom})`
          }"
          @pointerdown.stop="handlePointerDown"
          @wheel.prevent.stop="handleZoom"
          @dblclick.stop="zoom === 1 ? (zoom = 2) : resetPanAndZoom()"
        />

        <!-- Optional Footer Slot (e.g. metadata overlay) -->
        <div
          v-if="$slots.footer"
          class="absolute right-4 bottom-4 left-4 z-20 flex justify-center"
          @click.stop
        >
          <slot name="footer" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
