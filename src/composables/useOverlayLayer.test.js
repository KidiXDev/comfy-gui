import { describe, expect, test } from 'bun:test';
import { effectScope, nextTick, shallowRef } from 'vue';
import { useOverlayLayer } from './useOverlayLayer';

describe('useOverlayLayer', () => {
  test('puts the most recently opened overlay on top', async () => {
    const firstOpen = shallowRef(false);
    const secondOpen = shallowRef(false);
    const firstScope = effectScope();
    const secondScope = effectScope();
    let first;
    let second;

    firstScope.run(() => (first = useOverlayLayer(firstOpen)));
    secondScope.run(() => (second = useOverlayLayer(secondOpen)));

    firstOpen.value = true;
    secondOpen.value = true;
    await nextTick();
    expect(second.style.value.zIndex).toBeGreaterThan(first.style.value.zIndex);
    expect(first.isTop.value).toBe(false);
    expect(second.isTop.value).toBe(true);
    expect(first.style.value.pointerEvents).toBe('none');
    expect(second.style.value.pointerEvents).toBe('auto');

    firstOpen.value = false;
    await nextTick();
    firstOpen.value = true;
    await nextTick();
    expect(first.style.value.zIndex).toBeGreaterThan(second.style.value.zIndex);
    expect(first.isTop.value).toBe(true);
    expect(second.isTop.value).toBe(false);
    expect(first.style.value.pointerEvents).toBe('auto');
    expect(second.style.value.pointerEvents).toBe('none');

    firstScope.stop();
    secondScope.stop();
  });
});
