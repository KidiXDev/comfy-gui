<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  ArrowUpRight,
  Bot,
  Check,
  Eye,
  ImagePlus,
  Play,
  Plus,
  ScanEye,
  Send,
  Settings,
  Sparkles,
  Square,
  Trash2,
  Wand2,
  X,
  Zap
} from '@lucide/vue';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { useAiStore } from '../../stores/aiStore';
import { useComfyStore } from '../../stores/comfyStore';
import type { ChatMessageAttachment } from '../../types/ai';
import AiModelSelector from '@/components/common/AiModelSelector.vue';

const aiStore = useAiStore();
const comfyStore = useComfyStore();
const router = useRouter();

const messageInput = ref('');
const attachments = ref<ChatMessageAttachment[]>([]);
const messagesContainer = ref<HTMLElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const isDraggingOver = ref(false);

const activeSession = computed(() => aiStore.activeSession);
const messages = computed(() => aiStore.activeMessages);

// Scroll to bottom when new messages arrive or when generating
watch(
  () => [messages.value.length, messages.value.at(-1)?.content],
  () => {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop =
          messagesContainer.value.scrollHeight;
      }
    });
  },
  { deep: true }
);

function handleNewChat() {
  aiStore.createSession('New Chat');
}

function handleSelectSession(sessionId: unknown) {
  if (typeof sessionId === 'string') {
    aiStore.switchSession(sessionId);
  }
}

function handleDeleteSession(sessionId: string) {
  aiStore.deleteSession(sessionId);
}

function handleModelChange(modelId: unknown) {
  if (typeof modelId === 'string') {
    aiStore.config.selectedModel = modelId;
    void aiStore.saveConfig();
  }
}

function handleAutoApplyChange(checked: boolean) {
  aiStore.config.autoApply = checked;
  void aiStore.saveConfig();
}

// Vision Attachment Helpers
function openFilePicker() {
  fileInputRef.value?.click();
}

async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  if (!target.files?.length) return;
  const files = Array.from(target.files);
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      await processImageFile(file);
    }
  }
  target.value = '';
}

function processImageFile(file: File): Promise<void> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      attachments.value.push({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        type: file.type,
        dataUrl: reader.result as string
      });
      resolve();
    };
    reader.readAsDataURL(file);
  });
}

function removeAttachment(id: string) {
  attachments.value = attachments.value.filter((a) => a.id !== id);
}

// Attach current preview or last generated image from studio
async function attachCurrentPreview() {
  const previewUrl =
    comfyStore.lastGeneratedImage?.url || comfyStore.currentPreviewUrl;
  if (!previewUrl) return;

  try {
    const res = await fetch(previewUrl);
    const blob = await res.blob();
    const reader = new FileReader();
    reader.onload = () => {
      attachments.value.push({
        id: `preview-${Date.now()}`,
        name: 'comfyui_preview.png',
        type: blob.type || 'image/png',
        dataUrl: reader.result as string
      });
    };
    reader.readAsDataURL(blob);
  } catch (err) {
    console.error('Failed to attach current preview image:', err);
  }
}

// Clipboard Paste (Ctrl+V) handler
async function handlePaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items;
  if (!items) return;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.indexOf('image') !== -1) {
      const file = item.getAsFile();
      if (file) {
        event.preventDefault();
        await processImageFile(file);
      }
    }
  }
}

// Drag & Drop
function handleDrop(event: DragEvent) {
  isDraggingOver.value = false;
  const files = event.dataTransfer?.files;
  if (!files?.length) return;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.type.startsWith('image/')) {
      void processImageFile(file);
    }
  }
}

async function handleSend() {
  const text = messageInput.value.trim();
  const currentAtts = [...attachments.value];
  if (!text && currentAtts.length === 0) return;
  if (aiStore.isGenerating) return;

  messageInput.value = '';
  attachments.value = [];

  try {
    await aiStore.sendMessage(text, currentAtts);
  } catch (err) {
    console.error('Error sending message:', err);
  }
}

function handleStarterClick(promptText: string) {
  messageInput.value = promptText;
  void handleSend();
}

function navigateToSettings() {
  aiStore.isDrawerOpen = false;
  router.push('/settings');
}

function isLastMessage(id: string): boolean {
  const last = messages.value.at(-1);
  return last?.id === id;
}

marked.use({
  gfm: true,
  breaks: true
});

