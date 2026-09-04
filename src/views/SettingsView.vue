<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Cpu,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FolderOpen,
  Globe,
  Image as ImageIcon,
  Info,
  KeyRound,
  Loader2,
  Puzzle,
  RefreshCw,
  Settings,
  Sparkles,
  Tag,
  Terminal,
  Trash2,
  Wifi,
  XCircle
} from '@lucide/vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
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
import {
  clearBooruCache,
  fetchBooruSettings,
  saveBooruSettings,
  testBooruCredentials,
  type BooruCredentials,
  type BooruSettings,
  type BooruSettingsUpdate
} from '../services/booruGallery';
import { loadAppData, saveAppData } from '../services/appStorage';
import { ComfyApi } from '../services/comfyApi';
import { useComfyStore } from '../stores/comfyStore';
import {
  cleanPath,
  DEFAULT_LAUNCHER_CONFIG,
  useLauncherStore
} from '../stores/launcherStore';
import { APP_VERSION, isNewerVersion } from '../version';
import { useAiStore } from '../stores/aiStore';
import AiModelSelector from '@/components/common/AiModelSelector.vue';

const launcherStore = useLauncherStore();
const comfyStore = useComfyStore();
const aiStore = useAiStore();

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
const booruSettings = ref<BooruSettings | null>(null);
const booruAvailable = ref<boolean | null>(null);
const booruCredentials = ref<BooruCredentials>({
  danbooru: { username: '', apiKey: '' },
  gelbooru: { userId: '', apiKey: '' }
});
const showDanbooruKey = ref(false);
const showGelbooruKey = ref(false);
const civitaiApiKey = ref('');
const savedCivitaiApiKey = ref('');
const hasCivitaiApiKey = ref(false);
const civitaiNsfw = ref(false);
let applyingCivitaiSettings = true;
let lastSavedCivitaiNsfw = false;

const booruDefaultSource = ref('danbooru');
const booruBlacklist = ref('');
const booruOutputFilterTags = ref('');
const booruPromptCategories = ref<string[]>([
  'copyright',
  'character',
  'general'
]);
const booruReplaceUnderscores = ref(false);
const booruEscapeParentheses = ref(false);
const booruTimeout = ref(30);
const booruCacheBudget = ref(1024);
const booruCacheMessage = ref('');
const booruTesting = ref<'danbooru' | 'gelbooru' | null>(null);
const booruResult = ref<{
  source: 'danbooru' | 'gelbooru';
  ok: boolean;
  message: string;
} | null>(null);

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
  loadAiSettings();
});

const openRouterApiKey = ref('');
const savedOpenRouterApiKey = ref('');
const hasOpenRouterApiKey = ref(false);
const isTestingAi = ref(false);
const aiTestResult = ref<{ ok: boolean; message: string } | null>(null);

function loadAiSettings() {
  const key = aiStore.config.apiKey.trim();
  savedOpenRouterApiKey.value = key;
  hasOpenRouterApiKey.value = !!key;
  openRouterApiKey.value = '';
}

function clearOpenRouterApiKey() {
  savedOpenRouterApiKey.value = '';
  openRouterApiKey.value = '';
  hasOpenRouterApiKey.value = false;
  aiStore.config.apiKey = '';
  void aiStore.saveConfig();
  showSaved();
}

const autosaveAiSettings = useDebounceFn(() => {
  const newKey = openRouterApiKey.value.trim();
  if (newKey) {
    aiStore.config.apiKey = newKey;
    savedOpenRouterApiKey.value = newKey;
    hasOpenRouterApiKey.value = true;
    openRouterApiKey.value = '';
  }
  void aiStore.saveConfig();
  showSaved();
}, 300);

async function testOpenRouterConnection() {
  const key = openRouterApiKey.value.trim() || savedOpenRouterApiKey.value;
  if (!key) {
    aiTestResult.value = {
      ok: false,
      message: 'Please enter an API key first'
    };
    return;
  }
  isTestingAi.value = true;
  aiTestResult.value = null;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { Authorization: `Bearer ${key}` }
    });
    if (res.ok) {
      const data = (await res.json()) as {
        data?: { label?: string; usage?: number; limit?: number };
      };
      aiTestResult.value = {
        ok: true,
        message: `Connected! ${data?.data?.label ? `(${data.data.label})` : 'Key is valid'}`
      };
      if (openRouterApiKey.value.trim()) {
        aiStore.config.apiKey = openRouterApiKey.value.trim();
        savedOpenRouterApiKey.value = openRouterApiKey.value.trim();
        hasOpenRouterApiKey.value = true;
        openRouterApiKey.value = '';
        void aiStore.saveConfig();
      }
      void aiStore.refreshModels(true);
    } else {
      aiTestResult.value = {
        ok: false,
        message: `Authentication failed: HTTP ${res.status}`
      };
    }
  } catch (err) {
    aiTestResult.value = { ok: false, message: String(err) };
  } finally {
    isTestingAi.value = false;
  }
}

