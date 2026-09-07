<script setup lang="ts">
import BooruSettings from '@/components/settings/BooruSettings.vue';
import AiSettings from '@/components/settings/AiSettings.vue';
import { computed, onMounted, ref, watch } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  Check,
  CheckCircle2,
  Cpu,
  ExternalLink,
  FolderOpen,
  Globe,
  HardDrive,
  Info,
  KeyRound,
  Loader2,
  Puzzle,
  RefreshCw,
  Settings,
  Sparkles,
  Terminal,
  Trash2,
  Wifi,
  XCircle
} from '@lucide/vue';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { loadAppData, saveAppData } from '../services/appStorage';
import { ComfyApi } from '../services/comfyApi';
import { useComfyStore } from '../stores/comfyStore';
import {
  cleanPath,
  DEFAULT_LAUNCHER_CONFIG,
  useLauncherStore
} from '../stores/launcherStore';
import { APP_VERSION, isNewerVersion } from '../version';
import PageLayout from '@/components/layout/PageLayout.vue';
import NoticeBanner from '@/components/layout/NoticeBanner.vue';
import SettingsSection from '@/components/layout/SettingsSection.vue';
import SettingsSwitchRow from '@/components/layout/SettingsSwitchRow.vue';

const launcherStore = useLauncherStore();
const comfyStore = useComfyStore();

const workingDir = ref(launcherStore.config.workingDir);
const pythonPath = ref(launcherStore.config.pythonPath);
const args = ref(launcherStore.config.args);
const serverUrl = ref(launcherStore.config.serverUrl);
const autoStart = ref(launcherStore.config.autoStart);
const autocompleteEnabled = ref(launcherStore.config.autocompleteEnabled);
const autocompleteAlgorithm = ref(launcherStore.config.autocompleteAlgorithm);
const autocompleteLimit = ref(launcherStore.config.autocompleteLimit);
const autocompleteReplaceUnderscores = ref(
  launcherStore.config.autocompleteReplaceUnderscores
);
const autocompleteIncludeArtistPrefix = ref(
  launcherStore.config.autocompleteIncludeArtistPrefix
);
const civitaiApiKey = ref('');
const savedCivitaiApiKey = ref('');
const hasCivitaiApiKey = ref(false);
const civitaiNsfw = ref(false);
let applyingCivitaiSettings = true;
let lastSavedCivitaiNsfw = false;

const isTesting = ref(false);
const testResult = ref<{ ok: boolean; message: string } | null>(null);
const saveSuccess = ref(false);
const updateChecking = ref(false);
const updateResult = ref<{
  message: string;
  type: 'current' | 'update' | 'error';
  url?: string;
} | null>(null);
const isInstallDialogOpen = ref(false);
const repositoryUrl = ref('');
const isInstallingCustomNode = ref(false);
const installResult = ref<{ ok: boolean; message: string } | null>(null);
const autocompleteReady = computed(
  () => comfyStore.isConnected && comfyStore.isYetEssentialAvailable
);

async function loadCivitaiSettings() {
  try {
    const settings = await loadAppData<{ apiKey?: string; nsfw?: boolean }>(
      'civitai_settings'
    );
    const storedKey = settings?.apiKey?.trim() ?? '';
    savedCivitaiApiKey.value = storedKey;
    hasCivitaiApiKey.value = !!storedKey;
    civitaiApiKey.value = '';
    civitaiNsfw.value = settings?.nsfw ?? false;
    lastSavedCivitaiNsfw = civitaiNsfw.value;
  } catch (error) {
    console.error(error);
  } finally {
    applyingCivitaiSettings = false;
  }
}

async function clearCivitaiApiKey() {
  savedCivitaiApiKey.value = '';
  civitaiApiKey.value = '';
  hasCivitaiApiKey.value = false;
  try {
    await saveAppData('civitai_settings', {
      apiKey: '',
      nsfw: civitaiNsfw.value
    });
    showSaved();
  } catch (error) {
    console.error(error);
  }
}

onMounted(() => {
  void loadCivitaiSettings();
});
let saveSuccessTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  autocompleteReady,
  async (ready) => {
    if (!ready) return;
    const settings = await ComfyApi.fetchTagAutocompleteSettings(
      serverUrl.value
    );
    if (!settings) return;
    autocompleteAlgorithm.value = settings.search_algorithm;
    autocompleteLimit.value = settings.search_limit;
  },
  { immediate: true }
);

