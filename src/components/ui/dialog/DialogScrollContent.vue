<script setup lang="ts">
import type {
  DialogContentEmits,
  DialogContentProps,
  FocusOutsideEvent,
  PointerDownOutsideEvent
} from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { X } from '@lucide/vue';
import { reactiveOmit } from '@vueuse/core';
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits
} from 'reka-ui';
import { cn } from '@/lib/utils';

defineOptions({
  inheritAttrs: false
});

const props = defineProps<
  DialogContentProps & { class?: HTMLAttributes['class'] }
>();
const emits = defineEmits<DialogContentEmits>();

const delegatedProps = reactiveOmit(props, 'class');

const forwarded = useForwardPropsEmits(delegatedProps, emits);

function preventTitlebarDismiss(
  event: FocusOutsideEvent | PointerDownOutsideEvent
) {
  const target = event.detail.originalEvent.target;
  if (
    target instanceof Node &&
    !document.querySelector('#app-content')?.contains(target)
  ) {
    event.preventDefault();
  }
}
</script>

<template>
  <DialogPortal defer to="#app-content">
    <DialogOverlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 absolute inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80"
    >
      <DialogContent
        :class="
          cn(
            'border-border bg-background relative z-50 my-8 grid w-full max-w-lg gap-4 border p-6 shadow-lg duration-200 sm:rounded-lg md:w-full',
            props.class
          )
        "
        v-bind="{ ...$attrs, ...forwarded }"
        @interact-outside="preventTitlebarDismiss"
        @pointer-down-outside="
          (event) => {
            const originalEvent = event.detail.originalEvent;
            const target = originalEvent.target as HTMLElement;
            if (
              originalEvent.offsetX > target.clientWidth ||
              originalEvent.offsetY > target.clientHeight
            ) {
              event.preventDefault();
            }
          }
        "
      >
        <slot />

        <DialogClose
          class="hover:bg-secondary absolute top-4 right-4 rounded-md p-0.5 transition-colors"
        >
          <X class="h-4 w-4" />
          <span class="sr-only">Close</span>
        </DialogClose>
      </DialogContent>
    </DialogOverlay>
  </DialogPortal>
</template>
