<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Compass,
  Eraser,
  GalleryVerticalEnd,
  HardDriveDownload,
  Image,
  Images,
  Scaling,
  ScanFace,
  Settings,
  Terminal
} from '@lucide/vue';
import appLogoUrl from '@/assets/comfygui-logo.png';
import DownloadManagerPopover from '@/components/template/DownloadManagerPopover.vue';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { useLauncherStore } from '../../stores/launcherStore';

const route = useRoute();
const router = useRouter();
const launcherStore = useLauncherStore();

const navItems = [
  {
    id: 'workflow',
    label: 'Workflow Generator',
    icon: Image,
    route: '/workflow'
  },
  {
    id: 'viewer',
    label: 'Image Viewer',
    icon: Images,
    route: '/viewer'
  },
  {
    id: 'booru',
    label: 'Booru Gallery',
    icon: GalleryVerticalEnd,
    route: '/booru'
  },
  {
    id: 'animadex',
    label: 'Animadex Explore',
    icon: Compass,
    route: '/animadex'
  },
  {
    id: 'civitai',
    label: 'Civitai Model Browser',
    icon: HardDriveDownload,
    route: '/civitai'
  },
  {
    id: 'upscaler',
    label: 'Image Upscaler',
    icon: Scaling,
    route: '/upscaler'
  },
  {
    id: 'remove-background',
    label: 'Remove Background',
    icon: Eraser,
    route: '/remove-background'
  },
  {
    id: 'face-detailer',
    label: 'Face Detailer',
    icon: ScanFace,
    route: '/face-detailer'
  },
  {
    id: 'server',
    label: 'ComfyUI Server & Terminal',
    icon: Terminal,
    route: '/server',
    badge: computed(() =>
      launcherStore.processStatus === 'running' ? 'ON' : undefined
    )
  }
];

function navigate(path: string) {
  router.push(path);
}
</script>

<template>
  <aside
    class="border-sidebar-border bg-sidebar z-30 flex h-full w-14 shrink-0 flex-col items-center justify-between border-r py-3.5 shadow-sm select-none"
  >
    <!-- Top: Logo & Main Navigation -->
    <div class="flex w-full flex-col items-center gap-5">
      <!-- App Brand / Workspace Quick Switch with Tooltip -->
      <Tooltip>
        <TooltipTrigger as-child>
          <div
            class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl transition-all duration-200"
            @click="navigate('/workflow')"
          >
            <img :src="appLogoUrl" alt="" class="h-10 w-10" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" :side-offset="10">
          <p class="font-medium">ComfyUI Studio</p>
        </TooltipContent>
      </Tooltip>

      <!-- Navigation Icons with Tooltips -->
      <nav class="flex w-full flex-col items-center gap-1.5 px-2">
        <Tooltip v-for="item in navItems" :key="item.id">
          <TooltipTrigger as-child>
            <button
              type="button"
              class="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-all duration-150"
              :class="[
                route.path.startsWith(item.route)
                  ? 'border-primary/30 bg-accent text-primary border shadow-xs'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              ]"
              @click="navigate(item.route)"
            >
              <component :is="item.icon" class="h-4 w-4" />

              <!-- Indicator badge for server running -->
              <span
                v-if="item.badge?.value"
                class="ring-sidebar absolute top-1 right-1 h-2 w-2 rounded-full bg-emerald-500 ring-2"
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" :side-offset="10">
            <p class="font-medium">{{ item.label }}</p>
          </TooltipContent>
        </Tooltip>
      </nav>
    </div>

    <!-- Bottom: Secondary Actions -->
    <div class="flex w-full flex-col items-center gap-2.5 px-2">
      <!-- Settings Button -->
      <Tooltip>
        <TooltipTrigger as-child>
          <button
            type="button"
            class="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-all duration-150"
            :class="[
              route.path.startsWith('/settings')
                ? 'border-primary/30 bg-accent text-primary border shadow-xs'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            ]"
            @click="navigate('/settings')"
          >
            <Settings class="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" :side-offset="10">
          <p class="font-medium">Settings</p>
        </TooltipContent>
      </Tooltip>

      <DownloadManagerPopover />
    </div>
  </aside>
</template>
