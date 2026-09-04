<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  ArrowUpRight,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  History,
  ImagePlus,
  MessageSquare,
  Pencil,
  Play,
  Plus,
  ScanEye,
  Search,
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
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport
} from '@/components/ui/message-scroller';
import { provideMessageScroller } from '@/components/ui/message-scroller/useMessageScroller';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { useAiStore } from '../../stores/aiStore';
import { useComfyStore } from '../../stores/comfyStore';
import type {
  ChatMessage,
  ChatMessageAttachment,
  ChatMessagePart
} from '../../types/ai';
import AiModelSelector from '@/components/common/AiModelSelector.vue';

const aiStore = useAiStore();
const comfyStore = useComfyStore();
const router = useRouter();

const messageInput = ref('');
const attachments = ref<ChatMessageAttachment[]>([]);
const { context: messageScroll } = provideMessageScroller({ autoScroll: true });
const fileInputRef = ref<HTMLInputElement | null>(null);
const isDraggingOver = ref(false);

const activeSession = computed(() => aiStore.activeSession);
const messages = computed(() => aiStore.activeMessages);

const showSessionsList = ref(false);
const sessionSearchQuery = ref('');
const editingSessionId = ref<string | null>(null);
const editingTitle = ref('');
const deletingSessionId = ref<string | null>(null);

const filteredSessions = computed(() => {
  // eslint-disable-next-line unicorn/no-array-sort
  const list = [...aiStore.sessions].sort(
    (a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)
  );
  const q = sessionSearchQuery.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter((s) => s.title.toLowerCase().includes(q));
});

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '';
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
}

function handleNewChat() {
  aiStore.createSession('New Chat');
  showSessionsList.value = false;
}

function handleSelectSessionAndClose(sessionId: string) {
  aiStore.switchSession(sessionId);
  showSessionsList.value = false;
}

function startRename(s: { id: string; title: string }) {
  editingSessionId.value = s.id;
  editingTitle.value = s.title;
  nextTick(() => {
    const input = document.querySelector<HTMLInputElement>(
      `#rename-input-${s.id}`
    );
    input?.focus();
    input?.select();
  });
}

function saveRename(sessionId: string) {
  if (editingTitle.value.trim()) {
    aiStore.renameSession(sessionId, editingTitle.value.trim());
  }
  editingSessionId.value = null;
  editingTitle.value = '';
}

function cancelRename() {
  editingSessionId.value = null;
  editingTitle.value = '';
}

function promptDeleteSession(sessionId: string) {
  deletingSessionId.value = sessionId;
}

function confirmDeleteSession(sessionId: string) {
  aiStore.deleteSession(sessionId);
  deletingSessionId.value = null;
}

function cancelDeleteSession() {
  deletingSessionId.value = null;
}

const expandedThoughts = ref<Record<string, boolean>>({});
const declineNotes = ref<Record<string, string>>({});

function toggleThought(msgId: string) {
  expandedThoughts.value[msgId] = !expandedThoughts.value[msgId];
}