async function handleBrowseComfyDir() {
  const dir = await launcherStore.selectComfyDir();
  if (dir) {
    workingDir.value = dir;
  }
}

async function handleBrowsePythonDir() {
  const dir = await launcherStore.selectPythonDir();
  if (dir) {
    pythonPath.value = dir;
  }
}

function showSaved() {
  saveSuccess.value = true;
  clearTimeout(saveSuccessTimer);
  saveSuccessTimer = setTimeout(() => {
    saveSuccess.value = false;
  }, 2500);
}

async function saveApplicationSettings() {
  autocompleteLimit.value = Math.min(
    50,
    Math.max(5, Number(autocompleteLimit.value) || 20)
  );
  const cleanedServerUrl = cleanPath(serverUrl.value);
  const serverChanged = cleanedServerUrl !== launcherStore.config.serverUrl;
  await launcherStore.saveConfig({
    workingDir: cleanPath(workingDir.value),
    pythonPath: cleanPath(pythonPath.value),
    args: args.value.trim(),
    serverUrl: cleanedServerUrl,
    autoStart: autoStart.value,
    autocompleteEnabled: autocompleteEnabled.value,
    autocompleteAlgorithm: autocompleteAlgorithm.value,
    autocompleteLimit: autocompleteLimit.value,
    autocompleteReplaceUnderscores: autocompleteReplaceUnderscores.value,
    autocompleteIncludeArtistPrefix: autocompleteIncludeArtistPrefix.value
  });
  if (!serverChanged && autocompleteEnabled.value && autocompleteReady.value) {
    await ComfyApi.updateTagAutocompleteSettings(
      cleanedServerUrl,
      autocompleteAlgorithm.value,
      autocompleteLimit.value
    );
  }
  showSaved();
  if (serverChanged) comfyStore.init();
}

const autosaveApplicationSettings = useDebounceFn(
  () => void saveApplicationSettings().catch(console.error),
  600
);
const autosaveCivitaiSettings = useDebounceFn(() => {
  const newKey = civitaiApiKey.value.trim();
  const nsfwChanged = civitaiNsfw.value !== lastSavedCivitaiNsfw;
  if (!newKey && !nsfwChanged) return;

  const keyToSave = newKey ? newKey : savedCivitaiApiKey.value;
  void saveAppData('civitai_settings', {
    apiKey: keyToSave,
    nsfw: civitaiNsfw.value
  })
    .then(() => {
      lastSavedCivitaiNsfw = civitaiNsfw.value;
      if (newKey) {
        savedCivitaiApiKey.value = newKey;
        hasCivitaiApiKey.value = true;
        civitaiApiKey.value = '';
      }
      showSaved();
    })
    .catch(console.error);
}, 600);

watch(
  [
    workingDir,
    pythonPath,
    args,
    serverUrl,
    autoStart,
    autocompleteEnabled,
    autocompleteAlgorithm,
    autocompleteLimit,
    autocompleteReplaceUnderscores,
    autocompleteIncludeArtistPrefix
  ],
  () => autosaveApplicationSettings(),
  { deep: true }
);

watch([civitaiApiKey, civitaiNsfw], () => {
  if (!applyingCivitaiSettings) autosaveCivitaiSettings();
});

async function installCustomNode() {
  if (!repositoryUrl.value.trim() || isInstallingCustomNode.value) return;
  isInstallingCustomNode.value = true;
  installResult.value = null;
  try {
    const message = await invoke<string>('install_custom_node', {
      repositoryUrl: repositoryUrl.value.trim(),
      workingDir: cleanPath(workingDir.value),
      pythonPath: cleanPath(pythonPath.value)
    });
    installResult.value = { ok: true, message };
    repositoryUrl.value = '';
  } catch (error) {
    installResult.value = {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    };
  } finally {
    isInstallingCustomNode.value = false;
  }
}

function handleResetDefaults() {
  workingDir.value = DEFAULT_LAUNCHER_CONFIG.workingDir;
  pythonPath.value = DEFAULT_LAUNCHER_CONFIG.pythonPath;
  args.value = DEFAULT_LAUNCHER_CONFIG.args;
  serverUrl.value = DEFAULT_LAUNCHER_CONFIG.serverUrl;
  autoStart.value = DEFAULT_LAUNCHER_CONFIG.autoStart;
  autocompleteEnabled.value = DEFAULT_LAUNCHER_CONFIG.autocompleteEnabled;
  autocompleteAlgorithm.value = DEFAULT_LAUNCHER_CONFIG.autocompleteAlgorithm;
  autocompleteLimit.value = DEFAULT_LAUNCHER_CONFIG.autocompleteLimit;
  autocompleteReplaceUnderscores.value =
    DEFAULT_LAUNCHER_CONFIG.autocompleteReplaceUnderscores;
  autocompleteIncludeArtistPrefix.value =
    DEFAULT_LAUNCHER_CONFIG.autocompleteIncludeArtistPrefix;
  civitaiApiKey.value = '';
  civitaiNsfw.value = false;
}

