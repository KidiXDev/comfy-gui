<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { OTPInput } from 'vue-input-otp';
import { cn } from '@/lib/utils';

interface Props {
  maxlength?: number;
  textAlign?: 'left' | 'center' | 'right';
  inputmode?: 'numeric' | 'text';
  containerClass?: string;
  class?: HTMLAttributes['class'];
  modelValue?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  maxlength: 6
});

const emits = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'complete', value: string): void;
  (e: 'change', value: string): void;
}>();

const delegatedProps = reactiveOmit(props, 'class');
</script>

<template>
  <OTPInput
    v-slot="slotProps"
    v-bind="delegatedProps"
    :container-class="
      cn('flex items-center gap-2 has-disabled:opacity-50', props.class)
    "
    data-slot="input-otp"
    class="disabled:cursor-not-allowed"
    @update:model-value="(val: any) => emits('update:modelValue', val)"
    @complete="(val: any) => emits('complete', val)"
    @change="(val: any) => emits('change', val)"
  >
    <slot v-bind="slotProps" />
  </OTPInput>
</template>
