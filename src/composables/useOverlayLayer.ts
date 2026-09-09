import {
  computed,
  getCurrentInstance,
  onActivated,
  onDeactivated,
  onScopeDispose,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter
} from 'vue';

const activeOverlays = shallowRef<symbol[]>([]);

export function useOverlayLayer(open: MaybeRefOrGetter<boolean>) {
  const id = Symbol('overlay');

  function remove() {
    activeOverlays.value = activeOverlays.value.filter((item) => item !== id);
  }

  function activate() {
    remove();
    activeOverlays.value = [...activeOverlays.value, id];
  }

  watch(
    () => toValue(open),
    (isOpen) => (isOpen ? activate() : remove()),
    { immediate: true }
  );

  if (getCurrentInstance()) {
    onActivated(() => toValue(open) && activate());
    onDeactivated(remove);
  }
  onScopeDispose(remove);

  const index = computed(() => activeOverlays.value.indexOf(id));
  const isTop = computed(
    () => index.value >= 0 && index.value === activeOverlays.value.length - 1
  );
  const style = computed(() => ({
    zIndex: 50 + Math.max(index.value, 0),
    pointerEvents: isTop.value ? ('auto' as const) : ('none' as const)
  }));

  return { isTop, style };
}