async function testConnection() {
  isTesting.value = true;
  testResult.value = null;
  const start = Date.now();
  const ok = await ComfyApi.checkHealth(serverUrl.value);
  comfyStore.isConnected = ok;
  comfyStore.isYetEssentialAvailable = ok
    ? await ComfyApi.checkTagAutocomplete(serverUrl.value)
    : false;
  const latency = Date.now() - start;
  isTesting.value = false;

  if (ok) {
    testResult.value = {
      ok: true,
      message: `Successfully connected to ComfyUI server (${latency}ms)`
    };
    comfyStore.fetchDiscovery();
  } else {
    testResult.value = {
      ok: false,
      message:
        'Failed to reach ComfyUI server. Make sure the server is running.'
    };
  }
}

async function checkForUpdates() {
  updateChecking.value = true;
  updateResult.value = null;
  try {
    const response = await fetch(
      'https://api.github.com/repos/KidiXDev/comfy-gui/releases/latest',
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);

    const release = (await response.json()) as {
      tag_name: string;
      html_url: string;
    };
    const developmentBuild = APP_VERSION === 'dev-build';
    const updateAvailable =
      developmentBuild || isNewerVersion(release.tag_name, APP_VERSION);

    updateResult.value = updateAvailable
      ? {
          type: 'update',
          message: developmentBuild
            ? `Latest release: ${release.tag_name}`
            : `${release.tag_name} is available.`,
          url: release.html_url
        }
      : {
          type: 'current',
          message: `You're up to date (${APP_VERSION}).`
        };
  } catch (error) {
    updateResult.value = {
      type: 'error',
      message: `Unable to check for updates: ${error instanceof Error ? error.message : String(error)}`
    };
  } finally {
    updateChecking.value = false;
  }
}

// ---------------------------------------------------------------------------
// Network Disk Cache (Danbooru & Animadex)
// ---------------------------------------------------------------------------
const cacheStats = ref<{ totalEntries: number; totalSizeBytes: number } | null>(
  null
);
const isClearingCache = ref(false);
const cacheMessage = ref('');

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function loadNetworkCacheStats() {
  try {
    cacheStats.value = await invoke<{
      totalEntries: number;
      totalSizeBytes: number;
    }>('get_network_cache_stats');
  } catch (err) {
    console.warn('Failed to load network cache stats:', err);
  }
}

