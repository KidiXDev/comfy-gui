import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { AiConfig, OpenRouterModel } from '../types/ai';

export const DEFAULT_AI_CONFIG: AiConfig = {
  apiKey: '',
  selectedModel: 'deepseek/deepseek-v4-flash-vision-exp',
  customSystemPrompt: '',
  enhancerSystemPrompt: '',
  autoApply: false,
  temperature: 0.7,
  providerOverride: '',
  allowProviderFallbacks: true
};

import {
  DEFAULT_ASSISTANT_SYSTEM_PROMPT,
  buildAssistantSystemPrompt
} from '../data/aiPrompts';

export const DEFAULT_SYSTEM_PROMPT = DEFAULT_ASSISTANT_SYSTEM_PROMPT;
export const buildSystemPrompt = buildAssistantSystemPrompt;

export const POPULAR_MODELS: OpenRouterModel[] = [
  {
    id: 'deepseek/deepseek-v4-flash-vision-exp',
    name: 'DeepSeek: DeepSeek V4 Flash Vision (Exp)',
    description:
      'High performance multimodal model with vision and prompt engineering capabilities.',
    context_length: 131072,
    architecture: {
      modality: 'text+image->text',
      input_modalities: ['text', 'image'],
      output_modalities: ['text']
    }
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Google: Gemini 2.5 Flash',
    description: 'Ultra-fast multimodal model with strong reasoning & vision.',
    context_length: 1048576,
    pricing: { prompt: '0.00000015', completion: '0.0000006' },
    architecture: {
      modality: 'text+image->text',
      input_modalities: ['text', 'image'],
      output_modalities: ['text']
    }
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Anthropic: Claude 3.5 Sonnet',
    description: 'Industry-leading prompt intelligence, nuance, and vision.',
    context_length: 200000,
    pricing: { prompt: '0.000003', completion: '0.000015' },
    architecture: {
      modality: 'text+image->text',
      input_modalities: ['text', 'image'],
      output_modalities: ['text']
    }
  },
  {
    id: 'openai/gpt-4o',
    name: 'OpenAI: GPT-4o',
    description: 'High-capability flagship model with vision and tool use.',
    context_length: 128000,
    pricing: { prompt: '0.0000025', completion: '0.00001' },
    architecture: {
      modality: 'text+image->text',
      input_modalities: ['text', 'image'],
      output_modalities: ['text']
    }
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'OpenAI: GPT-4o Mini',
    description: 'Affordable, fast multimodal model for everyday assistance.',
    context_length: 128000,
    pricing: { prompt: '0.00000015', completion: '0.0000006' },
    architecture: {
      modality: 'text+image->text',
      input_modalities: ['text', 'image'],
      output_modalities: ['text']
    }
  },
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek: DeepSeek V3',
    description: 'Strong open-weights model with excellent prompt generation.',
    context_length: 64000,
    pricing: { prompt: '0.00000014', completion: '0.00000028' },
    architecture: {
      modality: 'text->text',
      input_modalities: ['text'],
      output_modalities: ['text']
    }
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Meta: Llama 3.3 70B Instruct',
    description: 'High performance open instruct model.',
    context_length: 131072,
    pricing: { prompt: '0.00000012', completion: '0.0000003' },
    architecture: {
      modality: 'text->text',
      input_modalities: ['text'],
      output_modalities: ['text']
    }
  }
];

let cachedModels: OpenRouterModel[] | null = null;
let lastFetchTime = 0;
// 30 minutes cache TTL
const CACHE_TTL_MS = 1000 * 60 * 30;

export async function fetchAvailableModels(
  apiKey?: string,
  forceRefresh = false
): Promise<OpenRouterModel[]> {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedModels &&
    cachedModels.length > 0 &&
    now - lastFetchTime < CACHE_TTL_MS
  ) {
    return cachedModels;
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (apiKey?.trim()) {
      headers.Authorization = `Bearer ${apiKey.trim()}`;
    }

    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers
    });

    if (!res.ok) {
      console.warn(
        `Failed to fetch OpenRouter models: ${res.status} ${res.statusText}`
      );
      return cachedModels ?? POPULAR_MODELS;
    }

    const json = (await res.json()) as { data?: OpenRouterModel[] };
    if (Array.isArray(json.data) && json.data.length > 0) {
      cachedModels = json.data;
      lastFetchTime = now;
      return cachedModels;
    }
  } catch (error) {
    console.warn('Error fetching OpenRouter models:', error);
  }

  return cachedModels ?? POPULAR_MODELS;
}

export function getOpenRouterProvider(apiKey: string) {
  return createOpenRouter({
    apiKey: apiKey.trim(),
    headers: {
      'HTTP-Referer': 'https://github.com/KidiXDev/comfy-gui',
      'X-Title': 'ComfyUI Studio'
    }
  });
}

export function getOpenRouterModel(config: AiConfig) {
  const provider = getOpenRouterProvider(config.apiKey);
  const settings: Record<string, unknown> = {};

  if (config.providerOverride?.trim()) {
    const order = config.providerOverride
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (order.length > 0) {
      settings.provider = {
        order,
        allow_fallbacks: config.allowProviderFallbacks ?? true
      };
    }
  }

  return provider(config.selectedModel, settings);
}