// Markdown formatter powered by marked + DOMPurify
function renderMarkdown(content: string): string {
  if (!content) return '';

  let processed = content;
  // Gracefully auto-close dangling code fence during streaming
  const fenceCount = (processed.match(/```/gu) || []).length;
  if (fenceCount % 2 === 1) {
    processed += '\n```';
  }

  const rawHtml = marked.parse(processed, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml);
}
</script>

<template>
  <div>
    <!-- Backdrop Overlay (allows clicking to dismiss) -->
    <div
      v-if="aiStore.isDrawerOpen"
      class="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity duration-300"
      @click="aiStore.isDrawerOpen = false"
    />

    <!-- Slide-over Drawer -->
    <aside
      class="border-border bg-sidebar fixed top-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l shadow-2xl transition-transform duration-300 ease-in-out select-none sm:max-w-lg"
      :class="aiStore.isDrawerOpen ? 'translate-x-0' : 'translate-x-full'"
    >
      <!-- Hidden File Input for Image Attachments -->
      <input
        ref="fileInputRef"
        type="file"
        accept="image/*"
        multiple
        class="hidden"
        @change="handleFileChange"
      />

      <!-- Drawer Header -->
      <div
        class="border-border bg-card/60 flex flex-col border-b px-3.5 py-2.5 backdrop-blur-xs"
      >
        <!-- Top row: App title, New chat, Session Selector, Close -->
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <div
              class="border-primary/30 bg-primary/10 text-primary flex h-7 w-7 items-center justify-center rounded-lg border"
            >
              <Sparkles class="h-4 w-4" />
            </div>
            <span
              class="text-foreground text-xs font-bold tracking-wide uppercase"
            >
              AI Assistant
            </span>
          </div>

          <div class="flex items-center gap-1.5">
            <!-- New Chat Button -->
            <Button
              variant="outline"
              size="sm"
              class="h-7 gap-1 px-2 text-xs"
              title="Start a new conversation"
              @click="handleNewChat"
            >
              <Plus class="h-3 w-3" />
              <span>New</span>
            </Button>

            <!-- Session List Selector -->
            <Select
              :model-value="aiStore.activeSessionId"
              @update:model-value="handleSelectSession"
            >
              <SelectTrigger class="h-7 max-w-36 px-2 text-xs font-medium">
                <SelectValue placeholder="Sessions">
                  <span class="truncate">{{
                    activeSession?.title || 'Chat'
                  }}</span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end" class="w-56">
                <SelectGroup class="max-h-40 overflow-y-auto">
                  <SelectItem
                    v-for="s in aiStore.sessions"
                    :key="s.id"
                    :value="s.id"
                    class="text-xs"
                  >
                    <div class="flex w-full items-center justify-between gap-2">
                      <span class="truncate">{{ s.title }}</span>
                      <button
                        v-if="aiStore.sessions.length > 1"
                        type="button"
                        class="text-muted-foreground hover:text-destructive opacity-50 hover:opacity-100"
                        title="Delete session"
                        @click.stop="handleDeleteSession(s.id)"
                      >
                        <Trash2 class="h-3 w-3" />
                      </button>
                    </div>
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            <!-- Close Drawer Button -->
            <Button
              variant="ghost"
              size="icon-sm"
              class="text-muted-foreground hover:text-foreground h-7 w-7"
              title="Close drawer"
              @click="aiStore.isDrawerOpen = false"
            >
              <X class="h-4 w-4" />
            </Button>
          </div>
        </div>

        <!-- Bottom row: Model Selector & Auto-Apply Toggle -->
        <div
          class="border-border/40 mt-2.5 flex items-center justify-between gap-2 border-t pt-1 text-xs"
        >
          <!-- Quick Model Selector with Search -->
          <div class="flex min-w-0 flex-1 items-center gap-1.5">
            <span class="text-muted-foreground shrink-0 text-xs font-medium"
              >Model:</span
            >
            <AiModelSelector
              compact
              :model-value="aiStore.config.selectedModel"
              class="w-full flex-1"
              @change="handleModelChange"
            />
          </div>

          <!-- Auto-Apply Toggle -->
          <div class="flex shrink-0 items-center gap-1.5 pl-1">
            <Tooltip>
              <TooltipTrigger as-child>
                <div class="flex cursor-pointer items-center gap-1.5">
                  <span class="text-muted-foreground text-xs">Auto-Apply</span>
                  <Switch
                    :checked="aiStore.config.autoApply"
                    class="scale-75"
                    @update:checked="handleAutoApplyChange"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p class="text-xs">
                  When enabled, AI prompt injection & queue actions run without
                  confirmation cards.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <!-- Api Key Banner if not set -->
      <div
        v-if="!aiStore.hasApiKey"
        class="m-3 flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs"
      >
        <div class="flex items-center gap-2 font-semibold text-amber-500">
          <Zap class="h-4 w-4" />
          <span>OpenRouter API Key Required</span>
        </div>
        <p class="text-muted-foreground">
          Configure your OpenRouter API key to enable prompt generation, AI
          vision analysis, and agentic studio control.
        </p>
        <Button
          size="sm"
          variant="secondary"
          class="h-7 w-fit gap-1.5 text-xs"
          @click="navigateToSettings"
        >
          <Settings class="h-3.5 w-3.5" />
          <span>Open Settings</span>
        </Button>
      </div>

      <!-- Messages Thread -->
      <div
        ref="messagesContainer"
        class="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-3.5 select-text"
      >
        <!-- Empty State with Starters -->
        <div
          v-if="messages.length === 0"
          class="my-auto flex h-full flex-col items-center justify-center gap-3 p-4 text-center"
        >
          <div
            class="bg-primary/10 border-primary/20 text-primary flex h-12 w-12 items-center justify-center rounded-2xl border shadow-xs"
          >
            <Bot class="h-6 w-6" />
          </div>
          <div class="flex flex-col gap-1">
            <h3 class="text-foreground text-sm font-semibold">
              ComfyUI Studio Assistant
            </h3>
            <p class="text-muted-foreground max-w-xs text-xs">
              Brainstorm Anima prompts, detail anime character outfits, analyze
              image styles with Vision, or ask the agent to inspect and queue
              renders.
            </p>
          </div>

          <!-- Starter Chips -->
          <div class="flex w-full max-w-xs flex-col gap-1.5 pt-2">
            <button
              type="button"
              class="border-border bg-card/60 hover:bg-accent hover:border-primary/40 text-foreground flex cursor-pointer items-center justify-between rounded-lg border p-2 text-left text-xs transition-colors"
              @click="
                handleStarterClick(
                  'Inspect my current studio prompt and optimize it with Anima tag ordering and quality scores.'
                )
              "
            >
              <span>Inspect & optimize for Anima</span>
              <ArrowUpRight class="text-muted-foreground h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              class="border-border bg-card/60 hover:bg-accent hover:border-primary/40 text-foreground flex cursor-pointer items-center justify-between rounded-lg border p-2 text-left text-xs transition-colors"
              @click="
                handleStarterClick(
                  'Create an Anima prompt for a fantasy mage girl with ornate layered robes, detached sleeves, and glowing runes.'
                )
              "
            >
              <span>Fantasy mage with detailed outfit</span>
              <ArrowUpRight class="text-muted-foreground h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              class="border-border bg-card/60 hover:bg-accent hover:border-primary/40 text-foreground flex cursor-pointer items-center justify-between rounded-lg border p-2 text-left text-xs transition-colors"
              @click="
                handleStarterClick(
                  'Generate a high quality Anima aesthetic prompt featuring a swordsman atop a cliff under starlight with dramatic lighting.'
                )
              "
            >
              <span>Create Anima aesthetic prompt</span>
              <ArrowUpRight class="text-muted-foreground h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <!-- Messages List -->
        <template v-for="msg in messages" :key="msg.id">
          <!-- User Message -->
          <div
            v-if="msg.role === 'user'"
            class="flex flex-col items-end gap-1.5 pl-8"
          >
            <!-- Attachments if any -->
            <div
              v-if="msg.attachments && msg.attachments.length > 0"
              class="flex flex-wrap justify-end gap-1.5"
            >
              <div
                v-for="att in msg.attachments"
                :key="att.id"
                class="border-primary/30 relative h-16 w-16 overflow-hidden rounded-lg border shadow-xs"
              >
                <img
                  :src="att.dataUrl"
                  alt=""
                  class="h-full w-full object-cover"
                />
              </div>
            </div>

            <!-- Text Content -->
            <div
              v-if="msg.content"
              class="bg-primary text-primary-foreground rounded-2xl rounded-tr-xs px-3.5 py-2 text-xs leading-relaxed shadow-xs"
            >
              {{ msg.content }}
            </div>
          </div>

          <!-- Assistant Message -->
          <div v-else class="flex flex-col items-start gap-2 pr-4">
            <!-- Avatar & Label -->
            <div
              class="text-muted-foreground flex items-center gap-1.5 text-xs font-medium"
            >
              <Sparkles class="text-primary h-3.5 w-3.5" />
              <span>AI Assistant</span>
            </div>

            <!-- Text Body -->
            <div
              class="bg-card border-border text-foreground/90 w-full overflow-hidden rounded-2xl rounded-tl-xs border p-3.5 text-xs leading-relaxed shadow-2xs"
            >
              <!-- Content rendered as markdown -->
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div
                v-if="msg.content"
                class="prose-chat select-text"
                v-html="renderMarkdown(msg.content)"
              />

              <!-- Pulsating cursor during active text streaming -->
              <span
                v-if="
                  aiStore.isGenerating && msg.content && isLastMessage(msg.id)
                "
                class="bg-primary/80 ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-xs align-middle"
              />

              <!-- Thinking indicator with Shine Effect -->
              <div
                v-if="aiStore.isGenerating && !msg.content"
                class="flex items-center gap-2 py-1"
              >
                <Sparkles class="text-primary h-3.5 w-3.5 animate-pulse" />
                <span
                  class="animate-text-shimmer font-mono text-xs font-medium tracking-wide"
                >
                  Thinking...
                </span>
              </div>

              <!-- Interactive Tool Invocation Cards -->
              <div
                v-if="msg.toolInvocations && msg.toolInvocations.length > 0"
                class="border-border/50 mt-3 flex flex-col gap-2.5 border-t pt-2"
              >
                <div
                  v-for="inv in msg.toolInvocations"
                  :key="inv.id"
                  class="flex flex-col gap-2 rounded-xl border p-2.5 text-xs"
                  :class="[
                    inv.state === 'applied' || inv.state === 'queued'
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : inv.state === 'rejected'
                        ? 'border-border/60 bg-muted/20 opacity-60'
                        : 'border-primary/30 bg-primary/5'
                  ]"
                >
                  <!-- Tool Header -->
                  <div class="flex items-center justify-between">
                    <div
                      class="flex items-center gap-1.5 text-xs font-semibold"
                    >
                      <Wand2
                        v-if="inv.name === 'inject_prompt'"
                        class="text-primary h-3.5 w-3.5"
                      />
                      <Play
                        v-else-if="inv.name === 'queue_generation'"
                        class="text-primary h-3.5 w-3.5"
                      />
                      <Eye v-else class="text-primary h-3.5 w-3.5" />
                      <span>
                        {{
                          inv.name === 'inject_prompt'
                            ? 'Prompt Proposal'
                            : inv.name === 'queue_generation'
                              ? 'ComfyUI Queue Action'
                              : 'Inspect Prompts'
                        }}
                      </span>
                    </div>

                    <!-- Status Badge -->
                    <span
                      class="rounded-full px-2 py-0.5 font-mono text-xs font-medium"
                      :class="[
                        inv.state === 'applied'
                          ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                          : inv.state === 'queued'
                            ? 'border border-purple-500/20 bg-purple-500/10 text-purple-400'
                            : inv.state === 'rejected'
                              ? 'bg-muted text-muted-foreground'
                              : 'bg-primary/10 text-primary border-primary/20 border'
                      ]"
                    >
                      {{
                        inv.state === 'applied'
                          ? '✓ Applied to Studio'
                          : inv.state === 'queued'
                            ? '✓ Applied & Queued'
                            : inv.state === 'rejected'
                              ? '✕ Discarded'
                              : 'Pending Confirmation'
                      }}
                    </span>
                  </div>

                  <!-- Details / Diff for inject_prompt -->
                  <template v-if="inv.name === 'inject_prompt'">
                    <p
                      v-if="typeof inv.args.reason === 'string'"
                      class="text-muted-foreground text-xs italic"
                    >
                      {{ inv.args.reason }}
                    </p>

                    <div
                      v-if="typeof inv.args.positive === 'string'"
                      class="bg-background/80 border-border flex flex-col gap-1 rounded-lg border p-2"
                    >
                      <span
                        class="text-muted-foreground text-xs font-semibold uppercase"
                        >Positive Prompt</span
                      >
                      <p class="text-foreground font-mono text-xs select-text">
                        {{ inv.args.positive }}
                      </p>
                    </div>

                    <div
                      v-if="typeof inv.args.negative === 'string'"
                      class="bg-background/80 border-border flex flex-col gap-1 rounded-lg border p-2"
                    >
                      <span
                        class="text-muted-foreground text-xs font-semibold uppercase"
                        >Negative Prompt</span
                      >
                      <p class="text-foreground font-mono text-xs select-text">
                        {{ inv.args.negative }}
                      </p>
                    </div>

                    <!-- Action Buttons if Pending -->
                    <div
                      v-if="inv.state === 'pending'"
                      class="flex items-center gap-1.5 pt-1"
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        class="h-6.5 gap-1 text-xs"
                        @click="aiStore.applyToolInvocation(msg.id, inv.id)"
                      >
                        <Check class="h-3 w-3 text-emerald-500" />
                        <span>Apply</span>
                      </Button>

                      <Button
                        size="sm"
                        class="bg-primary text-primary-foreground h-6.5 gap-1 text-xs"
                        @click="
                          aiStore.applyAndQueueToolInvocation(msg.id, inv.id)
                        "
                      >
                        <Play class="h-3 w-3" />
                        <span>Apply & Queue</span>
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        class="text-muted-foreground hover:text-destructive ml-auto h-6.5 text-xs"
                        @click="aiStore.rejectToolInvocation(msg.id, inv.id)"
                      >
                        Discard
                      </Button>
                    </div>
                  </template>

                  <!-- Details for queue_generation -->
                  <template v-else-if="inv.name === 'queue_generation'">
                    <p
                      v-if="typeof inv.args.reason === 'string'"
                      class="text-muted-foreground text-xs"
                    >
                      {{ inv.args.reason }}
                    </p>
                    <div
                      v-if="inv.state === 'pending'"
                      class="flex items-center gap-1.5 pt-1"
                    >
                      <Button
                        size="sm"
                        class="bg-primary text-primary-foreground h-6.5 gap-1 text-xs"
                        @click="
                          aiStore.applyAndQueueToolInvocation(msg.id, inv.id)
                        "
                      >
                        <Play class="h-3 w-3" />
                        <span>Run Queue Now</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        class="text-muted-foreground hover:text-destructive h-6.5 text-xs"
                        @click="aiStore.rejectToolInvocation(msg.id, inv.id)"
                      >
                        Cancel
                      </Button>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Bottom Input & Attachment Bar -->
      <div
        class="border-border bg-card/60 relative flex flex-col gap-2 border-t p-3 transition-colors"
        :class="{ 'bg-primary/5 ring-primary/40 ring-2': isDraggingOver }"
        @dragover.prevent="isDraggingOver = true"
        @dragleave.prevent="isDraggingOver = false"
        @drop.prevent="handleDrop"
      >
        <!-- Attached Images Preview Strip -->
        <div
          v-if="attachments.length > 0"
          class="flex items-center gap-2 overflow-x-auto pb-1"
        >
          <div
            v-for="att in attachments"
            :key="att.id"
            class="border-border group relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border shadow-xs"
          >
            <img :src="att.dataUrl" alt="" class="h-full w-full object-cover" />
            <button
              type="button"
              class="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
              title="Remove attachment"
              @click="removeAttachment(att.id)"
            >
              <X class="h-2.5 w-2.5" />
            </button>
          </div>
        </div>

        <!-- Input Textarea & Send Control -->
        <div
          class="border-border bg-background focus-within:ring-primary focus-within:border-primary relative flex flex-col rounded-xl border transition-all focus-within:ring-1"
        >
          <textarea
            v-model="messageInput"
            rows="3"
            placeholder="Ask AI, enhance prompts, or paste/drop images for vision analysis... (Enter to send, Shift+Enter for newline)"
            class="placeholder:text-muted-foreground w-full resize-none bg-transparent p-3 text-xs leading-relaxed outline-none"
            @keydown.enter.exact.prevent="handleSend"
            @paste="handlePaste"
          />

          <!-- Action Bar under Textarea -->
          <div
            class="border-border/30 flex items-center justify-between border-t px-2.5 pt-1 pb-2 text-xs"
          >
            <div class="flex items-center gap-1.5">
              <!-- Upload Image Button -->
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                class="text-muted-foreground hover:text-foreground h-7 w-7"
                title="Attach image from file"
                @click="openFilePicker"
              >
                <ImagePlus class="h-4 w-4" />
              </Button>

              <!-- Attach Current Preview Button -->
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    class="text-muted-foreground hover:text-primary h-7 w-7"
                    :disabled="
                      !comfyStore.lastGeneratedImage &&
                      !comfyStore.currentPreviewUrl
                    "
                    @click="attachCurrentPreview"
                  >
                    <ScanEye class="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p class="text-xs">
                    Attach active ComfyUI preview image to chat
                  </p>
                </TooltipContent>
              </Tooltip>

              <span
                v-if="attachments.length > 0"
                class="text-muted-foreground font-mono text-xs"
              >
                {{ attachments.length }} image{{
                  attachments.length > 1 ? 's' : ''
                }}
              </span>
            </div>

            <div class="flex items-center gap-1.5">
              <!-- Stop Button when Generating -->
              <Button
                v-if="aiStore.isGenerating"
                type="button"
                size="sm"
                variant="outline"
                class="text-destructive hover:bg-destructive/10 h-7 gap-1 text-xs"
                @click="aiStore.stopGeneration"
              >
                <Square class="fill-destructive h-3 w-3" />
                <span>Stop</span>
              </Button>

              <!-- Send Button -->
              <Button
                v-else
                type="button"
                size="sm"
                :disabled="!messageInput.trim() && attachments.length === 0"
                class="bg-primary text-primary-foreground h-7 gap-1.5 text-xs shadow-xs"
                @click="handleSend"
              >
                <span>Send</span>
                <Send class="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