function isThoughtExpanded(id: string): boolean {
  return !!expandedThoughts.value[id];
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

function getChronologicalParts(msg: ChatMessage): ChatMessagePart[] {
  if (msg.parts && msg.parts.length > 0) {
    return msg.parts;
  }
  const parts: ChatMessagePart[] = [];
  if (msg.reasoning) {
    parts.push({ type: 'reasoning', text: msg.reasoning, isComplete: true });
  }
  if (msg.toolInvocations && msg.toolInvocations.length > 0) {
    for (const inv of msg.toolInvocations) {
      parts.push({ type: 'tool', invocation: inv });
    }
  }
  if (msg.content) {
    parts.push({ type: 'text', text: msg.content });
  }
  return parts;
}

watch(
  [() => aiStore.activeSessionId, () => aiStore.isDrawerOpen, showSessionsList],
  () => {
    if (aiStore.isDrawerOpen && !showSessionsList.value)
      messageScroll.scrollToEnd();
  },
  { flush: 'post' }
);

async function handleSend() {
  const text = messageInput.value.trim();
  const currentAtts = [...attachments.value];
  if (!text && currentAtts.length === 0) return;
  if (aiStore.isGenerating) return;

  messageInput.value = '';
  attachments.value = [];
  nextTick(() => messageScroll.scrollToEnd());

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

function isPartActive(msg: ChatMessage, index: number): boolean {
  if (msg.currentStep === 'awaiting_approval') return false;
  if (
    !aiStore.isGenerating ||
    !isLastMessage(msg.id) ||
    msg.currentStep === 'done'
  )
    return false;
  const parts = getChronologicalParts(msg);
  if (index !== parts.length - 1) return false;
  const part = parts[index];
  if (part.type === 'reasoning')
    return msg.currentStep === 'thinking' && !part.isComplete;
  if (part.type === 'tool')
    return (
      part.invocation.result === undefined &&
      msg.currentStep !== 'tool_completed'
    );
  return msg.currentStep === 'responding';
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
      class="border-border bg-sidebar fixed top-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l shadow-2xl transition-transform duration-300 ease-in-out select-none sm:max-w-lg md:max-w-xl"
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
        <!-- Top row: App title, Session history button, New chat, Close -->
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
            <!-- Session History View Toggle Button -->
            <Button
              :variant="showSessionsList ? 'secondary' : 'outline'"
              size="sm"
              class="h-7 max-w-44 gap-1.5 px-2 text-xs font-medium"
              :class="{
                'border-primary/50 text-primary bg-primary/10': showSessionsList
              }"
              title="View all chat sessions"
              @click="showSessionsList = !showSessionsList"
            >
              <History class="h-3.5 w-3.5 shrink-0" />
              <span class="truncate">{{
                activeSession?.title || 'Conversations'
              }}</span>
              <span
                class="bg-muted text-muted-foreground py-0.2 ml-0.5 rounded-full px-1.5 font-mono text-[10px]"
              >
                {{ aiStore.sessions.length }}
              </span>
            </Button>

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

        <!-- Subheader when in Sessions View -->
        <div
          v-if="showSessionsList"
          class="border-border/40 mt-2.5 flex items-center justify-between gap-2 border-t pt-2 text-xs"
        >
          <Button
            variant="ghost"
            size="sm"
            class="text-muted-foreground hover:text-foreground h-7 gap-1 px-2 text-xs"
            @click="showSessionsList = false"
          >
            <ChevronLeft class="h-3.5 w-3.5" />
            <span>Back to Chat</span>
          </Button>

          <span class="text-muted-foreground font-mono text-[11px]">
            {{ filteredSessions.length }} conversation{{
              filteredSessions.length === 1 ? '' : 's'
            }}
          </span>
        </div>

        <!-- Subheader when in Chat View: Auto-Apply Toggle -->
        <div
          v-else
          class="border-border/40 mt-2.5 flex items-center justify-between gap-2 border-t pt-1.5 text-xs"
        >
          <span class="text-muted-foreground truncate font-mono text-xs">
            {{ activeSession?.title || 'Current Chat' }}
          </span>

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

      <!-- SESSIONS MANAGEMENT VIEW -->
      <div
        v-if="showSessionsList"
        class="bg-sidebar/50 flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-3"
      >
        <!-- Search Input -->
        <div class="flex items-center gap-2">
          <div class="relative flex-1">
            <Search
              class="text-muted-foreground absolute top-2.5 left-2.5 h-3.5 w-3.5"
            />
            <input
              v-model="sessionSearchQuery"
              type="text"
              placeholder="Search conversations..."
              class="bg-background border-border placeholder:text-muted-foreground text-foreground focus:border-primary/60 h-8 w-full rounded-lg border pr-7 pl-8 text-xs transition-colors outline-none"
            />
            <button
              v-if="sessionSearchQuery"
              type="button"
              class="text-muted-foreground hover:text-foreground absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full"
              @click="sessionSearchQuery = ''"
            >
              <X class="h-3 w-3" />
            </button>
          </div>
        </div>

        <!-- Sessions Scroll List -->
        <div class="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
          <div
            v-if="filteredSessions.length === 0"
            class="text-muted-foreground flex flex-col items-center justify-center gap-2 py-16 text-center"
          >
            <MessageSquare class="h-8 w-8 stroke-1 opacity-40" />
            <p class="text-xs">No conversations found</p>
            <Button
              v-if="sessionSearchQuery"
              variant="outline"
              size="sm"
              class="mt-1 h-7 text-xs"
              @click="sessionSearchQuery = ''"
            >
              Clear Search
            </Button>
            <Button
              v-else
              variant="outline"
              size="sm"
              class="mt-1 h-7 text-xs"
              @click="handleNewChat"
            >
              Create New Chat
            </Button>
          </div>

          <div
            v-for="s in filteredSessions"
            :key="s.id"
            class="group relative flex cursor-pointer flex-col gap-2 rounded-xl border p-3 text-left transition-all"
            :class="[
              s.id === aiStore.activeSessionId
                ? 'bg-primary/5 border-primary/40 ring-primary/30 shadow-xs ring-1'
                : 'bg-card/70 border-border/70 hover:bg-card hover:border-border'
            ]"
            @click="handleSelectSessionAndClose(s.id)"
          >
            <!-- Title Row or Inline Rename Form -->
            <div
              v-if="editingSessionId === s.id"
              class="flex items-center gap-1.5"
              @click.stop
            >
              <input
                :id="`rename-input-${s.id}`"
                v-model="editingTitle"
                type="text"
                class="bg-background border-primary text-foreground h-7 flex-1 rounded-md border px-2 text-xs font-medium shadow-xs outline-none"
                placeholder="Conversation title..."
                @keydown.enter.prevent="saveRename(s.id)"
                @keydown.esc.prevent="cancelRename"
              />
              <Button
                type="button"
                size="icon-sm"
                class="h-7 w-7 shrink-0 bg-emerald-600 text-white hover:bg-emerald-500"
                title="Save title (Enter)"
                @click="saveRename(s.id)"
              >
                <Check class="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                class="text-muted-foreground hover:text-foreground h-7 w-7 shrink-0"
                title="Cancel (Esc)"
                @click="cancelRename"
              >
                <X class="h-3.5 w-3.5" />
              </Button>
            </div>

            <div v-else class="flex items-center justify-between gap-2">
              <div class="flex min-w-0 flex-1 items-center gap-2">
                <span
                  class="text-foreground cursor-pointer truncate text-xs font-semibold hover:underline"
                  :title="s.title"
                  @dblclick.stop="startRename(s)"
                >
                  {{ s.title }}
                </span>
                <span
                  v-if="s.id === aiStore.activeSessionId"
                  class="border-primary/30 bg-primary/10 text-primary py-0.2 shrink-0 rounded-full border px-1.5 font-mono text-[10px] font-medium"
                >
                  Active
                </span>
              </div>

              <!-- Action Buttons -->
              <div
                class="flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100"
                @click.stop
              >
                <button
                  type="button"
                  class="text-muted-foreground hover:text-foreground hover:bg-accent flex h-6 w-6 items-center justify-center rounded p-0.5 transition-colors"
                  title="Rename title (or double click title)"
                  @click="startRename(s)"
                >
                  <Pencil class="h-3 w-3" />
                </button>
                <button
                  type="button"
                  class="text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex h-6 w-6 items-center justify-center rounded p-0.5 transition-colors"
                  title="Delete conversation"
                  @click="promptDeleteSession(s.id)"
                >
                  <Trash2 class="h-3 w-3" />
                </button>
              </div>
            </div>

            <!-- Delete Confirmation Overlay / Row -->
            <div
              v-if="deletingSessionId === s.id"
              class="border-destructive/30 bg-destructive/10 flex items-center justify-between gap-2 rounded-lg border p-2 text-xs"
              @click.stop
            >
              <span class="text-destructive text-[11px] font-medium">
                Delete this conversation?
              </span>
              <div class="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  class="h-6 px-2 text-[11px]"
                  @click="cancelDeleteSession"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  class="h-6 px-2 text-[11px]"
                  @click="confirmDeleteSession(s.id)"
                >
                  Delete
                </Button>
              </div>
            </div>

            <!-- Meta info: Time & Messages -->
            <div
              v-if="deletingSessionId !== s.id"
              class="text-muted-foreground flex items-center justify-between pt-0.5 text-[11px]"
            >
              <span class="flex items-center gap-1 font-mono">
                <Clock class="h-3 w-3" />
                {{ formatRelativeTime(s.updatedAt || s.createdAt) }}
              </span>
              <span class="flex items-center gap-1">
                <MessageSquare class="h-3 w-3" />
                {{ s.messages.length }} message{{
                  s.messages.length === 1 ? '' : 's'
                }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- ACTIVE CONVERSATION VIEW -->
      <template v-else>
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
        <MessageScroller class="h-auto flex-1">
          <MessageScrollerViewport class="p-3.5 select-text">
            <MessageScrollerContent class="gap-3.5">
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
                    Brainstorm Anima prompts, detail anime character outfits,
                    analyze image styles with Vision, or ask the agent to
                    inspect and queue renders.
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
                <div v-else class="flex flex-col items-start gap-2 pr-2">
                  <!-- Avatar & Header -->
                  <div class="flex w-full items-center justify-between">
                    <div
                      class="text-muted-foreground flex items-center gap-1.5 text-xs font-medium"
                    >
                      <div
                        class="border-primary/25 bg-primary/10 text-primary flex h-5 w-5 items-center justify-center rounded-md border"
                      >
                        <Sparkles class="h-3 w-3" />
                      </div>
                      <span class="text-foreground font-semibold"
                        >AI Assistant</span
                      >
                    </div>
                    <span class="text-muted-foreground font-mono text-[10px]">
                      {{ formatRelativeTime(msg.createdAt) }}
                    </span>
                  </div>

                  <!-- Message Body -->
                  <div class="w-full text-xs select-text">
                    <!-- Chronological Message Parts -->
                    <div
                      v-for="(part, pIdx) in getChronologicalParts(msg)"
                      :key="`${msg.id}-part-${pIdx}`"
                      class="border-border/60 relative ml-2 border-l pb-3 pl-5 last:border-transparent last:pb-0"
                    >
                      <span
                        class="bg-sidebar absolute top-0 -left-2 flex h-4 w-4 items-center justify-center"
                      >
                        <span
                          v-if="isPartActive(msg, pIdx)"
                          class="bg-primary h-2 w-2 animate-pulse rounded-full"
                        />
                        <Check
                          v-else-if="
                            part.type === 'reasoning' ||
                            (part.type === 'tool' &&
                              part.invocation.result !== undefined)
                          "
                          class="text-muted-foreground h-3 w-3"
                        />
                        <span
                          v-else
                          class="bg-muted-foreground h-1.5 w-1.5 rounded-full"
                        />
                      </span>
                      <!-- 1. Text Part -->
                      <div
                        v-if="part.type === 'text' && part.text"
                        class="prose-chat select-text"
                      >
                        <!-- eslint-disable-next-line vue/no-v-html -->
                        <div v-html="renderMarkdown(part.text)" />
                        <!-- Pulsating cursor during active text streaming on this part -->
                        <span
                          v-if="isPartActive(msg, pIdx)"
                          class="bg-primary/80 ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-xs align-middle"
                        />
                      </div>

                      <!-- 2. Reasoning / Thinking Part -->
                      <div
                        v-else-if="part.type === 'reasoning' && part.text"
                        class="text-xs"
                      >
                        <button
                          type="button"
                          class="text-muted-foreground hover:text-foreground flex w-full cursor-pointer items-center justify-between gap-2 transition-colors"
                          @click="toggleThought(`${msg.id}-${pIdx}`)"
                          :aria-expanded="
                            isThoughtExpanded(`${msg.id}-${pIdx}`)
                          "
                        >
                          <div class="flex items-center gap-1.5 font-medium">
                            <Sparkles
                              class="text-primary h-3 w-3"
                              :class="{
                                'animate-pulse': isPartActive(msg, pIdx)
                              }"
                            />
                            <span>{{
                              isPartActive(msg, pIdx) ? 'Thinking' : 'Thought'
                            }}</span>
                            <span
                              v-if="isPartActive(msg, pIdx)"
                              class="animate-text-shimmer font-mono text-[10px]"
                            >
                              pondering...
                            </span>
                          </div>
                          <div class="flex items-center gap-1 text-[11px]">
                            <span>{{
                              isThoughtExpanded(`${msg.id}-${pIdx}`)
                                ? 'Hide'
                                : 'Show'
                            }}</span>
                            <ChevronRight
                              class="h-3 w-3 transition-transform"
                              :class="{
                                'rotate-90': isThoughtExpanded(
                                  `${msg.id}-${pIdx}`
                                )
                              }"
                            />
                          </div>
                        </button>
                        <MessageScrollerProvider
                          v-if="isThoughtExpanded(`${msg.id}-${pIdx}`)"
                          :auto-scroll="true"
                        >
                          <MessageScrollerViewport
                            aria-label="Thinking details"
                            class="border-border/20 text-muted-foreground mt-2 h-auto max-h-48 border-t pt-2 font-mono text-xs leading-relaxed select-text"
                          >
                            <MessageScrollerContent class="min-h-0 gap-0">
                              <div class="whitespace-pre-wrap">
                                {{ part.text }}
                              </div>
                            </MessageScrollerContent>
                          </MessageScrollerViewport>
                        </MessageScrollerProvider>
                      </div>

                      <!-- 3. Tool Invocations -->
                      <div v-else-if="part.type === 'tool'">
                        <!-- Tool: inspect_current_prompt -->
                        <div
                          v-if="
                            part.invocation.name === 'inspect_current_prompt'
                          "
                          class="text-xs"
                        >
                          <div class="flex items-center justify-between gap-2">
                            <div class="flex items-center gap-2">
                              <div
                                class="flex h-5 w-5 items-center justify-center rounded-md border text-blue-400"
                                :class="[
                                  isPartActive(msg, pIdx)
                                    ? 'border-primary/30 bg-primary/10 text-primary animate-spin'
                                    : 'border-blue-500/30 bg-blue-500/10'
                                ]"
                              >
                                <Sparkles
                                  v-if="isPartActive(msg, pIdx)"
                                  class="h-2.5 w-2.5"
                                />
                                <Eye v-else class="h-3 w-3" />
                              </div>
                              <span
                                class="text-foreground font-medium"
                                :class="{
                                  'animate-text-shimmer': isPartActive(
                                    msg,
                                    pIdx
                                  )
                                }"
                              >
                                {{
                                  part.invocation.result
                                    ? 'Studio Prompts Inspected'
                                    : isPartActive(msg, pIdx)
                                      ? 'Inspecting active studio prompts...'
                                      : 'Prompt inspection stopped'
                                }}
                              </span>
                            </div>

                            <button
                              v-if="part.invocation.result"
                              type="button"
                              class="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1 text-[11px] transition-colors"
                              @click="
                                toggleThought(
                                  `${msg.id}-tool-${part.invocation.id}`
                                )
                              "
                            >
                              <span>{{
                                isThoughtExpanded(
                                  `${msg.id}-tool-${part.invocation.id}`
                                )
                                  ? 'Hide details'
                                  : 'View details'
                              }}</span>
                              <ChevronRight
                                class="h-3 w-3 transition-transform"
                                :class="{
                                  'rotate-90': isThoughtExpanded(
                                    `${msg.id}-tool-${part.invocation.id}`
                                  )
                                }"
                              />
                            </button>
                          </div>

                          <!-- Expanded prompt details -->
                          <div
                            v-if="
                              isThoughtExpanded(
                                `${msg.id}-tool-${part.invocation.id}`
                              ) && part.invocation.result
                            "
                            class="border-border/30 mt-2.5 flex flex-col gap-1.5 border-t pt-2 font-mono text-[11px]"
                          >
                            <div
                              v-if="
                                (part.invocation.result as any).positivePrompt
                              "
                              class="flex flex-col gap-0.5"
                            >
                              <span
                                class="text-primary font-sans text-[10px] font-semibold uppercase"
                                >Active Positive</span
                              >
                              <p
                                class="text-foreground/90 whitespace-pre-wrap select-text"
                              >
                                {{
                                  (part.invocation.result as any).positivePrompt
                                }}
                              </p>
                            </div>
                            <div
                              v-if="
                                (part.invocation.result as any).negativePrompt
                              "
                              class="flex flex-col gap-0.5"
                            >
                              <span
                                class="text-muted-foreground font-sans text-xs font-semibold uppercase"
                                >Active Negative</span
                              >
                              <p
                                class="text-muted-foreground whitespace-pre-wrap select-text"
                              >
                                {{
                                  (part.invocation.result as any).negativePrompt
                                }}
                              </p>
                            </div>
                          </div>
                        </div>

                        <!-- Prompt update -->
                        <div
                          v-else-if="
                            part.invocation.name === 'inject_positive_prompt' ||
                            part.invocation.name === 'inject_negative_prompt'
                          "
                          class="text-xs"
                        >
                          <div
                            class="mb-2 flex items-center justify-between gap-2"
                          >
                            <div class="flex items-center gap-2">
                              <div
                                class="border-primary/30 bg-primary/10 text-primary flex h-5 w-5 items-center justify-center rounded-md border"
                              >
                                <Wand2 class="h-3 w-3" />
                              </div>
                              <span
                                class="text-foreground text-xs font-semibold"
                              >
                                {{
                                  part.invocation.name ===
                                  'inject_positive_prompt'
                                    ? 'Proposed Positive Prompt'
                                    : part.invocation.name ===
                                        'inject_negative_prompt'
                                      ? 'Proposed Negative Prompt'
                                      : 'Proposed Prompt Adjustments'
                                }}
                              </span>
                            </div>
                            <span
                              class="rounded-full px-2 py-0.5 font-mono text-[10px] font-medium"
                              :class="[
                                part.invocation.state === 'applied'
                                  ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                                  : part.invocation.state === 'queued'
                                    ? 'border border-purple-500/20 bg-purple-500/10 text-purple-400'
                                    : part.invocation.state === 'rejected'
                                      ? 'bg-muted text-muted-foreground'
                                      : 'border-primary/20 bg-primary/10 text-primary border'
                              ]"
                            >
                              {{
                                part.invocation.state === 'applied'
                                  ? '✓ Applied to Studio'
                                  : part.invocation.state === 'queued'
                                    ? '✓ Applied & Queued'
                                    : part.invocation.state === 'rejected'
                                      ? '✕ Discarded'
                                      : 'Pending Confirmation'
                              }}
                            </span>
                          </div>

                          <p
                            v-if="
                              typeof part.invocation.args.reason === 'string'
                            "
                            class="text-muted-foreground mb-2 text-xs italic"
                          >
                            {{ part.invocation.args.reason }}
                          </p>

                          <div
                            class="border-border/40 bg-muted/20 mb-2 rounded-lg border p-2 font-mono text-xs whitespace-pre-wrap"
                          >
                            {{
                              part.invocation.args.prompt ??
                              (part.invocation.name === 'inject_positive_prompt'
                                ? part.invocation.args.positive
                                : part.invocation.args.negative)
                            }}
                          </div>

                          <!-- Action buttons if pending -->
                        </div>

                        <!-- Tool: queue_generation -->
                        <div
                          v-else-if="
                            part.invocation.name === 'queue_generation'
                          "
                          class="text-xs"
                        >
                          <div
                            class="mb-1.5 flex items-center justify-between gap-2"
                          >
                            <div class="flex items-center gap-2">
                              <div
                                class="flex h-5 w-5 items-center justify-center rounded-md border border-purple-500/30 bg-purple-500/10 text-purple-400"
                              >
                                <Play class="h-3 w-3" />
                              </div>
                              <span
                                class="text-foreground text-xs font-semibold"
                                >Queue Generation</span
                              >
                            </div>
                            <span
                              class="rounded-full px-2 py-0.5 font-mono text-[10px] font-medium"
                              :class="[
                                part.invocation.state === 'queued'
                                  ? 'border border-purple-500/20 bg-purple-500/10 text-purple-400'
                                  : 'border-primary/20 bg-primary/10 text-primary border'
                              ]"
                            >
                              {{
                                part.invocation.state === 'queued'
                                  ? '✓ Queued'
                                  : part.invocation.state === 'rejected'
                                    ? 'Declined'
                                    : 'Pending Confirmation'
                              }}
                            </span>
                          </div>

                          <p
                            v-if="
                              typeof part.invocation.args.reason === 'string'
                            "
                            class="text-muted-foreground mb-2 text-xs"
                          >
                            {{ part.invocation.args.reason }}
                          </p>
                        </div>
                        <div
                          v-if="
                            part.invocation.state === 'pending' &&
                            msg.currentStep === 'awaiting_approval'
                          "
                          class="mt-2 space-y-2"
                        >
                          <p class="text-muted-foreground text-xs">
                            Waiting for your approval. The assistant is paused.
                          </p>
                          <textarea
                            v-model="declineNotes[part.invocation.id]"
                            aria-label="Optional decline note"
                            placeholder="Optional note if you decline..."
                            rows="2"
                            class="border-border bg-background w-full rounded-md border p-2 text-xs"
                          />
                          <div class="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              @click="
                                aiStore.applyToolInvocation(
                                  msg.id,
                                  part.invocation.id
                                )
                              "
                              >Accept</Button
                            >
                            <Button
                              v-if="part.invocation.name !== 'queue_generation'"
                              size="sm"
                              @click="
                                aiStore.applyAndQueueToolInvocation(
                                  msg.id,
                                  part.invocation.id
                                )
                              "
                              >Accept & Queue</Button
                            >
                            <Button
                              size="sm"
                              variant="ghost"
                              @click="
                                aiStore.rejectToolInvocation(
                                  msg.id,
                                  part.invocation.id,
                                  declineNotes[part.invocation.id]
                                )
                              "
                              >Decline</Button
                            >
                          </div>
                        </div>
                        <p
                          v-if="part.invocation.note"
                          class="text-muted-foreground mt-2 text-xs"
                        >
                          Decline note: {{ part.invocation.note }}
                        </p>
                      </div>
                    </div>

                    <!-- Initial Thinking / Waiting indicator if no parts have arrived yet -->
                    <div
                      v-if="
                        aiStore.isGenerating &&
                        isLastMessage(msg.id) &&
                        getChronologicalParts(msg).length === 0
                      "
                      class="text-muted-foreground flex items-center gap-2 py-1 text-xs"
                    >
                      <Sparkles
                        class="text-primary h-3.5 w-3.5 animate-pulse"
                      />
                      <span
                        class="animate-text-shimmer font-mono font-medium tracking-wide"
                      >
                        Thinking...
                      </span>
                    </div>
                  </div>
                </div>
              </template>
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton behavior="auto" />
        </MessageScroller>

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
              <img
                :src="att.dataUrl"
                alt=""
                class="h-full w-full object-cover"
              />
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

              <div class="flex min-w-0 items-center gap-1.5">
                <!-- Model Selector -->
                <AiModelSelector
                  compact
                  :disabled="aiStore.isGenerating"
                  :model-value="aiStore.config.selectedModel"
                  class="max-w-36 sm:max-w-48"
                  @change="handleModelChange"
                />

                <!-- Stop Button when Generating -->
                <Button
                  v-if="aiStore.isGenerating"
                  type="button"
                  size="sm"
                  variant="outline"
                  class="text-destructive hover:bg-destructive/10 h-7 shrink-0 gap-1 text-xs"
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
                  class="bg-primary text-primary-foreground h-7 shrink-0 gap-1.5 text-xs shadow-xs"
                  @click="handleSend"
                >
                  <span>Send</span>
                  <Send class="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </template>
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
:deep(.prose-chat) {
  font-size: 0.8125rem;
  line-height: 1.65;
  color: var(--color-foreground);
  letter-spacing: 0.01em;
}

