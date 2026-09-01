<script setup lang="ts">
import { onMounted } from 'vue';
import { AlignLeft, Box, Monitor, Sliders } from '@lucide/vue';
import PromptSection from '@/components/template/PromptSection.vue';
import ModelSection from '@/components/template/ModelSection.vue';
import LoraChainSection from '@/components/template/LoraChainSection.vue';
import SamplerSection from '@/components/template/SamplerSection.vue';
import PostFxSection from '@/components/template/PostFxSection.vue';
import GenerationPreview from '@/components/template/GenerationPreview.vue';
import HistoryDrawer from '@/components/template/HistoryDrawer.vue';
import LauncherSettingsModal from '@/components/template/LauncherSettingsModal.vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useComfyStore } from '../stores/comfyStore';
import { useLauncherStore } from '../stores/launcherStore';

const comfyStore = useComfyStore();
const launcherStore = useLauncherStore();

onMounted(() => {
  launcherStore.initTauriListeners();
  comfyStore.init();
});
</script>

<template>
  <main class="mx-auto w-full max-w-7xl px-4 py-4 md:py-6">
    <div class="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
      <!-- Left Column: Controls & Parameter Form (7 cols) -->
      <div class="flex flex-col gap-4 lg:col-span-7">
        <!-- 1. Prompts Card -->
        <Card class="border-border bg-card shadow-2xs">
          <CardHeader class="pb-2">
            <CardTitle
              class="text-foreground flex items-center gap-2 text-xs font-semibold tracking-wider uppercase"
            >
              <AlignLeft class="text-primary h-3.5 w-3.5" />
              <span>Prompt Definition</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PromptSection />
          </CardContent>
        </Card>

        <!-- 2. Models Card -->
        <Card class="border-border bg-card shadow-2xs">
          <CardHeader class="pb-2">
            <CardTitle
              class="text-foreground flex items-center gap-2 text-xs font-semibold tracking-wider uppercase"
            >
              <Box class="text-primary h-3.5 w-3.5" />
              <span>Model Architecture</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ModelSection />
          </CardContent>
        </Card>

        <!-- 3. LoRA Chain Stack Card -->
        <Card class="border-border bg-card shadow-2xs">
          <CardContent class="pt-4">
            <LoraChainSection />
          </CardContent>
        </Card>

        <!-- 4. Sampler & Generation Settings -->
        <Card class="border-border bg-card shadow-2xs">
          <CardHeader class="pb-2">
            <CardTitle
              class="text-foreground flex items-center gap-2 text-xs font-semibold tracking-wider uppercase"
            >
              <Sliders class="text-primary h-3.5 w-3.5" />
              <span>Sampling & Dimensions</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SamplerSection />
          </CardContent>
        </Card>

        <!-- 5. Advanced PostFX & Upscaler -->
        <PostFxSection />
      </div>

      <!-- Right Column: Generation Preview & Actions (5 cols sticky) -->
      <div class="flex flex-col gap-4 lg:sticky lg:top-20 lg:col-span-5">
        <Card class="border-border bg-card overflow-hidden shadow-2xs">
          <CardHeader class="pb-2">
            <div class="flex items-center justify-between">
              <CardTitle
                class="text-foreground flex items-center gap-2 text-xs font-semibold tracking-wider uppercase"
              >
                <Monitor class="text-primary h-3.5 w-3.5" />
                <span>Render Viewport</span>
              </CardTitle>
              <span
                v-if="comfyStore.isConnected"
                class="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400"
              >
                Engine Ready
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <GenerationPreview />
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Drawers & Modals -->
    <HistoryDrawer />
    <LauncherSettingsModal />
  </main>
</template>
