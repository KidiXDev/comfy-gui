import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick, watchEffect } from 'vue';
import * as aiService from '../services/aiService';

mock.module('../services/aiService', () => ({
  ...aiService,
  fetchAvailableModels: async () => [],
  getOpenRouterModel: () => ({})
}));
mock.module('../services/appStorage', () => ({
  loadAppData: async () => null,
  saveAppData: async () => {}
}));
mock.module('./workflowStore', () => ({ useWorkflowStore: () => ({}) }));
mock.module('./comfyStore', () => ({ useComfyStore: () => ({}) }));

let renderedText;
let renderedReasoning;
mock.module('ai', () => ({
  tool: (definition) => definition,
  isStepCount: () => () => false,
  streamText: () => ({
    fullStream: (async function* () {
      yield { type: 'reasoning-delta', text: 'Thinking' };
      await nextTick();
      assert.equal(renderedReasoning, 'Thinking');
      yield { type: 'reasoning-end' };
      assert.equal(store.activeMessages.at(-1).parts.at(-1).isComplete, true);
      yield {
        type: 'tool-call',
        toolName: 'inspect_current_prompt',
        toolCallId: 'inspect',
        input: {}
      };
      yield { type: 'tool-result', toolCallId: 'inspect', output: {} };
      yield { type: 'reasoning-delta', text: 'Again' };
      assert.equal(store.activeMessages.at(-1).parts[0].isComplete, true);
      assert.equal(
        store.activeMessages.at(-1).parts.at(-1).isComplete,
        undefined
      );
      for (const text of ['Hello', ' world']) {
        yield { type: 'text-delta', text };
        await nextTick();
        assert.equal(store.isGenerating, true);
        assert.equal(renderedText, text === 'Hello' ? 'Hello' : 'Hello world');
        assert.equal(store.activeMessages.at(-1).parts.at(-2).isComplete, true);
      }
      yield { type: 'reasoning-delta', text: 'Final thought' };
    })()
  })
}));

const { useAiStore: getAiStore } = await import('./aiStore');
setActivePinia(createPinia());
const store = getAiStore();
while (!store.isLoaded) await nextTick();
store.config.apiKey = 'test-only';

const stop = watchEffect(() => {
  const parts = store.activeMessages.at(-1)?.parts ?? [];
  renderedText = parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
  renderedReasoning = parts
    .filter((part) => part.type === 'reasoning')
    .map((part) => part.text)
    .join('');
});

try {
  // Check both the existing session and sendMessage's empty-session fallback.
  for (const emptySession of [false, true]) {
    if (emptySession) store.sessions = [];
    await store.sendMessage('Hello');
    assert.equal(store.activeMessages.at(-1).content, 'Hello world');
    assert.equal(store.isGenerating, false);
    assert.equal(store.activeMessages.at(-1).parts.at(-1).isComplete, true);
  }
} finally {
  stop();
}
console.log('Chat text and reasoning update before the stream completes.');
