import { isStepCount, streamText, tool } from 'ai';
import { defineStore } from 'pinia';
import { computed, reactive, ref } from 'vue';
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
  ChatMessagePart,
  ChatSession,
  OpenRouterModel,
  ToolInvocation,
  ToolName
} from '../types/ai';
import { useComfyStore } from './comfyStore';
import { useWorkflowStore } from './workflowStore';

type ApprovalDecision = {
  action: 'accept' | 'queue' | 'decline';
  note?: string;
};

function sanitizeLegacySessionInvocations(session: ChatSession) {
  for (const msg of session.messages) {
    if (msg.toolInvocations) {
      for (const inv of msg.toolInvocations) {
        if (inv.state === 'pending') inv.state = 'rejected';
        if (inv.name === 'inspect_current_prompt') {
          inv.state = 'applied';
        }
      }
    }
    for (const part of msg.parts ?? []) {
      if (part.type === 'tool' && part.invocation.state === 'pending')
        part.invocation.state = 'rejected';
    }
    // Synthesize chronological parts for legacy messages if not present
    if (!msg.parts || msg.parts.length === 0) {
      const parts: ChatMessagePart[] = [];
      if (msg.reasoning) {
        parts.push({
          type: 'reasoning',
          text: msg.reasoning,
          isComplete: true
        });
      }
      if (msg.toolInvocations && msg.toolInvocations.length > 0) {
        for (const inv of msg.toolInvocations) {
          parts.push({ type: 'tool', invocation: inv });
        }
      }
      if (msg.content) {
        parts.push({ type: 'text', text: msg.content });
      }
      msg.parts = parts;
    }
  }
}

function appendTextPart(parts: ChatMessagePart[], text: string) {
  const lastPart = parts.at(-1);
  if (lastPart && lastPart.type === 'text') {
    lastPart.text += text;
  } else {
    parts.push({ type: 'text', text });
  }
}

