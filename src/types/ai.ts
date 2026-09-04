export interface AiConfig {
  apiKey: string;
  selectedModel: string;
  customSystemPrompt: string;
  enhancerSystemPrompt?: string;
  autoApply: boolean;
  temperature: number;
  providerOverride?: string;
  allowProviderFallbacks?: boolean;
}

export interface OpenRouterModelArchitecture {
  modality?: string;
  input_modalities?: string[];
  output_modalities?: string[];
  tokenizer?: string;
}

export interface OpenRouterModelPricing {
  prompt?: string;
  completion?: string;
  image?: string;
  request?: string;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: OpenRouterModelPricing;
  architecture?: OpenRouterModelArchitecture;
}

export type ToolName =
  'inspect_current_prompt' | 'inject_prompt' | 'queue_generation';

export interface ToolInvocation {
  id: string;
  name: ToolName;
  args: Record<string, unknown>;
  state: 'pending' | 'applied' | 'queued' | 'rejected';
  result?: unknown;
  timestamp: number;
}

export interface ChatMessageAttachment {
  id: string;
  name?: string;
  type: string;
  dataUrl: string;
}

export type AgentStep =
  | 'thinking'
  | 'inspecting'
  | 'injecting'
  | 'queueing'
  | 'tool_completed'
  | 'responding'
  | 'done';

export type ChatMessagePart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string; isComplete?: boolean }
  | { type: 'tool'; invocation: ToolInvocation };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  parts?: ChatMessagePart[];
  createdAt: number;
  attachments?: ChatMessageAttachment[];
  toolInvocations?: ToolInvocation[];
  reasoning?: string;
  currentStep?: AgentStep;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}
