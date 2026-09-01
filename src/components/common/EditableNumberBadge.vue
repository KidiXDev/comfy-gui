<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: number;
    min?: number;
    max?: number;
    step?: number;
    decimals?: number;
    prefix?: string;
    suffix?: string;
    badgeClass?: string;
    inputClass?: string;
    disabled?: boolean;
  }>(),
  {
    min: undefined,
    max: undefined,
    step: 1,
    decimals: undefined,
    prefix: '',
    suffix: '',
    badgeClass: '',
    inputClass: '',
    disabled: false
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', val: number): void;
}>();

const isEditing = ref(false);
const editValue = ref<number | string>(props.modelValue);
const inputRef = ref<HTMLInputElement | null>(null);

watch(
  () => props.modelValue,
  (newVal) => {
    if (!isEditing.value) {
      editValue.value = newVal;
    }
  }
);

function startEditing() {
  editValue.value = props.modelValue;
  isEditing.value = true;
  nextTick(() => {
    inputRef.value?.focus();
    inputRef.value?.select();
  });
}

function commit() {
  if (!isEditing.value) return;
  let parsed =
    typeof editValue.value === 'number'
      ? editValue.value
      : Number(String(editValue.value));
  if (Number.isNaN(parsed)) {
    parsed = props.modelValue;
  }

  if (props.min !== undefined && parsed < props.min) {
    parsed = props.min;
  }
  if (props.max !== undefined && parsed > props.max) {
    parsed = props.max;
  }

  if (props.decimals !== undefined) {
    parsed = Number(parsed.toFixed(props.decimals));
  }

  emit('update:modelValue', parsed);
  isEditing.value = false;
}

function cancel() {
  editValue.value = props.modelValue;
  isEditing.value = false;
}

function formatDisplay(val: number): string {
  if (props.decimals !== undefined) {
    return Number(val).toFixed(props.decimals);
  }
  return String(val);
}
</script>

<template>
  <div class="inline-flex items-center">
    <input
      v-if="isEditing"
      ref="inputRef"
      v-model="editValue"
      type="number"
      :min="min"
      :max="max"
      :step="step"
      class="border-primary bg-background text-foreground focus:ring-primary/40 h-5 w-14 rounded border px-1 text-center font-mono text-xs font-semibold shadow-xs focus:ring-1 focus:outline-none"
      :class="inputClass"
      @blur="commit"
      @keydown.enter="commit"
      @keydown.esc="cancel"
    />
    <button
      v-else
      type="button"
      :title="disabled ? 'Disabled' : 'Click to enter exact value'"
      :disabled="disabled"
      class="border-border bg-muted text-foreground hover:border-primary/50 hover:bg-accent hover:text-primary min-w-7 cursor-pointer rounded-md border px-1.5 py-0.5 text-center font-mono text-xs font-semibold transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50"
      :class="badgeClass"
      @click="!disabled && startEditing()"
    >
      {{ prefix }}{{ formatDisplay(modelValue) }}{{ suffix }}
    </button>
  </div>
</template>