watch(
  () => aiStore.config.apiKey,
  (val) => {
    savedOpenRouterApiKey.value = val;
    hasOpenRouterApiKey.value = !!val;
  }
);
const danbooruConfigured = computed(
  () =>
    booruSettings.value?.credentialStatus.danbooru?.hasUsername &&
    booruSettings.value?.credentialStatus.danbooru?.hasApiKey
);
const gelbooruConfigured = computed(
  () =>
    booruSettings.value?.credentialStatus.gelbooru?.hasUserId &&
    booruSettings.value?.credentialStatus.gelbooru?.hasApiKey
);

const BOORU_PROMPT_CATEGORIES = [
  'artist',
  'copyright',
  'character',
  'general',
  'meta'
];

let applyingGallerySettings = false;
let saveSuccessTimer: ReturnType<typeof setTimeout> | undefined;

function applyGallerySettings(settings: BooruSettings) {
  applyingGallerySettings = true;
  try {
    booruSettings.value = settings;
    booruDefaultSource.value = settings.defaultSource;
    booruBlacklist.value = settings.blacklist.join(', ');
    booruOutputFilterTags.value = settings.outputFilterTags.join(', ');
    booruPromptCategories.value = [...settings.promptDefaults.categories];
    booruReplaceUnderscores.value = settings.promptDefaults.replaceUnderscores;
    booruEscapeParentheses.value = settings.promptDefaults.escapeParentheses;
    booruTimeout.value = settings.timeout;
    booruCacheBudget.value = settings.cacheBudgetMiB;
  } finally {
    applyingGallerySettings = false;
  }
}

async function loadGallerySettings() {
  if (!comfyStore.isConnected) {
    booruAvailable.value = null;
    booruSettings.value = null;
    return;
  }
  try {
    applyGallerySettings(await fetchBooruSettings(serverUrl.value));
    booruAvailable.value = true;
  } catch {
    booruAvailable.value = false;
    booruSettings.value = null;
  }
}

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

watch(
  () => comfyStore.isConnected,
  () => void loadGallerySettings(),
  { immediate: true }
);

