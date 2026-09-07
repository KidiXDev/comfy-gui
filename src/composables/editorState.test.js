import { expect, test } from 'bun:test';
import { createRenderer, effectScope, nextTick, ref } from 'vue';
import { useImageBatch } from './useImageBatch';
import { usePromptChips } from './usePromptChips';

test('chips preserve disabled tags during edits and accept external prompts', async () => {
  const scope = effectScope();
  try {
    const prompt = ref('(portrait:1.2), sky');
    const editor = scope.run(() => usePromptChips(prompt));
    editor.toggle(0);
    await nextTick();
    expect(prompt.value).toBe('sky');
    expect(editor.chips.value[0].disabled).toBe(true);
    editor.newTag.value = 'clouds';
    editor.add();
    await nextTick();
    expect(editor.chips.value).toHaveLength(3);
    editor.toggle(0);
    expect(prompt.value).toBe('(portrait:1.2), sky, clouds');
    editor.chips.value.reverse();
    editor.sync();
    await nextTick();
    expect(prompt.value).toBe('clouds, sky, (portrait:1.2)');
    editor.remove(1);
    expect(prompt.value).toBe('clouds, (portrait:1.2)');
    prompt.value = 'external';
    await nextTick();
    expect(editor.chips.value.map((chip) => chip.text)).toEqual(['external']);
  } finally {
    scope.stop();
  }
});

test('image batch tracks selection, dimensions, progress and releases previews', async () => {
  const originalImage = globalThis.Image;
  const originalWindow = globalThis.window;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const revoked = [];
  let sequence = 0;
  globalThis.Image = class {
    naturalWidth = 640;
    naturalHeight = 480;
    get src() {
      return '';
    }
    set src(_value) {
      queueMicrotask(() => this.onload());
    }
  };
  globalThis.window = new EventTarget();
  URL.createObjectURL = () => `blob:test-${++sequence}`;
  URL.revokeObjectURL = (url) => revoked.push(url);
  const renderer = createRenderer({
    createComment: () => ({}),
    insert() {},
    remove() {},
    parentNode: () => null,
    nextSibling: () => null
  });
  let batch;
  const app = renderer.createApp({
    setup: function useBatchHarness() {
      batch = useImageBatch();
      return () => null;
    }
  });
  try {
    app.mount({});
    batch.addFiles([
      new File(['x'], 'one.png', { type: 'image/png' }),
      new File(['x'], 'two.webp'),
      new File(['x'], 'ignored.txt', { type: 'text/plain' })
    ]);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(batch.items.value).toHaveLength(2);
    expect(batch.activeItem.value.width).toBe(640);
    expect(batch.activeItem.value.height).toBe(480);
    batch.items.value[0].status = 'done';
    batch.items.value[1].status = 'queued';
    expect(batch.overallProgress.value).toBe(50);
    expect(batch.processingItems.value).toHaveLength(1);
    batch.items.value[1].status = 'error';
    expect(batch.readyItems.value).toHaveLength(1);
    batch.removeItem(batch.activeItem.value);
    expect(batch.activeItem.value.file.name).toBe('two.webp');
    app.unmount();
    expect(batch.items.value).toHaveLength(0);
    expect(revoked).toEqual(['blob:test-1', 'blob:test-2']);
    batch.addFiles([new File(['x'], 'late.png')]);
    expect(batch.items.value).toHaveLength(0);
  } finally {
    globalThis.Image = originalImage;
    globalThis.window = originalWindow;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});
