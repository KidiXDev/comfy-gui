<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window';
import { AlertTriangle, Loader2 } from '@lucide/vue';
import { onMounted, onUnmounted, ref } from 'vue';
import { RouterView } from 'vue-router';
import AppSidebar from '@/components/template/AppSidebar.vue';
import AppTitlebar from '@/components/template/AppTitlebar.vue';
import AiAssistantDrawer from '@/components/template/AiAssistantDrawer.vue';
import TerminalDrawer from '@/components/template/TerminalDrawer.vue';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useCivitaiStore } from './stores/civitaiStore';
import { useComfyStore } from './stores/comfyStore';
import { useDownloadStore } from './stores/downloadStore';
import { useLauncherStore } from './stores/launcherStore';
import { usePromptSuggestionStore } from './stores/promptSuggestionStore';
import { useWorkflowStore } from './stores/workflowStore';

const launcherStore = useLauncherStore();
const downloadStore = useDownloadStore();
const comfyStore = useComfyStore();
const workflowStore = useWorkflowStore();
const promptSuggestionStore = usePromptSuggestionStore();
const civitaiStore = useCivitaiStore();
const shutdownDialogOpen = ref(false);
const isShuttingDown = ref(false);
const shutdownError = ref('');
let unlistenClose: (() => void) | null = null;

function cancelShutdown() {
  if (!isShuttingDown.value) shutdownDialogOpen.value = false;
}

async function continueShutdown() {
  isShuttingDown.value = true;
  shutdownError.value = '';
  try {
    if (comfyStore.isGenerating) await comfyStore.interrupt();
    await launcherStore.stopServer();
    await getCurrentWindow().close();
  } catch (error) {
    shutdownError.value = String(error);
    isShuttingDown.value = false;
  }
}

onMounted(async () => {
  try {
    const appWindow = getCurrentWindow();
    unlistenClose = await appWindow.onCloseRequested((event) => {
      if (
        !isShuttingDown.value &&
        ['starting', 'stopping', 'running'].includes(
          launcherStore.processStatus
        )
      ) {
        event.preventDefault();
        shutdownError.value = '';
        shutdownDialogOpen.value = true;
      }
    });
  } catch {
    // Browser preview mode.
  }

  await launcherStore.initTauriListeners();
  void downloadStore.init();
  comfyStore.init();
  void workflowStore.init();
  void promptSuggestionStore.init();
  void civitaiStore.init();
});

onUnmounted(() => {
  unlistenClose?.();
  downloadStore.stop();
});
</script>

<template>
  <TooltipProvider :delay-duration="150">
    <div
      class="bg-background text-foreground flex h-screen w-screen flex-col overflow-hidden antialiased select-none"
    >
      <!-- Custom Frameless Window Titlebar with Drag Region -->
      <AppTitlebar />

      <!-- Main Application Body: Sidebar + Active Router View -->
      <div class="flex min-h-0 w-full flex-1 overflow-hidden">
        <!-- Icon-only Sidebar Rail -->
        <AppSidebar />

        <!-- Main Viewport Workspace -->
        <main class="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          <RouterView v-slot="{ Component }">
            <KeepAlive
              include="BooruGalleryView,CivitaiBrowserView,ImageViewerView,UpscalerView,RemoveBackgroundView,FaceDetailerView"
              :max="6"
            >
              <component :is="Component" />
            </KeepAlive>
          </RouterView>
        </main>
      </div>

      <!-- Global Terminal Slide-over Drawer -->
      <TerminalDrawer />

      <!-- Global AI Assistant Slide-over Drawer -->
      <AiAssistantDrawer />

      <Dialog
        :open="shutdownDialogOpen"
        @update:open="(open) => !open && cancelShutdown()"
      >
        <DialogContent>
          <DialogHeader>
            <div class="flex items-center gap-2">
              <AlertTriangle class="h-5 w-5 text-amber-400" />
              <DialogTitle>ComfyUI is still running</DialogTitle>
            </div>
            <DialogDescription>
              Cancel generation and shut down ComfyUI?
            </DialogDescription>
          </DialogHeader>

          <p v-if="shutdownError" class="text-destructive text-xs">
            {{ shutdownError }}
          </p>

          <DialogFooter>
            <Button
              variant="outline"
              :disabled="isShuttingDown"
              @click="cancelShutdown"
            >
              Cancel
            </Button>
            <Button :disabled="isShuttingDown" @click="continueShutdown">
              <Loader2 v-if="isShuttingDown" class="h-4 w-4 animate-spin" />
              {{ isShuttingDown ? 'Shutting down...' : 'Continue' }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  </TooltipProvider>
</template>