function appendReasoningPart(parts: ChatMessagePart[], text: string) {
  const lastPart = parts.at(-1);
  if (lastPart && lastPart.type === 'reasoning' && !lastPart.isComplete) {
    lastPart.text += text;
  } else {
    parts.push({ type: 'reasoning', text });
  }
}

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
  const approvals = new Map<
    string,
    {
      messageId: string;
      promise: Promise<ApprovalDecision>;
      resolve: (decision: ApprovalDecision) => void;
    }
  >();

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
        // Sanitize any legacy inspect_current_prompt that might have been saved as 'pending'
        saved.forEach((s) => sanitizeLegacySessionInvocations(s));
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
    const newSession = reactive<ChatSession>({
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    });
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
    if (
      sessions.value
        .find((s) => s.id === id)
        ?.messages.some((m) =>
          [...approvals.values()].some((a) => a.messageId === m.id)
        )
    )
      stopGeneration();
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

  function renameSession(id: string, newTitle: string) {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    const session = sessions.value.find((s) => s.id === id);
    if (session) {
      session.title = trimmed;
      session.updatedAt = Date.now();
      void saveChatSessions();
    }
  }

  function clearAllSessions() {
    stopGeneration();
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
  }

  async function sendMessage(
    text: string,
    attachments: ChatMessageAttachment[] = []
  ) {
    if (isGenerating.value) return;
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
    const assistantMsg = reactive<ChatMessage>({
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      parts: [],
      createdAt: Date.now(),
      toolInvocations: [],
      reasoning: '',
      currentStep: 'thinking'
    });
    session.messages.push(assistantMsg);

    isGenerating.value = true;
    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

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
          content:
            m.content +
            (m.toolInvocations?.length
              ? '\nTool decisions: ' +
                JSON.stringify(
                  m.toolInvocations.map(
                    ({ name, args, state, result, note }) => ({
                      name,
                      args,
                      state,
                      result,
                      note
                    })
                  )
                )
              : '')
        };
      });

      const executeStudioTool = async (
        name:
          | 'inject_positive_prompt'
          | 'inject_negative_prompt'
          | 'queue_generation',
        input: { prompt?: string; reason?: string },
        toolCallId: string
      ) => {
        signal.throwIfAborted();
        const inv = reactive<ToolInvocation>({
          id: toolCallId,
          name,
          args: input,
          state: 'pending',
          timestamp: Date.now()
        });
        assistantMsg.toolInvocations?.push(inv);
        assistantMsg.parts?.push({ type: 'tool', invocation: inv });
        try {
          let decision: ApprovalDecision = { action: 'accept' };
          if (!config.value.autoApply) {
            assistantMsg.currentStep = 'awaiting_approval';
            let resolveDecision!: (value: ApprovalDecision) => void;
            const promise = new Promise<ApprovalDecision>((resolve) => {
              resolveDecision = resolve;
            });
            const abort = () => finish({ action: 'decline' });
            const finish = (value: ApprovalDecision) => {
              signal.removeEventListener('abort', abort);
              resolveDecision(value);
            };
            approvals.set(toolCallId, {
              messageId: assistantMsg.id,
              promise,
              resolve: finish
            });
            signal.addEventListener('abort', abort, { once: true });
            decision = await promise;
          }
          signal.throwIfAborted();
          inv.note = decision.note;
          if (decision.action === 'decline') {
            inv.state = 'rejected';
            return {
              status: 'rejected_by_user',
              note: decision.note || '',
              applied: false
            };
          }
          if (name !== 'queue_generation' && typeof input.prompt !== 'string')
            throw new Error('Prompt text is required');
          if (
            name === 'inject_positive_prompt' &&
            typeof input.prompt === 'string'
          )
            workflowStore.positivePrompt = input.prompt;
          if (
            name === 'inject_negative_prompt' &&
            typeof input.prompt === 'string'
          )
            workflowStore.negativePrompt = input.prompt;
          inv.state = name === 'queue_generation' ? 'pending' : 'applied';
          if (name === 'queue_generation' || decision.action === 'queue') {
            assistantMsg.currentStep = 'queueing';
            const success = await comfyStore.generateImage(
              workflowStore.getFullWorkflowState()
            );
            inv.state = success
              ? 'queued'
              : name === 'queue_generation'
                ? 'rejected'
                : 'applied';
            return {
              status: success ? 'generation_queued' : 'generation_failed',
              prompt: input.prompt
            };
          }
          return { status: 'applied', prompt: input.prompt };
        } catch (error) {
          if (inv.state === 'pending') inv.state = 'rejected';
          throw error;
        } finally {
          approvals.delete(toolCallId);
          void saveChatSessions();
        }
      };

      // Define Focused Agentic Tools
      const tools = {
        inspect_current_prompt: tool({
          description:
            'Inspect the currently active positive and negative prompts in the studio.',
          inputSchema: z.object({}),
          execute: async () => {
            return {
              positivePrompt: workflowStore.positivePrompt || '',
              negativePrompt: workflowStore.negativePrompt || ''
            };
          }
        }),

        inject_positive_prompt: tool({
          description:
            'Propose or inject a new or enhanced positive prompt into the studio.',
          inputSchema: z.object({
            prompt: z.string().describe('New or enhanced positive prompt text'),
            reason: z
              .string()
              .optional()
              .describe('Stylistic enhancements or creative rationale')
          }),
          execute: (input, { toolCallId }) =>
            executeStudioTool('inject_positive_prompt', input, toolCallId)
        }),

        inject_negative_prompt: tool({
          description:
            'Change only the negative prompt, and only when the user explicitly requests a negative prompt change. Generic prompt improvements must use inject_positive_prompt and preserve the current negative prompt.',
          inputSchema: z.object({
            prompt: z.string().describe('New or enhanced negative prompt text'),
            reason: z
              .string()
              .optional()
              .describe('Negative blocker adjustments or rationale')
          }),
          execute: (input, { toolCallId }) =>
            executeStudioTool('inject_negative_prompt', input, toolCallId)
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
          execute: (input, { toolCallId }) =>
            executeStudioTool('queue_generation', input, toolCallId)
        })
      };

      const result = streamText({
        model,
        system: systemPrompt,
        messages: coreMessages,
        tools,
        stopWhen: isStepCount(5),
        abortSignal: currentAbortController.signal
      });

      for await (const part of result.fullStream) {
        if (!assistantMsg.parts) assistantMsg.parts = [];
        const lastPart = assistantMsg.parts.at(-1);
        if (
          lastPart?.type === 'reasoning' &&
          [
            'reasoning-end',
            'text-start',
            'text-delta',
            'tool-input-start',
            'tool-call',
            'finish-step'
          ].includes(part.type)
        ) {
          lastPart.isComplete = true;
        }

        if (part.type === 'text-delta') {
          assistantMsg.content += part.text;
          assistantMsg.currentStep = 'responding';
          appendTextPart(assistantMsg.parts, part.text);
        } else if (part.type === 'reasoning-delta') {
          if (part.text) {
            assistantMsg.reasoning = (assistantMsg.reasoning || '') + part.text;
            appendReasoningPart(assistantMsg.parts, part.text);
          }
          assistantMsg.currentStep = 'thinking';
        } else if (part.type === 'tool-call') {
          const toolName = part.toolName as ToolName;
          if (toolName !== 'inspect_current_prompt') {
            const approval = approvals.get(part.toolCallId);
            assistantMsg.currentStep = approval
              ? 'awaiting_approval'
              : assistantMsg.currentStep;
            await approval?.promise;
            continue;
          }
          assistantMsg.currentStep = 'inspecting';
          const invocation: ToolInvocation = {
            id: part.toolCallId,
            name: toolName,
            args:
              'input' in part && part.input
                ? (part.input as Record<string, unknown>)
                : {},
            state: 'applied',
            timestamp: Date.now()
          };
          if (!assistantMsg.toolInvocations) {
            assistantMsg.toolInvocations = [];
          }
          assistantMsg.toolInvocations.push(invocation);
          assistantMsg.parts.push({ type: 'tool', invocation });
        } else if (part.type === 'tool-result') {
          const existing = assistantMsg.toolInvocations?.find(
            (t) => t.id === part.toolCallId
          );
          if (existing) {
            existing.result = 'output' in part ? part.output : undefined;
            existing.state =
              existing.name === 'inspect_current_prompt'
                ? 'applied'
                : existing.state;
          }
          const partTool = assistantMsg.parts.find(
            (p) => p.type === 'tool' && p.invocation.id === part.toolCallId
          );
          if (partTool && partTool.type === 'tool') {
            partTool.invocation.result =
              'output' in part ? part.output : undefined;
            partTool.invocation.state =
              partTool.invocation.name === 'inspect_current_prompt'
                ? 'applied'
                : partTool.invocation.state;
          }
          assistantMsg.currentStep = 'tool_completed';
        }
      }
    } catch (err: unknown) {
      if (!assistantMsg.parts) assistantMsg.parts = [];
      if (err instanceof Error && err.name === 'AbortError') {
        const stopNotice = '\n\n*(Generation stopped)*';
        assistantMsg.content += stopNotice;
        appendTextPart(assistantMsg.parts, stopNotice);
      } else {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const errNotice = `\n\n**Error:** ${errorMsg}`;
        assistantMsg.content += errNotice;
        appendTextPart(assistantMsg.parts, errNotice);
      }
    } finally {
      for (const part of assistantMsg.parts ?? []) {
        if (part.type === 'reasoning') part.isComplete = true;
      }
      assistantMsg.currentStep = 'done';
      isGenerating.value = false;
      currentAbortController = null;
      session.updatedAt = Date.now();
      void saveChatSessions();
    }
  }

  function resolveApproval(
    messageId: string,
    toolId: string,
    decision: ApprovalDecision
  ) {
    const approval = approvals.get(toolId);
    if (!approval || approval.messageId !== messageId) return;
    approvals.delete(toolId);
    approval.resolve(decision);
  }

  function applyToolInvocation(messageId: string, toolId: string) {
    resolveApproval(messageId, toolId, { action: 'accept' });
  }

  function applyAndQueueToolInvocation(messageId: string, toolId: string) {
    resolveApproval(messageId, toolId, { action: 'queue' });
  }

  function rejectToolInvocation(messageId: string, toolId: string, note = '') {
    resolveApproval(messageId, toolId, {
      action: 'decline',
      note: note.trim()
    });
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
    renameSession,
    clearAllSessions,
    refreshModels,
    sendMessage,
    stopGeneration,
    applyToolInvocation,
    applyAndQueueToolInvocation,
    rejectToolInvocation
  };
});
