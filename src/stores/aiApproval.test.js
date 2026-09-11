import { MockLanguageModelV3 } from 'ai/test';
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPinia, setActivePinia } from 'pinia';
import * as aiService from '../services/aiService';

const workflow = {
  positivePrompt: 'original',
  negativePrompt: 'keep this',
  getFullWorkflowState: () => ({})
};
let queued = 0;
let deferCompletion = false;
let generationResolve;
let requestedTool = 'inject_positive_prompt';
let model;
const usage = { inputTokens: { total: 1 }, outputTokens: { total: 1 } };
const response = (chunks) => ({
  stream: new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    }
  })
});
function newModel() {
  return new MockLanguageModelV3({
    doStream: () =>
      model.doStreamCalls.length === 1
        ? response([
            {
              type: 'tool-call',
              toolCallId: 'approval',
              toolName: requestedTool,
              input: JSON.stringify(
                requestedTool === 'queue_generation'
                  ? {}
                  : { prompt: 'updated' }
              )
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
              usage
            }
          ])
        : response([
            { type: 'text-start', id: 'answer' },
            { type: 'text-delta', id: 'answer', delta: 'Done' },
            { type: 'text-end', id: 'answer' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage
            }
          ])
  });
}
mock.module('../services/aiService', () => ({
  ...aiService,
  fetchAvailableModels: async () => [],
  getOpenRouterModel: () => model
}));
mock.module('../services/appStorage', () => ({
  loadAppData: async () => null,
  saveAppData: async () => {}
}));
mock.module('./workflowStore', () => ({ useWorkflowStore: () => workflow }));
mock.module('./comfyStore', () => ({
  useComfyStore: () => ({
    queueGeneration: async () => {
      queued++;
      return 'prompt-1';
    },
    waitForGeneration: (promptId) => {
      const result = {
        promptId,
        url: 'http://localhost/generated.png',
        filename: 'generated.png'
      };
      if (!deferCompletion) return Promise.resolve(result);
      return new Promise((resolve) => {
        generationResolve = () => resolve(result);
      });
    }
  })
}));
const { useAiStore: getAiStore } = await import('./aiStore');
setActivePinia(createPinia());
const store = getAiStore();
async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  throw new Error('Timed out waiting for approval');
}
const hasGenerationResolver = () => Boolean(generationResolve);
await until(() => store.isLoaded);
store.config.apiKey = 'test-only';
for (const decision of ['accept', 'decline', 'stop', 'queue', 'negative']) {
  model = newModel();
  requestedTool =
    decision === 'negative'
      ? 'inject_negative_prompt'
      : decision === 'queue'
        ? 'queue_generation'
        : 'inject_positive_prompt';
  workflow.positivePrompt = 'original';
  const running = store.sendMessage(
    decision === 'negative'
      ? 'Change my negative prompt'
      : 'Improve my positive prompt'
  );
  await until(
    () => store.activeMessages.at(-1)?.currentStep === 'awaiting_approval'
  );
  const message = store.activeMessages.at(-1);
  await new Promise((resolve) => {
    setTimeout(resolve, 30);
  });
  assert.equal(
    model.doStreamCalls.length,
    1,
    'No model continuation before approval'
  );
  assert.equal(workflow.positivePrompt, 'original');
  assert.equal(workflow.negativePrompt, 'keep this');
  assert.equal(queued, 0);
  assert.ok(
    !model.doStreamCalls[0].tools.some((tool) => tool.name === 'inject_prompt')
  );
  if (decision === 'stop') store.stopGeneration();
  else if (decision === 'decline')
    store.rejectToolInvocation(
      message.id,
      'approval',
      'Keep the original outfit'
    );
  else {
    if (decision === 'queue') deferCompletion = true;
    store.applyToolInvocation(message.id, 'approval');
  }
  if (decision === 'queue') {
    await until(hasGenerationResolver);
    assert.equal(model.doStreamCalls.length, 1);
    generationResolve();
    generationResolve = undefined;
    deferCompletion = false;
  }
  await running;
  assert.equal(store.isGenerating, false);
  if (decision === 'stop') assert.equal(model.doStreamCalls.length, 1);
  else assert.equal(model.doStreamCalls.length, 2);
  if (decision === 'accept') assert.equal(workflow.positivePrompt, 'updated');
  if (decision === 'decline') {
    assert.equal(workflow.positivePrompt, 'original');
    assert.ok(
      JSON.stringify(model.doStreamCalls[1].prompt).includes(
        'Keep the original outfit'
      )
    );
  }
  if (decision === 'queue') {
    assert.equal(queued, 1);
    queued = 0;
  }
  if (decision === 'negative') assert.equal(workflow.negativePrompt, 'updated');
  else assert.equal(workflow.negativePrompt, 'keep this');
}
for (const file of [
  '../components/template/AiAssistantDrawer.vue',
  '../components/settings/AiSettings.vue'
]) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const autoApplySwitch = source
    .match(/<Switch\b[\s\S]*?\/>/gu)
    ?.find((element) => element.includes('aiStore.config.autoApply'));
  assert.ok(autoApplySwitch, `${file}: Auto Apply switch exists`);
  assert.ok(
    autoApplySwitch.includes(':model-value="aiStore.config.autoApply"')
  );
  assert.ok(autoApplySwitch.includes('@update:model-value='));
}

store.config.autoApply = true;
for (const toolName of [
  'inject_positive_prompt',
  'inject_negative_prompt',
  'queue_generation'
]) {
  model = newModel();
  requestedTool = toolName;
  workflow.positivePrompt = 'original';
  workflow.negativePrompt = 'keep this';
  queued = 0;
  const running = store.sendMessage('Apply the requested action');
  await until(() => !store.isGenerating);
  await running;
  assert.equal(
    model.doStreamCalls.length,
    2,
    'Auto Apply continues without approval'
  );
  assert.equal(
    workflow.positivePrompt,
    toolName === 'inject_positive_prompt' ? 'updated' : 'original'
  );
  assert.equal(
    workflow.negativePrompt,
    toolName === 'inject_negative_prompt' ? 'updated' : 'keep this'
  );
  assert.equal(queued, toolName === 'queue_generation' ? 1 : 0);
  if (toolName !== 'queue_generation') {
    const invocation = store.activeMessages.at(-1).toolInvocations[0];
    assert.equal(invocation.result.status, 'applied');
    assert.equal(
      invocation.args.prompt,
      'updated',
      'Prompt stays available to the UI'
    );
    assert.match(
      invocation.result.message,
      /already displayed.*Confirm briefly without repeating/su
    );
    assert.ok(
      JSON.stringify(model.doStreamCalls[1].prompt).includes(
        invocation.result.message
      ),
      'The real SDK continuation receives the injection display and completion contract'
    );
  }
}
console.log(
  'Auto Apply bindings and automatic positive, negative, and queue actions passed.'
);
console.log(
  'Approval pauses real SDK continuation; accept, decline note, stop, queue and separate prompt updates passed.'
);
