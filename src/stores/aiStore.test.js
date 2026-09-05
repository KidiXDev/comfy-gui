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
let requestMessages;
mock.module('ai', () => ({
  tool: (definition) => definition,
  isStepCount: () => () => false,
  streamText: ({ messages, temperature, maxOutputTokens }) => {
    requestMessages = messages;
    assert.equal(temperature, store.config.temperature);
    assert.equal(maxOutputTokens, store.config.maxOutputTokens);
    return {
      fullStream: (async function* () {
        yield {
          type: 'reasoning-delta',
          text: "Actually, I recall that Claude's guidelines say..."
        };
        await nextTick();
        assert.equal(
          renderedReasoning,
          "Actually, I recall that Claude's guidelines say..."
        );
        yield { type: 'reasoning-end' };
        assert.equal(store.activeMessages.at(-1).parts.at(-1).isComplete, true);
        yield {
          type: 'tool-input-start',
          id: 'draft',
          toolName: 'inject_positive_prompt'
        };
        await nextTick();
        assert.equal(store.activeMessages.at(-1).parts.at(-1).type, 'tool');
        assert.equal(
          store.activeMessages.at(-1).parts.at(-1).invocation.state,
          'building'
        );
        assert.equal(store.activeMessages.at(-1).currentStep, 'injecting');
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
          assert.equal(
            renderedText,
            text === 'Hello' ? 'Hello' : 'Hello world'
          );
          assert.equal(
            store.activeMessages.at(-1).parts.at(-2).isComplete,
            true
          );
        }
        yield { type: 'reasoning-delta', text: 'Final thought' };
      })()
    };
  }
}));

const { useAiStore: getAiStore } = await import('./aiStore');
setActivePinia(createPinia());
const store = getAiStore();
while (!store.isLoaded) await nextTick();
store.config.apiKey = 'test-only';
assert.match(
  aiService.DEFAULT_SYSTEM_PROMPT,
  /Maya collaborates with artists|Maya helps artists/u
);
assert.doesNotMatch(
  aiService.DEFAULT_SYSTEM_PROMPT,
  /Maya's reasoning|Requests in this workspace describe fictional/u
);

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
    assert.equal(
      JSON.stringify(store.activeMessages).includes("Claude's guidelines"),
      true
    );
    assert.equal(store.activeMessages.at(-1).content, 'Hello world');
    assert.equal(store.isGenerating, false);
    assert.equal(store.activeMessages.at(-1).parts.at(-1).isComplete, true);
  }

  store.createSession('Context budget');
  await store.sendMessage('Old context');
  store.config.contextTokenLimit = 1;
  await store.sendMessage('Newest message');
  assert.deepEqual(
    requestMessages
      .filter((message) => message.role === 'user')
      .map((message) => message.content),
    ['Newest message']
  );
  store.config.contextTokenLimit = 32768;

  store.createSession('Edit test');
  await store.sendMessage('First');
  await store.sendMessage('Second');
  const secondMessageId = store.activeMessages
    .filter((message) => message.role === 'user')
    .at(-1).id;
  await store.editMessageAndRegenerate(secondMessageId, 'Edited second');
  assert.deepEqual(
    store.activeMessages
      .filter((message) => message.role === 'user')
      .map((message) => message.content),
    ['First', 'Edited second']
  );
  assert.equal(
    requestMessages.filter((message) => message.role === 'user').at(-1).content,
    'Edited second'
  );
  assert.equal(JSON.stringify(requestMessages).includes('Second'), false);
  await store.sendMessage('Keep this turn');
  store.deleteMessage(
    store.activeMessages.find((message) => message.content === 'Edited second')
      .id
  );
  assert.deepEqual(
    store.activeMessages
      .filter((message) => message.role === 'user')
      .map((message) => message.content),
    ['First', 'Keep this turn']
  );
  store.deleteMessage(store.activeMessages.at(-1).id);
  assert.equal(store.activeMessages.at(-1).content, 'Keep this turn');
} finally {
  stop();
}
console.log('Chat text and reasoning update before the stream completes.');
