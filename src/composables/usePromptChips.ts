import {
  parsePromptToChips,
  reconstructPromptFromChips
} from '@/utils/promptTools';
import { ref, watch, type Ref } from 'vue';

export function usePromptChips(prompt: Ref<string>) {
  const chips = ref(parsePromptToChips(prompt.value));
  const newTag = ref('');
  watch(prompt, (value) => {
    if (reconstructPromptFromChips(chips.value) !== value) {
      chips.value = parsePromptToChips(value);
    }
  });
  function sync() {
    prompt.value = reconstructPromptFromChips(chips.value);
  }
  function toggle(index: number) {
    const chip = chips.value[index];
    if (!chip) return;
    chip.disabled = !chip.disabled;
    sync();
  }
  function remove(index: number) {
    chips.value.splice(index, 1);
    sync();
  }
  function add() {
    const added = parsePromptToChips(newTag.value);
    if (added.length === 0) return;
    chips.value.push(...added);
    newTag.value = '';
    sync();
  }
  return { chips, newTag, sync, toggle, remove, add };
}
