import { mock } from 'bun:test';
import assert from 'node:assert/strict';

mock.module('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: () => (id, settings) => ({ id, settings })
}));

const { DEFAULT_AI_CONFIG, getOpenRouterModel, supportsReasoning } =
  await import('./aiService');
const model = {
  id: DEFAULT_AI_CONFIG.selectedModel,
  name: 'Test',
  supported_parameters: ['reasoning']
};
assert.equal(supportsReasoning(model), true);
assert.equal(supportsReasoning(), false);
for (const effort of ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']) {
  const config = { ...DEFAULT_AI_CONFIG, reasoningEffort: effort };
  assert.deepEqual(getOpenRouterModel(config, model).settings.reasoning, {
    effort
  });
  assert.equal(getOpenRouterModel(config).settings.reasoning, undefined);
  assert.equal(
    getOpenRouterModel(config, { ...model, supported_parameters: [] }).settings
      .reasoning,
    undefined
  );
  assert.equal(
    getOpenRouterModel({ ...config, selectedModel: 'other' }, model).settings
      .reasoning,
    undefined
  );
}
for (const effort of ['default', undefined, 'invalid']) {
  assert.equal(
    getOpenRouterModel({ ...DEFAULT_AI_CONFIG, reasoningEffort: effort }, model)
      .settings.reasoning,
    undefined
  );
}
console.log(
  'Reasoning settings respect model support, selection, defaults, and effort levels.'
);