@keyframes text-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

.animate-text-shimmer {
  background: linear-gradient(
    90deg,
    rgba(148, 163, 184, 0.35) 0%,
    rgba(255, 255, 255, 0.95) 50%,
    rgba(148, 163, 184, 0.35) 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: text-shimmer 2s ease-in-out infinite;
  display: inline-block;
}

/* Typography styles for external marked renderer */
:deep(.prose-chat p) {
  margin: 0.375rem 0;
}
:deep(.prose-chat p:first-child) {
  margin-top: 0;
}
:deep(.prose-chat p:last-child) {
  margin-bottom: 0;
}
:deep(.prose-chat pre) {
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.75rem;
  margin: 0.5rem 0;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.5;
}
:deep(.prose-chat code:not(pre code)) {
  background-color: var(--color-muted);
  color: var(--color-primary);
  border-radius: 0.25rem;
  padding: 0.125rem 0.375rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
}
:deep(.prose-chat h1) {
  font-size: 0.875rem;
  font-weight: 700;
  margin-top: 0.75rem;
  margin-bottom: 0.25rem;
  color: var(--color-foreground);
}
:deep(.prose-chat h2) {
  font-size: 0.875rem;
  font-weight: 600;
  margin-top: 0.625rem;
  margin-bottom: 0.25rem;
  color: var(--color-foreground);
}
:deep(.prose-chat h3) {
  font-size: 0.75rem;
  font-weight: 600;
  margin-top: 0.5rem;
  margin-bottom: 0.25rem;
  color: var(--color-foreground);
}
:deep(.prose-chat ul) {
  list-style-type: disc;
  margin-left: 1rem;
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}
:deep(.prose-chat ol) {
  list-style-type: decimal;
  margin-left: 1.25rem;
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}
:deep(.prose-chat li) {
  margin: 0.125rem 0;
  line-height: 1.5;
}
:deep(.prose-chat blockquote) {
  border-left: 2px solid rgba(59, 130, 246, 0.5);
  padding-left: 0.625rem;
  margin: 0.375rem 0;
  font-style: italic;
  color: var(--color-muted-foreground);
}
:deep(.prose-chat a) {
  color: var(--color-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}
:deep(.prose-chat table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.5rem 0;
  font-size: 0.75rem;
}
:deep(.prose-chat th),
:deep(.prose-chat td) {
  border: 1px solid var(--color-border);
  padding: 0.375rem 0.5rem;
  text-align: left;
}
:deep(.prose-chat th) {
  background-color: var(--color-muted);
  font-weight: 600;
}
</style>
