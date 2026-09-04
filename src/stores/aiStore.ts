import { streamText, tool } from 'ai';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { z } from 'zod';
import {
  buildSystemPrompt,
  DEFAULT_AI_CONFIG,
  fetchAvailableModels,
  getOpenRouterModel,
  POPULAR_MODELS
} from '../services/aiService';
import { loadAppData, saveAppData } from '../services/appStorage';
import type {
  AiConfig,
  ChatMessage,
  ChatMessageAttachment,
  ChatSession,
  OpenRouterModel,
  ToolInvocation,
  ToolName
} from '../types/ai';
import { useComfyStore } from './comfyStore';
import { useWorkflowStore } from './workflowStore';

export const useAiStore = defineStore('ai', () => {
  const workflowStore = useWorkflowStore();
  const comfyStore = useComfyStore();

  const config = ref<AiConfig>({ ...DEFAULT_AI_CONFIG });
  const sessions = ref<ChatSession[]>([]);
  const activeSessionId = ref<string>('');
  const isDrawerOpen = ref(false);
  const models = ref<OpenRouterModel[]>([...POPULAR_MODELS]);
  const isLoadingModels = ref(false);
  const isGenerating = ref(false);
  const isLoaded = ref(false);
  let currentAbortController: AbortController | null = null;

  const hasApiKey = computed(() => !!config.value.apiKey.trim());

  const activeSession = computed<ChatSession | undefined>(() => {
    if (sessions.value.length === 0) return;
    const found = sessions.value.find((s) => s.id === activeSessionId.value);
    return found || sessions.value[0];
  });

  const activeMessages = computed<ChatMessage[]>(() => {
    return activeSession.value?.messages || [];
  });

  const selectedModelInfo = computed<OpenRouterModel | undefined>(() => {
    return models.value.find((m) => m.id === config.value.selectedModel);
  });

  async function loadConfig() {
    try {
      const saved = await loadAppData<Partial<AiConfig>>('ai_config');
      if (saved) {
        config.value = {
          ...DEFAULT_AI_CONFIG,
          ...saved
        };
      }
    } catch (err) {
      console.warn('Failed to load AI config:', err);
    }
  }

  async function saveConfig() {
    try {
      await saveAppData('ai_config', config.value);
    } catch (err) {
      console.error('Failed to save AI config:', err);
    }
  }

  async function loadChatSessions() {
    try {
      const saved = await loadAppData<ChatSession[]>('chat_sessions');
      if (Array.isArray(saved) && saved.length > 0) {
        sessions.value = saved;
        if (
          !activeSessionId.value ||
          !sessions.value.some((s) => s.id === activeSessionId.value)
        ) {
          activeSessionId.value = sessions.value[0].id;
        }
      } else {
        createSession('New Chat');
      }
    } catch (err) {
      console.warn('Failed to load chat sessions:', err);
      if (sessions.value.length === 0) {
        createSession('New Chat');
      }
    }
  }

  async function saveChatSessions() {
    try {
      // Serialize sessions, ensuring not to save transient state
      await saveAppData('chat_sessions', sessions.value);
    } catch (err) {
      console.error('Failed to save chat sessions to chat.dat:', err);
    }
  }

  function createSession(title = 'New Chat'): ChatSession {
    const newSession: ChatSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };
    sessions.value.unshift(newSession);
    activeSessionId.value = newSession.id;
    void saveChatSessions();
    return newSession;
  }

  function switchSession(id: string) {
    if (sessions.value.some((s) => s.id === id)) {
      activeSessionId.value = id;
    }
  }

  function deleteSession(id: string) {
    const index = sessions.value.findIndex((s) => s.id === id);
    if (index !== -1) {
      sessions.value.splice(index, 1);
      if (sessions.value.length === 0) {
        createSession('New Chat');
      } else if (activeSessionId.value === id) {
        activeSessionId.value = sessions.value[0].id;
      }
      void saveChatSessions();
    }
  }

  function clearAllSessions() {
    sessions.value = [];
    createSession('New Chat');
  }

  async function refreshModels(force = false) {
    isLoadingModels.value = true;
    try {
      const list = await fetchAvailableModels(config.value.apiKey, force);
      if (list && list.length > 0) {
        models.value = list;
      }
    } catch (err) {
      console.warn('Error refreshing models:', err);
    } finally {
      isLoadingModels.value = false;
    }
  }

  function stopGeneration() {
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    isGenerating.value = false;
  }

  async function sendMessage(
    text: string,
    attachments: ChatMessageAttachment[] = []
  ) {
    if (!config.value.apiKey.trim()) {
      throw new Error(
        'OpenRouter API key is not configured. Please set it in Settings or the AI Drawer.'
      );
    }

    let session = activeSession.value;
    if (!session) {
      session = createSession();
    }

    const userMessageId = `msg-${Date.now()}-user`;
    const userMsg: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: text,
      createdAt: Date.now(),
      attachments: attachments.length > 0 ? [...attachments] : undefined
    };
    session.messages.push(userMsg);
    session.updatedAt = Date.now();

    // Auto-generate title if this is the first message and title is default
    if (
      session.messages.filter((m) => m.role === 'user').length === 1 &&
      session.title === 'New Chat'
    ) {
      const cleanTitle = text.trim().slice(0, 32);
      session.title = cleanTitle || 'Prompt Session';
    }

    const assistantMessageId = `msg-${Date.now()}-assistant`;
    const assistantMsg: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      toolInvocations: []
    };
    session.messages.push(assistantMsg);

    isGenerating.value = true;
    currentAbortController = new AbortController();

    try {
      const model = getOpenRouterModel(config.value);
      const systemPrompt = buildSystemPrompt(config.value.customSystemPrompt);

      // Exclude the empty assistant placeholder from history
      const coreMessages = session.messages.slice(0, -1).map((m) => {
        if (m.role === 'user') {
          if (m.attachments && m.attachments.length > 0) {
            const parts: Array<
              { type: 'text'; text: string } | { type: 'image'; image: string }
            > = [];
            if (m.content) {
              parts.push({ type: 'text', text: m.content });
            }
            for (const att of m.attachments) {
              parts.push({ type: 'image', image: att.dataUrl });
            }
            return {
              role: 'user' as const,
              content: parts
            };
          }
          return {
            role: 'user' as const,
            content: m.content
          };
        }
        return {
          role: 'assistant' as const,
          content: m.content
        };
      });

      // Define Focused Agentic Tools
      const tools = {
        inspect_current_prompt: tool({
          description:
            'Inspect the currently active positive and negative prompts in the studio.',
          inputSchema: z.object({}),
          execute: async () => {
            return {
              positivePrompt: workflowStore.positivePrompt,
              negativePrompt: workflowStore.negativePrompt
            };
          }
        }),

        inject_prompt: tool({
          description:
            'Propose or inject new or enhanced positive and/or negative prompts into the studio.',
          inputSchema: z.object({
            positive: z
              .string()
              .optional()
              .describe('New or enhanced positive prompt'),
            negative: z
              .string()
              .optional()
              .describe('New or enhanced negative prompt'),
            reason: z
              .string()
              .optional()
              .describe('Stylistic enhancements or rationale')
          }),
          execute: async (input: {
            positive?: string;
            negative?: string;
            reason?: string;
          }) => {
            if (config.value.autoApply) {
              if (typeof input.positive === 'string') {
                workflowStore.positivePrompt = input.positive;
              }
              if (typeof input.negative === 'string') {
                workflowStore.negativePrompt = input.negative;
              }
              return {
                status: 'applied_automatically',
                positive: input.positive,
                negative: input.negative
              };
            }
            return {
              status: 'pending_user_approval',
              positive: input.positive,
              negative: input.negative,
              reason: input.reason
            };
          }
        }),

        queue_generation: tool({
          description:
            'Trigger the ComfyUI image generation queue with current parameters.',
          inputSchema: z.object({
            reason: z
              .string()
              .optional()
              .describe('Reason for queueing generation')
          }),
          execute: async (input: { reason?: string }) => {
            if (config.value.autoApply) {
              const success = await comfyStore.generateImage(
                workflowStore.getFullWorkflowState()
              );
              return {
                status: success ? 'generation_queued' : 'generation_failed',
                reason: input.reason
              };
            }
            return {
              status: 'pending_user_approval',
              reason: input.reason
            };
          }
        })
      };

      const result = streamText({
        model,
        system: systemPrompt,
        messages: coreMessages,
        tools,
        abortSignal: currentAbortController.signal
      });

      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          assistantMsg.content += part.text;
        } else if (part.type === 'tool-call') {
          const toolName = part.toolName as ToolName;
          const invocation: ToolInvocation = {
            id: part.toolCallId,
            name: toolName,
            args:
              'input' in part && part.input
                ? (part.input as Record<string, unknown>)
                : {},
            state: config.value.autoApply
              ? toolName === 'queue_generation'
                ? 'queued'
                : 'applied'
              : 'pending',
            timestamp: Date.now()
          };
          if (!assistantMsg.toolInvocations) {
            assistantMsg.toolInvocations = [];
          }
          assistantMsg.toolInvocations.push(invocation);
        } else if (part.type === 'tool-result') {
          const existing = assistantMsg.toolInvocations?.find(
            (t) => t.id === part.toolCallId
          );
          if (existing) {
            existing.result = 'output' in part ? part.output : undefined;
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        assistantMsg.content += '\n\n*(Generation stopped)*';
      } else {
        const errorMsg = err instanceof Error ? err.message : String(err);
        assistantMsg.content += `\n\n**Error:** ${errorMsg}`;
      }
    } finally {
      isGenerating.value = false;
      currentAbortController = null;
      session.updatedAt = Date.now();
      void saveChatSessions();
    }
  }

  // Interactive tool actions
  function applyToolInvocation(messageId: string, toolId: string) {
    const session = activeSession.value;
    if (!session) return;
    const msg = session.messages.find((m) => m.id === messageId);
    if (!msg?.toolInvocations) return;
    const inv = msg.toolInvocations.find((t) => t.id === toolId);
    if (!inv) return;

    if (inv.name === 'inject_prompt') {
      const pos = inv.args.positive as string | undefined;
      const neg = inv.args.negative as string | undefined;
      if (typeof pos === 'string') {
        workflowStore.positivePrompt = pos;
      }
      if (typeof neg === 'string') {
        workflowStore.negativePrompt = neg;
      }
      inv.state = 'applied';
      void saveChatSessions();
    }
  }

  async function applyAndQueueToolInvocation(
    messageId: string,
    toolId: string
  ) {
    const session = activeSession.value;
    if (!session) return;
    const msg = session.messages.find((m) => m.id === messageId);
    if (!msg?.toolInvocations) return;
    const inv = msg.toolInvocations.find((t) => t.id === toolId);
    if (!inv) return;

    if (inv.name === 'inject_prompt') {
      const pos = inv.args.positive as string | undefined;
      const neg = inv.args.negative as string | undefined;
      if (typeof pos === 'string') {
        workflowStore.positivePrompt = pos;
      }
      if (typeof neg === 'string') {
        workflowStore.negativePrompt = neg;
      }
      inv.state = 'queued';
    } else if (inv.name === 'queue_generation') {
      inv.state = 'queued';
    }

    await comfyStore.generateImage(workflowStore.getFullWorkflowState());
    void saveChatSessions();
  }

  function rejectToolInvocation(messageId: string, toolId: string) {
    const session = activeSession.value;
    if (!session) return;
    const msg = session.messages.find((m) => m.id === messageId);
    if (!msg?.toolInvocations) return;
    const inv = msg.toolInvocations.find((t) => t.id === toolId);
    if (!inv) return;

    inv.state = 'rejected';
    void saveChatSessions();
  }

  async function init() {
    await Promise.all([loadConfig(), loadChatSessions()]);
    isLoaded.value = true;
    void refreshModels();
  }

  void init();

  return {
    config,
    sessions,
    activeSessionId,
    activeSession,
    activeMessages,
    isDrawerOpen,
    models,
    isLoadingModels,
    isGenerating,
    isLoaded,
    hasApiKey,
    selectedModelInfo,
    init,
    loadConfig,
    saveConfig,
    loadChatSessions,
    saveChatSessions,
    createSession,
    switchSession,
    deleteSession,
    clearAllSessions,
    refreshModels,
    sendMessage,
    stopGeneration,
    applyToolInvocation,
    applyAndQueueToolInvocation,
    rejectToolInvocation
  };
});