function parseTagList(value: string) {
  return [
    ...new Set(
      value
        .split(/[,，、\r\n]+/u)
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  ];
}

function togglePromptCategory(category: string) {
  booruPromptCategories.value = booruPromptCategories.value.includes(category)
    ? booruPromptCategories.value.filter((item) => item !== category)
    : [...booruPromptCategories.value, category];
}

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

async function saveGalleryPreferences() {
  if (booruAvailable.value) {
    const credentials: Partial<BooruCredentials> = {};
    if (
      booruCredentials.value.danbooru.username &&
      booruCredentials.value.danbooru.apiKey
    ) {
      credentials.danbooru = booruCredentials.value.danbooru;
    }
    if (
      booruCredentials.value.gelbooru.userId &&
      booruCredentials.value.gelbooru.apiKey
    ) {
      credentials.gelbooru = booruCredentials.value.gelbooru;
    }
    booruTimeout.value = Math.min(
      300,
      Math.max(3, Number(booruTimeout.value) || 30)
    );
    booruCacheBudget.value = Math.min(
      32768,
      Math.max(128, Number(booruCacheBudget.value) || 1024)
    );
    const update: BooruSettingsUpdate = {
      defaultSource: booruDefaultSource.value,
      blacklist: parseTagList(booruBlacklist.value),
      outputFilterTags: parseTagList(booruOutputFilterTags.value),
      promptDefaults: {
        categories: booruPromptCategories.value,
        replaceUnderscores: booruReplaceUnderscores.value,
        escapeParentheses: booruEscapeParentheses.value
      },
      timeout: booruTimeout.value,
      cacheBudgetMiB: booruCacheBudget.value,
      ...(Object.keys(credentials).length > 0 ? { credentials } : {})
    };
    applyGallerySettings(
      await saveBooruSettings(cleanPath(serverUrl.value), update)
    );
    if (Object.keys(credentials).length > 0) {
      applyingGallerySettings = true;
      booruCredentials.value = {
        danbooru: { username: '', apiKey: '' },
        gelbooru: { userId: '', apiKey: '' }
      };
      applyingGallerySettings = false;
    }
    showSaved();
  }
}

const autosaveApplicationSettings = useDebounceFn(
  () => void saveApplicationSettings().catch(console.error),
  600
);
const autosaveGalleryPreferences = useDebounceFn(
  () => void saveGalleryPreferences().catch(console.error),
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

watch(
  [
    booruDefaultSource,
    booruBlacklist,
    booruOutputFilterTags,
    booruPromptCategories,
    booruReplaceUnderscores,
    booruEscapeParentheses,
    booruTimeout,
    booruCacheBudget,
    booruCredentials
  ],
  () => {
    if (!applyingGallerySettings) autosaveGalleryPreferences();
  },
  { deep: true, flush: 'sync' }
);

watch([civitaiApiKey, civitaiNsfw], () => {
  if (!applyingCivitaiSettings) autosaveCivitaiSettings();
});

async function testBooruAccount(source: 'danbooru' | 'gelbooru') {
  booruTesting.value = source;
  booruResult.value = null;
  try {
    await testBooruCredentials(cleanPath(serverUrl.value), source, {
      ...booruCredentials.value[source]
    });
    booruResult.value = {
      source,
      ok: true,
      message: `${source === 'danbooru' ? 'Danbooru' : 'Gelbooru'} connection succeeded.`
    };
  } catch (error) {
    booruResult.value = {
      source,
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    };
  } finally {
    booruTesting.value = null;
  }
}

async function clearGalleryCache() {
  booruCacheMessage.value = '';
  try {
    await clearBooruCache(cleanPath(serverUrl.value));
    booruCacheMessage.value = 'Gallery cache cleared successfully.';
  } catch (error) {
    booruCacheMessage.value =
      error instanceof Error ? error.message : String(error);
  }
}

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
</script>

<template>
  <div class="bg-background flex h-full flex-col overflow-hidden select-none">
    <!-- Header -->
    <header
      class="border-border/80 bg-card/70 flex h-14 shrink-0 items-center justify-between border-b px-6 backdrop-blur-md"
    >
      <div class="flex items-center gap-3">
        <div
          class="border-primary/30 bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-lg border shadow-xs"
        >
          <Settings class="h-4 w-4" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-xs font-bold tracking-wider uppercase">
              Application Settings
            </h1>
          </div>
          <p class="text-muted-foreground text-xs">
            Manage runtime executables, network parameters, and extensions
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2.5">
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
      </div>
    </header>

    <!-- Settings Content -->
    <div class="flex-1 overflow-y-auto p-6">
      <div class="mx-auto flex flex-col gap-6 pb-8">
        <!-- 1. ComfyUI Local Process Configuration -->
        <section
          class="border-border/80 bg-card/80 flex flex-col gap-4 rounded-xl border p-5 shadow-xs backdrop-blur-xs"
        >
          <div
            class="border-border/80 flex items-center justify-between border-b pb-3"
          >
            <div class="flex items-center gap-2.5">
              <div
                class="border-border bg-secondary flex h-7 w-7 items-center justify-center rounded-md border text-cyan-400"
              >
                <Terminal class="h-3.5 w-3.5" />
              </div>
              <div>
                <span class="text-xs font-bold tracking-wider uppercase">
                  ComfyUI Portable Launcher
                </span>
                <p class="text-muted-foreground text-xs">
                  Native Python process lifecycle and path definitions
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <Label
                class="text-foreground flex cursor-pointer items-center gap-2 text-xs font-medium"
              >
                <Switch v-model="autoStart" />
                <span>Auto-launch on startup</span>
              </Label>
            </div>
          </div>

          <div class="flex flex-col gap-4">
            <Field class="gap-1.5">
              <div class="flex items-center justify-between">
                <FieldLabel class="text-foreground text-xs font-medium">
                  ComfyUI Directory
                </FieldLabel>
                <span class="text-muted-foreground text-xs">
                  Root directory containing
                  <code class="font-mono">main.py</code>
                </span>
              </div>
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
              <div class="flex items-center justify-between">
                <FieldLabel class="text-foreground text-xs font-medium">
                  Embedded Python Directory
                </FieldLabel>
                <span class="text-muted-foreground text-xs">
                  Folder or binary for embedded Python environment
                </span>
              </div>
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
              <div class="flex items-center justify-between">
                <FieldLabel class="text-foreground text-xs font-medium">
                  Launch Command Arguments
                </FieldLabel>
                <span class="text-muted-foreground text-xs">
                  CLI flags passed to Python on process spawn
                </span>
              </div>
              <Textarea
                v-model="args"
                rows="3"
                placeholder="--windows-standalone-build --fast fp16_accumulation --cuda-malloc --use-sage-attention --preview-method latent2rgb --enable-manager --disable-auto-launch"
                class="text-foreground border-border bg-secondary/50 focus:bg-background w-full font-mono text-xs leading-relaxed transition-colors"
              />
            </Field>
          </div>
        </section>

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
              <p class="text-muted-foreground text-xs">
                Clone a GitHub repository and install its Python requirements
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="border-border bg-secondary shrink-0 text-xs font-medium"
            @click="isInstallDialogOpen = true"
          >
            <Download class="h-3.5 w-3.5" />
            Install custom node
          </Button>
        </section>

        <!-- 2. Network & Server Endpoint -->
        <section
          class="border-border/80 bg-card/80 flex flex-col gap-4 rounded-xl border p-5 shadow-xs backdrop-blur-xs"
        >
          <div
            class="border-border/80 flex items-center justify-between border-b pb-3"
          >
            <div class="flex items-center gap-2.5">
              <div
                class="border-border bg-secondary flex h-7 w-7 items-center justify-center rounded-md border text-emerald-400"
              >
                <Globe class="h-3.5 w-3.5" />
              </div>
              <div>
                <span class="text-xs font-bold tracking-wider uppercase">
                  Network & Server Connection
                </span>
                <p class="text-muted-foreground text-xs">
                  REST HTTP endpoint and live WebSocket stream URL
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2">
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
            </div>
          </div>

          <div class="flex flex-col gap-3.5">
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
          </div>
        </section>

        <!-- 3. Prompt Tag Autocomplete -->
        <section
          class="border-border/80 bg-card/80 flex flex-col gap-4 rounded-xl border p-5 shadow-xs backdrop-blur-xs"
        >
          <div
            class="border-border/80 flex items-center justify-between border-b pb-3"
          >
            <div class="flex items-center gap-2.5">
              <div
                class="border-border bg-secondary flex h-7 w-7 items-center justify-center rounded-md border text-amber-400"
              >
                <Sparkles class="h-3.5 w-3.5" />
              </div>
              <div>
                <span class="text-xs font-bold tracking-wider uppercase">
                  Prompt Tag Autocomplete
                </span>
                <p class="text-muted-foreground text-xs">
                  Type normally for tags, $ for wildcards, or @ for artists
                </p>
              </div>
            </div>

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
          </div>

          <!-- Alert only shown when NOT ready/detected -->
          <div
            v-if="!autocompleteReady"
            class="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300"
          >
            <AlertCircle class="h-4 w-4 shrink-0 text-amber-400" />
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
          </div>

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
              <FieldDescription class="text-xs">
                Fuzzy tolerates skipped characters; prefix is strictly
                start-of-word.
              </FieldDescription>
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
              <FieldDescription class="text-xs">
                Number of popup tag results per token search (5–50).
              </FieldDescription>
            </Field>
          </div>

          <div
            class="border-border/60 bg-muted/20 flex items-center justify-between rounded-lg border p-3"
            :class="{
              'opacity-50': !autocompleteEnabled || !autocompleteReady
            }"
          >
            <div>
              <Label class="text-foreground text-xs font-medium">
                Replace Underscores with Spaces
              </Label>
              <p class="text-muted-foreground mt-0.5 text-xs">
                Converts tokens like <code class="font-mono">blue_hair</code> to
                <code class="font-mono">blue hair</code> on insertion.
              </p>
            </div>
            <Switch
              v-model="autocompleteReplaceUnderscores"
              :disabled="!autocompleteEnabled || !autocompleteReady"
            />
          </div>

          <div
            class="border-border/60 bg-muted/20 flex items-center justify-between rounded-lg border p-3"
            :class="{
              'opacity-50': !autocompleteEnabled || !autocompleteReady
            }"
          >
            <div>
              <Label class="text-foreground text-xs font-medium">
                Keep @ on Artist Tags
              </Label>
              <p class="text-muted-foreground mt-0.5 text-xs">
                Insert artist suggestions as
                <code class="font-mono">@artist_name</code> instead of
                <code class="font-mono">artist_name</code>.
              </p>
            </div>
            <Switch
              v-model="autocompleteIncludeArtistPrefix"
              :disabled="!autocompleteEnabled || !autocompleteReady"
            />
          </div>
        </section>

        <!-- 4. Booru Gallery -->
        <section
          class="border-border/80 bg-card/80 flex flex-col gap-4 rounded-xl border p-5 shadow-xs backdrop-blur-xs"
        >
          <div
            class="border-border/80 flex items-center justify-between border-b pb-3"
          >
            <div class="flex items-center gap-2.5">
              <div
                class="border-border bg-secondary flex h-7 w-7 items-center justify-center rounded-md border text-purple-400"
              >
                <ImageIcon class="h-3.5 w-3.5" />
              </div>
              <div>
                <span class="text-xs font-bold tracking-wider uppercase">
                  Booru Gallery & Provider Credentials
                </span>
                <p class="text-muted-foreground text-xs">
                  Danbooru, Gelbooru, Safebooru, and AI TAG integration settings
                </p>
              </div>
            </div>

            <Badge
              v-if="booruAvailable"
              variant="outline"
              class="border-emerald-500/30 bg-emerald-500/10 text-xs font-medium text-emerald-400"
            >
              Active
            </Badge>
          </div>

          <!-- Alert only shown when NOT ready/detected -->
          <div
            v-if="!booruAvailable"
            class="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300"
          >
            <AlertCircle class="h-4 w-4 shrink-0 text-amber-400" />
            <span v-if="!comfyStore.isConnected">
              Start the ComfyUI server to configure the Booru Gallery.
            </span>
            <span v-else>
              The
              <code class="font-mono font-semibold">comfyui-aaalice-nodes</code>
              custom node is not detected. Install it into ComfyUI's
              <code class="font-mono">custom_nodes</code> to enable the gallery.
            </span>
          </div>

          <!-- General Booru Config -->
          <div
            class="grid grid-cols-1 gap-4 lg:grid-cols-2"
            :class="{ 'pointer-events-none opacity-50': !booruAvailable }"
          >
            <div
              class="border-border/80 bg-muted/20 flex flex-col gap-3 rounded-lg border p-4"
            >
              <div>
                <Label class="text-foreground text-xs font-semibold">
                  Default Source
                </Label>
                <p class="text-muted-foreground text-xs">
                  Initial provider when opening a new gallery view
                </p>
              </div>
              <Select v-model="booruDefaultSource" :disabled="!booruAvailable">
                <SelectTrigger class="w-full text-xs">
                  <SelectValue placeholder="Default source">
                    {{
                      booruDefaultSource === 'danbooru'
                        ? 'Danbooru'
                        : booruDefaultSource === 'gelbooru'
                          ? 'Gelbooru'
                          : booruDefaultSource === 'safebooru'
                            ? 'Safebooru'
                            : booruDefaultSource === 'aitag'
                              ? 'AI TAG'
                              : booruDefaultSource
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup class="max-h-40 overflow-y-auto">
                    <SelectItem value="danbooru">Danbooru</SelectItem>
                    <SelectItem value="gelbooru">Gelbooru</SelectItem>
                    <SelectItem value="safebooru">Safebooru</SelectItem>
                    <SelectItem value="aitag">AI TAG</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div
              class="border-border/80 bg-muted/20 flex flex-col gap-3 rounded-lg border p-4"
            >
              <div>
                <Label class="text-foreground text-xs font-semibold">
                  Network & Storage Cache
                </Label>
                <p class="text-muted-foreground text-xs">
                  Shared media proxy cache parameters
                </p>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <Field class="gap-1.5">
                  <FieldLabel class="text-xs">Timeout (seconds)</FieldLabel>
                  <Input
                    v-model="booruTimeout"
                    type="number"
                    min="3"
                    max="300"
                    :disabled="!booruAvailable"
                    class="font-mono text-xs"
                  />
                </Field>
                <Field class="gap-1.5">
                  <FieldLabel class="text-xs">Cache Budget (MiB)</FieldLabel>
                  <Input
                    v-model="booruCacheBudget"
                    type="number"
                    min="128"
                    max="32768"
                    :disabled="!booruAvailable"
                    class="font-mono text-xs"
                  />
                </Field>
              </div>
              <div class="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  :disabled="!booruAvailable"
                  class="border-border bg-secondary hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 text-xs font-medium"
                  @click="clearGalleryCache"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                  <span>Clear Cache</span>
                </Button>
                <span
                  v-if="booruCacheMessage"
                  class="font-mono text-xs text-emerald-400"
                >
                  {{ booruCacheMessage }}
                </span>
              </div>
            </div>
          </div>

          <!-- Tag Filtering & Blacklist -->
          <div
            class="grid grid-cols-1 gap-4 lg:grid-cols-2"
            :class="{ 'pointer-events-none opacity-50': !booruAvailable }"
          >
            <Field class="gap-1.5">
              <FieldLabel class="text-foreground text-xs font-semibold">
                Content Blacklist
              </FieldLabel>
              <Textarea
                v-model="booruBlacklist"
                :disabled="!booruAvailable"
                rows="3"
                placeholder="e.g. loli, shota, gore"
                class="border-border bg-secondary/50 font-mono text-xs"
              />
              <FieldDescription class="text-xs">
                Posts containing any of these tags are completely hidden from
                results.
              </FieldDescription>
            </Field>

            <Field class="gap-1.5">
              <FieldLabel class="text-foreground text-xs font-semibold">
                Prompt Output Filter
              </FieldLabel>
              <Textarea
                v-model="booruOutputFilterTags"
                :disabled="!booruAvailable"
                rows="3"
                placeholder="e.g. watermark, signature, blurry"
                class="border-border bg-secondary/50 font-mono text-xs"
              />
              <FieldDescription class="text-xs">
                Tags remain searchable but are stripped when copying generated
                prompts.
              </FieldDescription>
            </Field>
          </div>

          <!-- Prompt Defaults & Category Toggles -->
          <div
            class="border-border/80 bg-muted/20 flex flex-col gap-3.5 rounded-lg border p-4"
            :class="{ 'pointer-events-none opacity-50': !booruAvailable }"
          >
            <div>
              <Label class="text-foreground text-xs font-semibold">
                Prompt Extraction Defaults
              </Label>
              <p class="text-muted-foreground text-xs">
                Select which tag categories are included when copying a post
                prompt
              </p>
            </div>

            <div class="flex flex-wrap gap-2">
              <button
                v-for="category in BOORU_PROMPT_CATEGORIES"
                :key="category"
                type="button"
                :disabled="!booruAvailable"
                class="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-all"
                :class="
                  booruPromptCategories.includes(category)
                    ? 'border-primary/50 bg-primary/15 text-primary shadow-xs'
                    : 'border-border bg-secondary/50 text-muted-foreground hover:text-foreground'
                "
                @click="togglePromptCategory(category)"
              >
                <Tag class="h-3 w-3" />
                <span>{{ category }}</span>
              </button>
            </div>

            <div class="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
              <div
                class="border-border/60 bg-card/60 flex items-center justify-between rounded-lg border p-2.5"
              >
                <span class="text-foreground text-xs font-medium">
                  Replace underscores with spaces
                </span>
                <Switch
                  v-model="booruReplaceUnderscores"
                  :disabled="!booruAvailable"
                />
              </div>
              <div
                class="border-border/60 bg-card/60 flex items-center justify-between rounded-lg border p-2.5"
              >
                <span class="text-foreground text-xs font-medium">
                  Escape prompt parentheses
                </span>
                <Switch
                  v-model="booruEscapeParentheses"
                  :disabled="!booruAvailable"
                />
              </div>
            </div>
          </div>

          <!-- Provider API Accounts -->
          <div
            class="border-border/80 flex items-center justify-between border-t pt-3"
          >
            <span
              class="text-muted-foreground text-xs font-bold tracking-wider uppercase"
            >
              Provider API Credentials
            </span>
            <span class="text-muted-foreground text-xs">
              Credentials are encrypted and stored locally by the custom node
            </span>
          </div>

          <div
            class="grid grid-cols-1 gap-4 lg:grid-cols-2"
            :class="{ 'pointer-events-none opacity-50': !booruAvailable }"
          >
            <!-- Danbooru Account Card -->
            <div
              class="border-border/80 bg-muted/20 flex flex-col gap-3 rounded-lg border p-4 shadow-2xs"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <KeyRound class="text-primary h-4 w-4" />
                  <div>
                    <Label class="text-foreground text-xs font-semibold">
                      Danbooru
                    </Label>
                    <p class="text-muted-foreground text-xs">
                      Username & API Key
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  :class="
                    danbooruConfigured
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : 'border-border text-muted-foreground'
                  "
                  class="font-mono text-xs"
                >
                  <span
                    class="mr-1.5 h-1.5 w-1.5 rounded-full"
                    :class="
                      danbooruConfigured
                        ? 'bg-emerald-400'
                        : 'bg-muted-foreground'
                    "
                  />
                  {{ danbooruConfigured ? 'Configured' : 'Not configured' }}
                </Badge>
              </div>

              <Input
                v-model="booruCredentials.danbooru.username"
                :disabled="!booruAvailable"
                autocomplete="off"
                placeholder="Username"
                class="font-mono text-xs"
              />

              <div class="relative">
                <Input
                  v-model="booruCredentials.danbooru.apiKey"
                  :disabled="!booruAvailable"
                  :type="showDanbooruKey ? 'text' : 'password'"
                  autocomplete="new-password"
                  :placeholder="
                    danbooruConfigured
                      ? 'API Key (leave blank to keep current)'
                      : 'API Key'
                  "
                  class="pr-9 font-mono text-xs"
                />
                <button
                  type="button"
                  class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 p-1"
                  @click="showDanbooruKey = !showDanbooruKey"
                >
                  <EyeOff v-if="showDanbooruKey" class="h-3.5 w-3.5" />
                  <Eye v-else class="h-3.5 w-3.5" />
                </button>
              </div>

              <div class="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  :disabled="!booruAvailable || booruTesting !== null"
                  class="border-border bg-secondary text-xs font-medium"
                  @click="testBooruAccount('danbooru')"
                >
                  <Loader2
                    v-if="booruTesting === 'danbooru'"
                    class="h-3.5 w-3.5 animate-spin"
                  />
                  <Wifi v-else class="h-3.5 w-3.5" />
                  <span>Test Account</span>
                </Button>

                <p
                  v-if="booruResult?.source === 'danbooru'"
                  class="text-xs font-medium"
                  :class="
                    booruResult.ok ? 'text-emerald-400' : 'text-destructive'
                  "
                >
                  {{ booruResult.message }}
                </p>
              </div>
            </div>

            <!-- Gelbooru Account Card -->
            <div
              class="border-border/80 bg-muted/20 flex flex-col gap-3 rounded-lg border p-4 shadow-2xs"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <KeyRound class="text-primary h-4 w-4" />
                  <div>
                    <Label class="text-foreground text-xs font-semibold">
                      Gelbooru
                    </Label>
                    <p class="text-muted-foreground text-xs">
                      User ID & API Key
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  :class="
                    gelbooruConfigured
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : 'border-border text-muted-foreground'
                  "
                  class="font-mono text-xs"
                >
                  <span
                    class="mr-1.5 h-1.5 w-1.5 rounded-full"
                    :class="
                      gelbooruConfigured
                        ? 'bg-emerald-400'
                        : 'bg-muted-foreground'
                    "
                  />
                  {{ gelbooruConfigured ? 'Configured' : 'Not configured' }}
                </Badge>
              </div>

              <Input
                v-model="booruCredentials.gelbooru.userId"
                :disabled="!booruAvailable"
                autocomplete="off"
                placeholder="User ID (numeric)"
                class="font-mono text-xs"
              />

              <div class="relative">
                <Input
                  v-model="booruCredentials.gelbooru.apiKey"
                  :disabled="!booruAvailable"
                  :type="showGelbooruKey ? 'text' : 'password'"
                  autocomplete="new-password"
                  :placeholder="
                    gelbooruConfigured
                      ? 'API Key (leave blank to keep current)'
                      : 'API Key or copied account fragment'
                  "
                  class="pr-9 font-mono text-xs"
                />
                <button
                  type="button"
                  class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 p-1"
                  @click="showGelbooruKey = !showGelbooruKey"
                >
                  <EyeOff v-if="showGelbooruKey" class="h-3.5 w-3.5" />
                  <Eye v-else class="h-3.5 w-3.5" />
                </button>
              </div>

              <div class="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  :disabled="!booruAvailable || booruTesting !== null"
                  class="border-border bg-secondary text-xs font-medium"
                  @click="testBooruAccount('gelbooru')"
                >
                  <Loader2
                    v-if="booruTesting === 'gelbooru'"
                    class="h-3.5 w-3.5 animate-spin"
                  />
                  <Wifi v-else class="h-3.5 w-3.5" />
                  <span>Test Account</span>
                </Button>

                <p
                  v-if="booruResult?.source === 'gelbooru'"
                  class="text-xs font-medium"
                  :class="
                    booruResult.ok ? 'text-emerald-400' : 'text-destructive'
                  "
                >
                  {{ booruResult.message }}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          class="border-border/80 bg-card/80 flex flex-col gap-4 rounded-xl border p-5 shadow-xs backdrop-blur-xs"
        >
          <div
            class="border-border/80 flex items-center justify-between gap-4 border-b pb-3"
          >
            <div class="flex items-center gap-2.5">
              <div
                class="border-border bg-secondary flex h-7 w-7 items-center justify-center rounded-md border text-orange-400"
              >
                <KeyRound class="h-3.5 w-3.5" />
              </div>
              <div>
                <span class="text-xs font-bold tracking-wider uppercase">
                  Civitai API
                </span>
                <p class="text-muted-foreground text-xs">
                  Authentication for gated model downloads
                </p>
              </div>
            </div>
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
          </div>

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
            <FieldDescription class="text-xs">
              Stored locally in ComfyGUI settings and sent only to Civitai.
            </FieldDescription>
          </Field>

          <div
            class="border-border/60 bg-muted/20 flex items-center justify-between rounded-lg border p-3"
          >
            <div class="flex flex-col gap-0.5">
              <Label
                for="civitai-nsfw-switch"
                class="text-foreground flex cursor-pointer items-center text-xs font-medium"
              >
                Enable NSFW Content
              </Label>
              <p class="text-muted-foreground text-xs">
                Allow mature and adult (18+) models to be included in Civitai
                search results
              </p>
            </div>
            <Switch id="civitai-nsfw-switch" v-model="civitaiNsfw" />
          </div>
        </section>

        <!-- AI Assistant (OpenRouter) Configuration Section -->
        <section
          class="border-border/80 bg-card/80 flex flex-col gap-4 rounded-xl border p-5 shadow-xs backdrop-blur-xs"
        >
          <div
            class="border-border/80 flex items-center justify-between border-b pb-3"
          >
            <div class="flex items-center gap-2.5">
              <div
                class="border-border bg-secondary text-primary flex h-7 w-7 items-center justify-center rounded-md border"
              >
                <Sparkles class="h-3.5 w-3.5" />
              </div>
              <div>
                <span class="text-xs font-bold tracking-wider uppercase">
                  AI Assistant (OpenRouter)
                </span>
                <p class="text-muted-foreground text-xs">
                  Prompt engineering, vision multimodal analysis, and agentic
                  studio control
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="text-xs"
              @click="openUrl('https://openrouter.ai/settings/keys')"
            >
              <ExternalLink class="h-3.5 w-3.5" />
              Get OpenRouter Key
            </Button>
          </div>

          <!-- OpenRouter API Key Input -->
          <Field class="gap-1.5">
            <div class="flex items-center justify-between">
              <FieldLabel class="text-xs">OpenRouter API Key</FieldLabel>
              <button
                type="button"
                :disabled="
                  isTestingAi || (!openRouterApiKey && !hasOpenRouterApiKey)
                "
                class="text-primary flex cursor-pointer items-center gap-1 text-xs hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                @click="testOpenRouterConnection"
              >
                <Loader2 v-if="isTestingAi" class="h-3 w-3 animate-spin" />
                <Wifi v-else class="h-3 w-3" />
                <span>Test Connection</span>
              </button>
            </div>
            <div class="relative">
              <Input
                v-model="openRouterApiKey"
                type="password"
                autocomplete="new-password"
                :placeholder="
                  hasOpenRouterApiKey ? 'Saved' : 'Enter OpenRouter API key'
                "
                class="pr-10 font-mono text-xs"
                @keydown.enter="autosaveAiSettings.flush()"
                @blur="autosaveAiSettings.flush()"
              />
              <button
                v-if="hasOpenRouterApiKey && !openRouterApiKey"
                type="button"
                class="text-muted-foreground hover:text-destructive absolute top-1/2 right-2.5 -translate-y-1/2 p-1 transition-colors"
                title="Remove saved OpenRouter API key"
                @click="clearOpenRouterApiKey"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
            <div
              v-if="aiTestResult"
              class="text-xs"
              :class="aiTestResult.ok ? 'text-emerald-500' : 'text-destructive'"
            >
              {{ aiTestResult.message }}
            </div>
            <FieldDescription class="text-xs">
              Saved locally to ai_config.dat and sent directly to OpenRouter via
              encrypted HTTPS.
            </FieldDescription>
          </Field>

          <!-- Default Model Selector with Search -->
          <Field class="gap-1.5">
            <FieldLabel class="text-xs">Default Model</FieldLabel>
            <AiModelSelector
              :model-value="aiStore.config.selectedModel"
              @change="
                (val) => {
                  aiStore.config.selectedModel = val;
                  void aiStore.saveConfig();
                  showSaved();
                }
              "
            />
          </Field>

          <!-- Provider Routing Override (Custom Provider) -->
          <Field class="gap-1.5">
            <FieldLabel class="text-xs">
              Provider Override (Custom Provider)
            </FieldLabel>
            <Input
              v-model="aiStore.config.providerOverride"
              placeholder="Enter your provider"
              class="h-8 font-mono text-xs"
              @change="
                () => {
                  void aiStore.saveConfig();
                  showSaved();
                }
              "
            />
            <FieldDescription class="text-xs">
              Specify custom provider slug(s) (comma-separated, in priority
              order) to route requests via OpenRouter. Leave blank for default
              OpenRouter routing.
            </FieldDescription>
          </Field>

          <!-- Allow Provider Fallbacks -->
          <div
            class="border-border/60 bg-muted/20 flex items-center justify-between rounded-lg border p-3"
          >
            <div class="flex flex-col gap-0.5">
              <Label
                for="ai-provider-fallbacks-switch"
                class="text-foreground flex cursor-pointer items-center text-xs font-medium"
              >
                Allow Provider Fallbacks
              </Label>
              <p class="text-muted-foreground text-xs">
                When enabled, OpenRouter can fall back to other upstream hosts
                if your specified providers are temporarily unavailable.
              </p>
            </div>
            <Switch
              id="ai-provider-fallbacks-switch"
              :checked="aiStore.config.allowProviderFallbacks ?? true"
              @update:checked="
                (val: boolean) => {
                  aiStore.config.allowProviderFallbacks = val;
                  void aiStore.saveConfig();
                  showSaved();
                }
              "
            />
          </div>

          <!-- Auto-Apply Toggle Setting -->
          <div
            class="border-border/60 bg-muted/20 flex items-center justify-between rounded-lg border p-3"
          >
            <div class="flex flex-col gap-0.5">
              <Label
                for="ai-auto-apply-switch"
                class="text-foreground flex cursor-pointer items-center text-xs font-medium"
              >
                Auto-Apply Agentic Actions
              </Label>
              <p class="text-muted-foreground text-xs">
                When enabled, the assistant will automatically inject prompts
                and trigger generation without requiring manual confirmation
                cards.
              </p>
            </div>
            <Switch
              id="ai-auto-apply-switch"
              :checked="aiStore.config.autoApply"
              @update:checked="
                (val: boolean) => {
                  aiStore.config.autoApply = val;
                  void aiStore.saveConfig();
                  showSaved();
                }
              "
            />
          </div>

          <!-- Chatbot Assistant Custom Instructions -->
          <Field class="gap-1.5">
            <FieldLabel class="text-xs">
              Chatbot Assistant Instructions (Optional)
            </FieldLabel>
            <Textarea
              :model-value="aiStore.config.customSystemPrompt"
              rows="3"
              placeholder="Enter custom instructions for the AI Chatbot Assistant..."
              class="resize-y font-mono text-xs leading-relaxed"
              @update:model-value="
                (val) => {
                  aiStore.config.customSystemPrompt = String(val);
                  void aiStore.saveConfig();
                }
              "
            />
            <FieldDescription class="text-xs">
              Custom instructions specifically for the AI Chatbot Assistant
              drawer (conversational tone, agentic actions, tool suggestions).
            </FieldDescription>
          </Field>

          <!-- Prompt Enhancer Custom Instructions -->
          <Field class="gap-1.5">
            <FieldLabel class="text-xs">
              Prompt Enhancer Instructions (Optional)
            </FieldLabel>
            <Textarea
              :model-value="aiStore.config.enhancerSystemPrompt"
              rows="3"
              placeholder="Enter custom guidelines for the Prompt Enhancer modal..."
              class="resize-y font-mono text-xs leading-relaxed"
              @update:model-value="
                (val) => {
                  aiStore.config.enhancerSystemPrompt = String(val);
                  void aiStore.saveConfig();
                }
              "
            />
            <FieldDescription class="text-xs">
              Custom guidelines exclusively for the inline Prompt Enhancer modal
              (tag order rules, formatting preferences, vocabulary overrides).
            </FieldDescription>
          </Field>
        </section>

        <section
          class="border-border/80 bg-card/80 flex flex-col gap-4 rounded-xl border p-5 shadow-xs backdrop-blur-xs"
        >
          <div class="border-border/80 flex items-center gap-2.5 border-b pb-3">
            <div
              class="border-border bg-secondary flex h-7 w-7 items-center justify-center rounded-md border text-violet-400"
            >
              <Info class="h-3.5 w-3.5" />
            </div>
            <div>
              <span class="text-xs font-bold tracking-wider uppercase">
                About ComfyGUI
              </span>
              <p class="text-muted-foreground text-xs">
                Application version and release updates
              </p>
            </div>
          </div>

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
        </section>
      </div>
    </div>

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
          <FieldDescription>
            Only install repositories you trust. Python packages can execute
            code on this device.
          </FieldDescription>
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
            <Download v-else class="h-3.5 w-3.5" />
            {{ isInstallingCustomNode ? 'Installing…' : 'Install' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
