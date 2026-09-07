<script setup lang="ts">
/**
 * PromptFindHighlight
 *
 * Overlay that renders search match highlights aligned pixel-perfectly on top
 * of a textarea by dynamically mirroring its computed styles at runtime.
 *
 * - Current match  → solid amber fill + amber outline  (VS Code current match)
 * - Other matches  → faint amber tint + amber outline  (VS Code other matches)
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

interface FindMatch {
  start: number;
  end: number;
}

const props = defineProps<{
  textareaEl: HTMLTextAreaElement | null;
  text: string;
  matches: FindMatch[];
  currentMatchIndex: number;
  active: boolean;
}>();

// ─── overlay ref ──────────────────────────────────────────────────────────────
const overlayRef = ref<HTMLDivElement | null>(null);

// Properties that affect text layout and must be mirrored exactly from textarea.
const MIRROR_PROPS = [
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'textIndent',
  'textTransform',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderTopStyle',
  'borderRightStyle',
  'borderBottomStyle',
  'borderLeftStyle',
  'boxSizing',
  'direction'
] as const;

// ─── copy computed styles from textarea → overlay ─────────────────────────────
function syncStyles() {
  const ta = props.textareaEl;
  const ov = overlayRef.value;
  if (!ta || !ov) return;

  const cs = window.getComputedStyle(ta);
  for (const prop of MIRROR_PROPS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ov.style as any)[prop] = cs[prop];
  }

  // Border must be transparent (same width) so padding box is identical
  ov.style.borderColor = 'transparent';
  // Overlay must not scroll itself
  ov.style.overflow = 'hidden';
  // Text must be invisible — only the <mark> backgrounds show
  ov.style.color = 'transparent';
  ov.style.background = 'transparent';
  ov.style.pointerEvents = 'none';
  ov.style.userSelect = 'none';
  // Match textarea text-wrap behaviour
  ov.style.whiteSpace = 'pre-wrap';
  ov.style.wordWrap = 'break-word';
  ov.style.overflowWrap = 'break-word';
}

// ─── scroll sync ──────────────────────────────────────────────────────────────
function syncScroll() {
  const ta = props.textareaEl;
  const ov = overlayRef.value;
  if (!ta || !ov) return;
  ov.scrollTop = ta.scrollTop;
  ov.scrollLeft = ta.scrollLeft;
}

let rafId: number | null = null;
function onTextareaScroll() {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    syncScroll();
    rafId = null;
  });
}

watch(
  () => props.textareaEl,
  (el, oldEl) => {
    oldEl?.removeEventListener('scroll', onTextareaScroll);
    if (el) {
      el.addEventListener('scroll', onTextareaScroll, { passive: true });
      void nextTick(() => {
        syncStyles();
        syncScroll();
      });
    }
  },
  { immediate: true }
);

onMounted(() => {
  props.textareaEl?.addEventListener('scroll', onTextareaScroll, {
    passive: true
  });
  void nextTick(() => {
    syncStyles();
    syncScroll();
  });
});

onUnmounted(() => {
  props.textareaEl?.removeEventListener('scroll', onTextareaScroll);
  if (rafId !== null) cancelAnimationFrame(rafId);
});

// ─── build highlighted HTML ───────────────────────────────────────────────────
const highlightedHtml = computed(() => {
  const text = props.text;
  const matches = props.matches;
  if (!props.active || matches.length === 0 || !text) return '';

  let result = '';
  let cursor = 0;

  for (let i = 0; i < matches.length; i++) {
    const { start, end } = matches[i];
    result += escapeHtml(text.slice(cursor, start));
    const cls = i === props.currentMatchIndex ? 'pf-current' : 'pf-other';
    result += `<mark class="${cls}">${escapeHtml(text.slice(start, end))}</mark>`;
    cursor = end;
  }

  result += escapeHtml(text.slice(cursor));
  // Sentinel keeps last line height correct
  result += '<span>\u200B</span>';
  return result;
});

// Re-sync styles + scroll after highlight HTML updates
watch(highlightedHtml, () => {
  void nextTick(() => {
    syncStyles();
    syncScroll();
  });
});

function escapeHtml(str: string) {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\n', '<br>');
}
</script>

<template>
  <div
    v-if="active && matches.length > 0"
    ref="overlayRef"
    aria-hidden="true"
    class="pf-overlay pointer-events-none absolute inset-0"
    v-html="highlightedHtml"
  />
</template>

<style scoped>
/* Base overlay — most styles are injected dynamically via syncStyles() */
.pf-overlay {
  position: absolute;
  inset: 0;
  overflow: hidden;
  color: transparent;
  background: transparent;
  pointer-events: none;
  user-select: none;
  /* Sit above the textarea's own background but below any floating dropdowns */
  z-index: 1;
}

/* Current match: solid amber fill + strong outline */
.pf-overlay :deep(.pf-current) {
  background-color: rgb(251 191 36 / 0.8);
  border-radius: 2px;
  color: transparent;
  outline: 2px solid rgb(245 158 11);
  outline-offset: 0;
}

/* Other matches: faint tint + subtle amber outline */
.pf-overlay :deep(.pf-other) {
  background-color: rgb(251 191 36 / 0.15);
  border-radius: 2px;
  color: transparent;
  outline: 1.5px solid rgb(251 191 36 / 0.65);
  outline-offset: 0;
}
</style>