:deep(.prose-chat p) {
  margin: 0.5rem 0;
}

:deep(.prose-chat p:first-child) {
  margin-top: 0;
}

:deep(.prose-chat p:last-child) {
  margin-bottom: 0;
}

:deep(.prose-chat strong) {
  font-weight: 600;
  color: var(--color-foreground);
}

:deep(.prose-chat pre) {
  background-color: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--color-border);
  border-radius: 0.625rem;
  padding: 0.75rem 0.875rem;
  margin: 0.625rem 0;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.55;
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
  font-size: 1rem;
  font-weight: 700;
  margin-top: 0.875rem;
  margin-bottom: 0.375rem;
  color: var(--color-foreground);
}

:deep(.prose-chat h2) {
  font-size: 0.9375rem;
  font-weight: 600;
  margin-top: 0.75rem;
  margin-bottom: 0.375rem;
  color: var(--color-foreground);
}

:deep(.prose-chat h3) {
  font-size: 0.875rem;
  font-weight: 600;
  margin-top: 0.625rem;
  margin-bottom: 0.25rem;
  color: var(--color-foreground);
}

:deep(.prose-chat ul) {
  list-style-type: disc;
  margin-left: 1.125rem;
  margin-top: 0.375rem;
  margin-bottom: 0.5rem;
}

:deep(.prose-chat ol) {
  list-style-type: decimal;
  margin-left: 1.25rem;
  margin-top: 0.375rem;
  margin-bottom: 0.5rem;
}

:deep(.prose-chat li) {
  margin: 0.25rem 0;
  line-height: 1.6;
}

:deep(.prose-chat blockquote) {
  border-left: 3px solid var(--color-primary);
  background-color: rgba(59, 130, 246, 0.05);
  border-radius: 0 0.375rem 0.375rem 0;
  padding: 0.375rem 0.75rem;
  margin: 0.5rem 0;
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
  margin: 0.625rem 0;
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