async function clearNetworkDiskCache() {
  if (isClearingCache.value) return;
  isClearingCache.value = true;
  try {
    await invoke('clear_network_cache', { namespace: null });
    await loadNetworkCacheStats();
    cacheMessage.value = 'Disk cache cleared.';
    setTimeout(() => {
      cacheMessage.value = '';
    }, 3000);
  } catch (err) {
    cacheMessage.value = `Failed to clear: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    isClearingCache.value = false;
  }
}

void loadNetworkCacheStats();
</script>

<template>
  <PageLayout
    title="Application Settings"
    subtitle="Manage runtime executables, network parameters, and extensions"
  >
    <template #icon>
      <Settings class="h-4 w-4" />
    </template>
    <template #actions>
      <transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 translate-x-1"
        enter-to-class="opacity-100 translate-x-0"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="saveSuccess"
          class="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400"
        >
          <Check class="h-3.5 w-3.5" />
          <span>Settings Saved</span>
        </div>
      </transition>

      <Button
        variant="outline"
        size="sm"
        class="border-border bg-secondary/80 text-foreground hover:bg-accent text-xs font-medium"
        @click="handleResetDefaults"
      >
        <RefreshCw class="h-3.5 w-3.5" />
        <span>Reset Defaults</span>
      </Button>
    </template>

    <div class="mx-auto flex flex-col gap-6 pb-8">
      <SettingsSection title="ComfyUI Configuration" icon-class="text-cyan-400">
        <template #icon>
          <Terminal class="h-3.5 w-3.5" />
        </template>
        <template #actions>
          <Label
            class="text-foreground flex cursor-pointer items-center gap-2 text-xs font-medium"
          >
            <Switch v-model="autoStart" />
            <span>Auto-launch on startup</span>
          </Label>
        </template>

        <Field class="gap-1.5">
          <FieldLabel class="text-foreground text-xs font-medium">
            ComfyUI Directory
          </FieldLabel>
          <div class="flex items-center gap-2">
            <div class="relative flex-1">
              <FolderOpen
                class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2"
              />
              <Input
                v-model="workingDir"
                placeholder="Select the folder containing main.py"
                class="text-foreground pl-9 font-mono text-xs"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="border-border bg-secondary text-foreground hover:bg-accent shrink-0 text-xs font-medium"
              @click="handleBrowseComfyDir"
            >
              <FolderOpen class="h-3.5 w-3.5" />
              <span>Browse…</span>
            </Button>
          </div>
        </Field>

        <Field class="gap-1.5">
          <FieldLabel class="text-foreground text-xs font-medium">
            Embedded Python Directory
          </FieldLabel>
          <div class="flex items-center gap-2">
            <div class="relative flex-1">
              <Cpu
                class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2"
              />
              <Input
                v-model="pythonPath"
                placeholder="e.g. python_embeded or python_embeded\python.exe"
                class="text-foreground pl-9 font-mono text-xs"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="border-border bg-secondary text-foreground hover:bg-accent shrink-0 text-xs font-medium"
              @click="handleBrowsePythonDir"
            >
              <FolderOpen class="h-3.5 w-3.5" />
              <span>Browse…</span>
            </Button>
          </div>
        </Field>

        <Field class="gap-1.5">
          <FieldLabel class="text-foreground text-xs font-medium">
            Launch Command Arguments
          </FieldLabel>
          <Textarea
            v-model="args"
            rows="3"
            placeholder="--windows-standalone-build --fast fp16_accumulation --cuda-malloc --use-sage-attention --preview-method latent2rgb --enable-manager --disable-auto-launch"
            class="text-foreground border-border bg-secondary/50 focus:bg-background w-full font-mono text-xs leading-relaxed transition-colors"
          />
        </Field>
      </SettingsSection>

      <section
        class="border-border/80 bg-card/80 flex items-center justify-between gap-4 rounded-xl border p-5 shadow-xs backdrop-blur-xs"
      >
        <div class="flex items-center gap-2.5">
          <div
            class="border-border bg-secondary flex h-7 w-7 items-center justify-center rounded-md border text-violet-400"
          >
            <Puzzle class="h-3.5 w-3.5" />
          </div>
          <div>
            <span class="text-xs font-bold tracking-wider uppercase">
              Custom Nodes
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="border-border bg-secondary shrink-0 text-xs font-medium"
          @click="isInstallDialogOpen = true"
        >
          Install custom node
        </Button>
      </section>

      <SettingsSection
        title="Network & Server Connection"
        icon-class="text-emerald-400"
        body-class="gap-3.5"
      >
        <template #icon>
          <Globe class="h-3.5 w-3.5" />
        </template>
        <template #actions>
          <span
            class="flex h-2 w-2 rounded-full"
            :class="
              comfyStore.isConnected
                ? 'bg-emerald-400 shadow-xs shadow-emerald-400/50'
                : 'bg-muted-foreground'
            "
          />
          <span class="text-muted-foreground text-xs">
            {{ comfyStore.isConnected ? 'Connected' : 'Offline' }}
          </span>
        </template>

        <Field class="gap-1.5">
          <FieldLabel class="text-foreground text-xs font-medium">
            ComfyUI Server Endpoint URL
          </FieldLabel>
          <div class="flex items-center gap-2">
            <div class="relative flex-1">
              <Wifi
                class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2"
              />
              <Input
                v-model="serverUrl"
                placeholder="http://127.0.0.1:8188"
                class="text-foreground pl-9 font-mono text-xs"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              :disabled="isTesting"
              class="border-border bg-secondary text-foreground hover:bg-accent text-xs font-medium"
              @click="testConnection"
            >
              <Loader2 v-if="isTesting" class="h-3.5 w-3.5 animate-spin" />
              <Wifi v-else class="h-3.5 w-3.5" />
              <span>Test Connection</span>
            </Button>
          </div>
        </Field>

        <div
          v-if="testResult"
          class="flex items-center gap-2.5 rounded-lg p-3 text-xs font-medium transition-all"
          :class="
            testResult.ok
              ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-destructive/30 bg-destructive/10 text-destructive border'
          "
        >
          <CheckCircle2
            v-if="testResult.ok"
            class="h-4 w-4 shrink-0 text-emerald-400"
          />
          <XCircle v-else class="text-destructive h-4 w-4 shrink-0" />
          <span>{{ testResult.message }}</span>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Prompt Tag Autocomplete"
        icon-class="text-amber-400"
      >
        <template #icon>
          <Sparkles class="h-3.5 w-3.5" />
        </template>
        <template #actions>
          <Label
            class="text-foreground flex cursor-pointer items-center gap-2 text-xs font-medium"
            :class="{ 'opacity-50': !autocompleteReady }"
          >
            <Switch
              v-model="autocompleteEnabled"
              :disabled="!autocompleteReady"
            />
            <span>Enabled</span>
          </Label>
        </template>

        <NoticeBanner v-if="!autocompleteReady">
          <span v-if="!comfyStore.isConnected">
            Start the ComfyUI server to detect autocomplete support.
            Autocomplete settings remain disabled while offline.
          </span>
          <span v-else>
            The
            <code class="font-mono font-semibold">yet_essential</code> custom
            node is not detected. Install it into ComfyUI's
            <code class="font-mono">custom_nodes</code> and restart ComfyUI.
          </span>
        </NoticeBanner>

        <div
          class="grid grid-cols-1 gap-4 sm:grid-cols-2"
          :class="{
            'pointer-events-none opacity-50':
              !autocompleteEnabled || !autocompleteReady
          }"
        >
          <Field class="gap-1.5">
            <FieldLabel class="text-foreground text-xs font-medium">
              Search Mode
            </FieldLabel>
            <Select
              v-model="autocompleteAlgorithm"
              :disabled="!autocompleteEnabled || !autocompleteReady"
            >
              <SelectTrigger class="w-full text-xs">
                <SelectValue placeholder="Search mode">
                  {{
                    autocompleteAlgorithm === 'fuzzy'
                      ? 'Fuzzy (Flexible matching)'
                      : autocompleteAlgorithm === 'contains'
                        ? 'Contains (Substring search)'
                        : autocompleteAlgorithm === 'prefix'
                          ? 'Prefix (Fastest & strictest)'
                          : autocompleteAlgorithm
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup class="max-h-40 overflow-y-auto">
                  <SelectItem value="fuzzy">
                    Fuzzy (Flexible matching)
                  </SelectItem>
                  <SelectItem value="contains">
                    Contains (Substring search)
                  </SelectItem>
                  <SelectItem value="prefix">
                    Prefix (Fastest & strictest)
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field class="gap-1.5">
            <FieldLabel class="text-foreground text-xs font-medium">
              Maximum Suggestions Limit
            </FieldLabel>
            <Input
              v-model="autocompleteLimit"
              type="number"
              min="5"
              max="50"
              :disabled="!autocompleteEnabled || !autocompleteReady"
              class="font-mono text-xs"
            />
          </Field>
        </div>

        <SettingsSwitchRow
          v-model="autocompleteReplaceUnderscores"
          label="Replace Underscores with Spaces"
          :disabled="!autocompleteEnabled || !autocompleteReady"
        />

        <SettingsSwitchRow
          v-model="autocompleteIncludeArtistPrefix"
          label="Keep @ on Artist Tags"
          :disabled="!autocompleteEnabled || !autocompleteReady"
        />
      </SettingsSection>

      <BooruSettings :server-url="serverUrl" @saved="showSaved" />

      <SettingsSection title="Civitai API" icon-class="text-orange-400">
        <template #icon>
          <KeyRound class="h-3.5 w-3.5" />
        </template>
        <template #actions>
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="text-xs"
            @click="openUrl('https://civitai.com/user/account')"
          >
            <ExternalLink class="h-3.5 w-3.5" />
            Manage API keys
          </Button>
        </template>

        <Field class="gap-1.5">
          <FieldLabel class="text-xs">API Key</FieldLabel>
          <div class="relative">
            <Input
              v-model="civitaiApiKey"
              type="password"
              autocomplete="new-password"
              :placeholder="
                hasCivitaiApiKey
                  ? 'Saved'
                  : 'Optional for browsing, required by gated models'
              "
              class="pr-10 font-mono text-xs"
              @keydown.enter="autosaveCivitaiSettings.flush()"
              @blur="autosaveCivitaiSettings.flush()"
            />
            <button
              v-if="hasCivitaiApiKey && !civitaiApiKey"
              type="button"
              class="text-muted-foreground hover:text-destructive absolute top-1/2 right-2.5 -translate-y-1/2 p-1 transition-colors"
              title="Remove saved Civitai API key"
              @click="clearCivitaiApiKey"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </button>
          </div>
        </Field>

        <SettingsSwitchRow
          v-model="civitaiNsfw"
          label="Enable NSFW Content"
          label-for="civitai-nsfw-switch"
        />
      </SettingsSection>

      <AiSettings @saved="showSaved" />

      <SettingsSection title="Network Disk Cache" icon-class="text-cyan-400">
        <template #icon>
          <HardDrive class="h-3.5 w-3.5" />
        </template>

        <div class="flex flex-col gap-3">
          <div class="flex flex-wrap items-center gap-4">
            <div
              v-if="cacheStats"
              class="text-muted-foreground flex items-center gap-2 font-mono text-xs"
            >
              <span class="text-foreground font-semibold">
                Size in disk:
                {{ formatBytes(cacheStats.totalSizeBytes) }}</span
              >
            </div>
            <div v-else class="text-muted-foreground text-xs">
              Loading cache statistics…
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="
                isClearingCache || !cacheStats || cacheStats.totalEntries === 0
              "
              class="border-border bg-secondary hover:bg-accent h-8 gap-1.5 text-xs font-medium"
              @click="clearNetworkDiskCache"
            >
              <Loader2
                v-if="isClearingCache"
                class="h-3.5 w-3.5 animate-spin"
              />
              <Trash2 v-else class="h-3.5 w-3.5 text-rose-400" />
              {{ isClearingCache ? 'Clearing…' : 'Clear Network Cache' }}
            </Button>

            <span
              v-if="cacheMessage"
              class="font-mono text-xs text-emerald-400"
            >
              {{ cacheMessage }}
            </span>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="About ComfyGUI" icon-class="text-violet-400">
        <template #icon>
          <Info class="h-3.5 w-3.5" />
        </template>

        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-muted-foreground text-xs">Current version</p>
            <p class="mt-1 font-mono text-sm font-semibold">
              {{ APP_VERSION }}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            :disabled="updateChecking"
            class="border-border bg-secondary text-xs font-medium"
            @click="checkForUpdates"
          >
            <Loader2 v-if="updateChecking" class="h-3.5 w-3.5 animate-spin" />
            <RefreshCw v-else class="h-3.5 w-3.5" />
            Check for updates
          </Button>
        </div>

        <div
          v-if="updateResult"
          class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-xs"
          :class="{
            'border-emerald-500/30 bg-emerald-500/10 text-emerald-400':
              updateResult.type === 'current',
            'border-primary/30 bg-primary/10 text-primary':
              updateResult.type === 'update',
            'border-destructive/30 bg-destructive/10 text-destructive':
              updateResult.type === 'error'
          }"
        >
          <span>{{ updateResult.message }}</span>
          <Button
            v-if="updateResult.url"
            type="button"
            variant="ghost"
            size="sm"
            class="h-7 shrink-0 text-xs"
            @click="openUrl(updateResult.url)"
          >
            View release
            <ExternalLink class="h-3.5 w-3.5" />
          </Button>
        </div>
      </SettingsSection>
    </div>
  </PageLayout>

  <Dialog v-model:open="isInstallDialogOpen">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Install custom node</DialogTitle>
      </DialogHeader>

      <Field class="gap-1.5">
        <FieldLabel>GitHub repository URL</FieldLabel>
        <Input
          v-model="repositoryUrl"
          type="url"
          autocomplete="off"
          placeholder="https://github.com/owner/custom-node"
          class="font-mono text-xs"
          :disabled="isInstallingCustomNode"
          @keydown.enter="installCustomNode"
        />
      </Field>

      <div
        v-if="installResult"
        class="rounded-md border px-3 py-2 text-xs"
        :class="
          installResult.ok
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            : 'border-destructive/30 bg-destructive/10 text-destructive'
        "
      >
        {{ installResult.message }}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          :disabled="isInstallingCustomNode"
          @click="isInstallDialogOpen = false"
        >
          Close
        </Button>
        <Button
          type="button"
          :disabled="!repositoryUrl.trim() || isInstallingCustomNode"
          @click="installCustomNode"
        >
          <Loader2
            v-if="isInstallingCustomNode"
            class="h-3.5 w-3.5 animate-spin"
          />
          {{ isInstallingCustomNode ? 'Installing…' : 'Install' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
