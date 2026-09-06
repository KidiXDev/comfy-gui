export interface AiConfig {
  apiKey: string;
  selectedModel: string;
  customSystemPrompt: string;
  enhancerSystemPrompt?: string;
  autoApply: boolean;
  temperature: number;
  contextTokenLimit: number;
  maxOutputTokens: number;
  reasoningEffort?:
    'default' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
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
  supported_parameters?: string[];
}

export type ToolName =
  | 'inspect_current_prompt'
  | 'search_animadex'
  | 'retrieve_animadex_tag_by_id'
  | 'search_character_library'
  | 'inject_positive_prompt'
  | 'inject_negative_prompt'
  | 'queue_generation';

export interface ToolInvocation {
  id: string;
  name: ToolName;
  args: Record<string, unknown>;
  state: 'building' | 'pending' | 'applied' | 'queued' | 'rejected';
  result?: unknown;
  note?: string;
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
  | 'searching'
  | 'injecting'
  | 'awaiting_approval'
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
