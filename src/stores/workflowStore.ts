import { useDebounceFn } from '@vueuse/core';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { loadAppData, saveAppData } from '../services/appStorage';
import type {
  FaceDetailerSettings,
  ImageInputSettings,
  LoraItem,
  LoraPreset,
  ModelSettings,
  PostFxSettings,
  ResolutionSettings,
  SamplerSettings,
  WorkflowState
} from '../types/workflow';

const DEFAULT_POSITIVE_PROMPT =
  'moetic, cute, masterpiece, best quality, newest, score_9, score_8, score_7, film grain, very aesthetic, cinematic Lighting, light particles.,\n\n1girl, purple eyes, very long hair, cat ears, side ponytail, open mouth, layered clothes, gold embroidery, ribbon, off-shoulder, detached sleeves, hair ornament, crystal necklace, dynamic pose, virtual youtuber, blush.,\n\noutdoors, high contrast, depth of field, soft shadows, volumetric lighting, colorful, clean composition, vivid scenery, intricate details, cinematic lighting.,\n\nThe image is rendered in a highly detailed, polished illustration style.';

const DEFAULT_NEGATIVE_PROMPT =
  'worst quality, bad anatomy, watermark, logo, signature, low quality, artist name, blurry, extra fingers, bad hands, bad anatomy, duplicate, deformed face, poorly drawn eyes, watermark, ugly, mature female, adult face, muscular, thick, deformed, mosaic, tall female, censored, 4koma, comic, greyscale, jpeg artifacts, monochrome';

const DEFAULT_MODELS: ModelSettings = {
  unetName: 'animeBulldozer_anima.safetensors',
  clipName: 'qwen_3_06b_base.safetensors',
  vaeName: 'qwenimagevae_v7.safetensors',
  shift: 2.5
};

const DEFAULT_LORAS: Array<{
  name: string;
  strength: number;
  enabled: boolean;
}> = [
  { name: 'ep2-nts.safetensors', strength: 1.0, enabled: true },
  {
    name: 'anima-base-1-masterpiece-v51.safetensors',
    strength: 0.3,
    enabled: true
  },
  { name: 'ep18-ogipote.safetensors', strength: 0.4, enabled: true },
  {
    name: 'Anima_colorfix_v1_by_Volnovik.safetensors',
    strength: 0.5,
    enabled: true
  },
  {
    name: 'chenbin-anima-preview-000081.safetensors',
    strength: 0.2,
    enabled: true
  },
  {
    name: '2D_aesthetic_EX_base-v1.0_rank_64_fp16_00001_.safetensors',
    strength: 0.25,
    enabled: true
  }
];

const DEFAULT_SAMPLER: SamplerSettings = {
  steps: 20,
  cfg: 4.0,
  samplerName: 'er_sde',
  scheduler: 'simple',
  denoise: 1.0,
  seed: -1,
  randomizeSeed: true,
  variationEnabled: false,
  variationSeed: 0,
  variationStrength: 0.35
};

const DEFAULT_RESOLUTION: ResolutionSettings = {
  preset: '832 x 1216 (13:19 Portrait)',
  batchSize: 1,
  width: 832,
  height: 1216,
  isCustom: false
};

const DEFAULT_IMAGE_INPUT: ImageInputSettings = {
  mode: 'text2img',
  imageName: '',
  imageWidth: 0,
  imageHeight: 0,
  maskName: '',
  modelPatch: 'anima-lllite-inpainting-v2.safetensors',
  llliteStrength: 1,
  llliteStart: 0,
  llliteEnd: 1,
  turboEnabled: true,
  turboLora: 'anima-turbo-lora-v0.2.safetensors',
  inpaintSteps: 30,
  inpaintCfg: 4,
  turboSteps: 8,
  turboCfg: 1
};

const DEFAULT_POSTFX: PostFxSettings = {
  enabled: true,
  styleStage: {
    enabled: true,
    vignetteStrength: 0.1,
    vignetteSoftness: 0.5,
    filmGrain: 0,
    bloomStrength: 0,
    bloomRadius: 1.5,
    bloomThreshold: 0.7,
    chromaticAberration: 0
  },
  adjustStage: {
    enabled: true,
    brightness: 0,
    contrast: 1.0,
    saturation: 1.05,
    sharpness: 0.05
  },
  upscale: {
    enabled: true,
    upscaleModel: '2x-AnimeSharpV4-Fast-RCAN-PU.safetensors',
    upscaleBy: 2.0
  }
};

const DEFAULT_FACE_DETAILER: FaceDetailerSettings = {
  enabled: false,
  bboxModel: 'bbox/face_yolov8m.pt',
  segmModel: '',
  steps: 20,
  turboSteps: 8,
  cfg: 4,
  samplerName: 'er_sde',
  scheduler: 'simple',
  bboxThreshold: 0.5,
  denoise: 0.31,
  feather: 5,
  guideSize: 512,
  turboEnabled: false,
  turboLora: 'anima-turbo-lora-v0.2.safetensors'
};

const SESSION_STORAGE_KEY = 'workflow_session_state';
const PRESETS_STORAGE_KEY = 'lora_presets';

export const useWorkflowStore = defineStore('workflow', () => {
  const isLoaded = ref(false);

  const positivePrompt = ref(DEFAULT_POSITIVE_PROMPT);
  const negativePrompt = ref(DEFAULT_NEGATIVE_PROMPT);
  const models = ref<ModelSettings>({ ...DEFAULT_MODELS });
  const loras = ref<LoraItem[]>(
    DEFAULT_LORAS.map((l, index) => ({
      id: `lora-${index}-${Date.now()}`,
      name: l.name,
      strength: l.strength,
      enabled: l.enabled
    }))
  );
  const sampler = ref<SamplerSettings>({ ...DEFAULT_SAMPLER });
  const imageInput = ref<ImageInputSettings>({ ...DEFAULT_IMAGE_INPUT });
  const resolution = ref<ResolutionSettings>({ ...DEFAULT_RESOLUTION });
  const postfx = ref<PostFxSettings>(
    JSON.parse(JSON.stringify(DEFAULT_POSTFX))
  );
  const faceDetailer = ref<FaceDetailerSettings>({ ...DEFAULT_FACE_DETAILER });

  const customPresets = ref<LoraPreset[]>([]);

  async function loadPresets() {
    try {
      const saved = await loadAppData<LoraPreset[]>(PRESETS_STORAGE_KEY);
      if (saved && Array.isArray(saved)) {
        customPresets.value = saved;
      }
    } catch {
      // ignore parse errors
    }
  }

  async function savePresets() {
    await saveAppData(PRESETS_STORAGE_KEY, customPresets.value);
  }

  async function loadSession() {
    try {
      const saved =
        await loadAppData<Partial<WorkflowState>>(SESSION_STORAGE_KEY);
      if (saved) {
        if (typeof saved.positivePrompt === 'string') {
          positivePrompt.value = saved.positivePrompt;
        }
        if (typeof saved.negativePrompt === 'string') {
          negativePrompt.value = saved.negativePrompt;
        }
        if (saved.models && typeof saved.models === 'object') {
          models.value = { ...DEFAULT_MODELS, ...saved.models };
        }
        if (Array.isArray(saved.loras)) {
          loras.value = saved.loras.map((l, index) => ({
            id: l.id || `lora-${index}-${Date.now()}`,
            name: l.name ?? '',
            strength: typeof l.strength === 'number' ? l.strength : 1.0,
            enabled: typeof l.enabled === 'boolean' ? l.enabled : true
          }));
        }
        if (saved.sampler && typeof saved.sampler === 'object') {
          sampler.value = { ...DEFAULT_SAMPLER, ...saved.sampler };
          if (sampler.value.randomizeSeed || sampler.value.seed === -1) {
            sampler.value.seed = -1;
            sampler.value.randomizeSeed = true;
          }
        }
        if (saved.resolution && typeof saved.resolution === 'object') {
          resolution.value = { ...DEFAULT_RESOLUTION, ...saved.resolution };
        }
        if (saved.imageInput && typeof saved.imageInput === 'object') {
          imageInput.value = { ...DEFAULT_IMAGE_INPUT, ...saved.imageInput };
        }
        if (saved.postfx && typeof saved.postfx === 'object') {
          postfx.value = {
            ...DEFAULT_POSTFX,
            ...saved.postfx,
            styleStage: {
              ...DEFAULT_POSTFX.styleStage,
              ...saved.postfx.styleStage
            },
            adjustStage: {
              ...DEFAULT_POSTFX.adjustStage,
              ...saved.postfx.adjustStage
            },
            upscale: {
              ...DEFAULT_POSTFX.upscale,
              ...saved.postfx.upscale
            }
          };
        }
        if (saved.faceDetailer && typeof saved.faceDetailer === 'object') {
          faceDetailer.value = {
            ...DEFAULT_FACE_DETAILER,
            ...saved.faceDetailer
          };
        }
      }
    } catch (err) {
      console.warn('Failed to load workflow session state:', err);
    } finally {
      isLoaded.value = true;
    }
  }

  async function saveSession() {
    if (!isLoaded.value) return;
    const state = getFullWorkflowState();
    try {
      await saveAppData(SESSION_STORAGE_KEY, state);
    } catch (err) {
      console.error('Failed to save workflow session state:', err);
    }
  }

  const debouncedSaveSession = useDebounceFn(() => {
    void saveSession();
  }, 400);

  // Auto-save whenever generator parameters are adjusted by the user
  watch(
    [
      positivePrompt,
      negativePrompt,
      models,
      loras,
      sampler,
      imageInput,
      resolution,
      postfx,
      faceDetailer
    ],
    () => {
      if (isLoaded.value) {
        debouncedSaveSession();
      }
    },
    { deep: true }
  );

  // Ensure synchronous or immediate flush on window unload / exit
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      void saveSession();
    });
  }

  function addLora(name = '', strength = 1.0) {
    loras.value.push({
      id: `lora-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      strength,
      enabled: true
    });
  }

  function removeLora(id: string) {
    loras.value = loras.value.filter((l) => l.id !== id);
  }

  function moveLora(index: number, direction: 'up' | 'down') {
    if (direction === 'up' && index > 0) {
      const item = loras.value.splice(index, 1)[0];
      loras.value.splice(index - 1, 0, item);
    } else if (direction === 'down' && index < loras.value.length - 1) {
      const item = loras.value.splice(index, 1)[0];
      loras.value.splice(index + 1, 0, item);
    }
  }

  function loadKdxzPreset() {
    loras.value = DEFAULT_LORAS.map((l, index) => ({
      id: `lora-${index}-${Date.now()}`,
      name: l.name,
      strength: l.strength,
      enabled: l.enabled
    }));
    void saveSession();
  }

  function saveCustomPreset(name: string) {
    if (!name.trim()) return;
    const newPreset: LoraPreset = {
      id: `preset-${Date.now()}`,
      name: name.trim(),
      loras: loras.value.map((l) => ({
        name: l.name,
        strength: l.strength,
        enabled: l.enabled
      }))
    };
    customPresets.value.push(newPreset);
    void savePresets();
  }

  function loadCustomPreset(presetId: string) {
    const preset = customPresets.value.find((p) => p.id === presetId);
    if (!preset) return;
    loras.value = preset.loras.map((l, index) => ({
      id: `lora-${index}-${Date.now()}`,
      name: l.name,
      strength: l.strength,
      enabled: l.enabled
    }));
  }

  function deleteCustomPreset(presetId: string) {
    customPresets.value = customPresets.value.filter((p) => p.id !== presetId);
    void savePresets();
  }

  function randomizeSeedValue() {
    sampler.value.seed = Math.floor(Math.random() * 9007199254740991);
    sampler.value.randomizeSeed = false;
  }

  function getFullWorkflowState(): WorkflowState {
    return {
      positivePrompt: positivePrompt.value,
      negativePrompt: negativePrompt.value,
      models: JSON.parse(JSON.stringify(models.value)),
      loras: JSON.parse(JSON.stringify(loras.value)),
      sampler: JSON.parse(JSON.stringify(sampler.value)),
      imageInput: JSON.parse(JSON.stringify(imageInput.value)),
      resolution: JSON.parse(JSON.stringify(resolution.value)),
      postfx: JSON.parse(JSON.stringify(postfx.value)),
      faceDetailer: JSON.parse(JSON.stringify(faceDetailer.value))
    };
  }

  function applyWorkflowState(state: WorkflowState) {
    positivePrompt.value = state.positivePrompt;
    negativePrompt.value = state.negativePrompt;
    models.value = JSON.parse(JSON.stringify(state.models));
    loras.value = JSON.parse(JSON.stringify(state.loras));
    sampler.value = {
      ...DEFAULT_SAMPLER,
      ...JSON.parse(JSON.stringify(state.sampler))
    };
    imageInput.value = {
      ...DEFAULT_IMAGE_INPUT,
      ...JSON.parse(JSON.stringify(state.imageInput || {}))
    };
    resolution.value = JSON.parse(JSON.stringify(state.resolution));
    postfx.value = JSON.parse(JSON.stringify(state.postfx));
    faceDetailer.value = {
      ...DEFAULT_FACE_DETAILER,
      ...JSON.parse(JSON.stringify(state.faceDetailer || {}))
    };
    void saveSession();
  }

  async function init() {
    await Promise.all([loadPresets(), loadSession()]);
  }

  void init();

  return {
    isLoaded,
    positivePrompt,
    negativePrompt,
    models,
    loras,
    sampler,
    imageInput,
    resolution,
    postfx,
    faceDetailer,
    customPresets,
    init,
    loadSession,
    saveSession,
    addLora,
    removeLora,
    moveLora,
    loadKdxzPreset,
    saveCustomPreset,
    loadCustomPreset,
    deleteCustomPreset,
    randomizeSeedValue,
    getFullWorkflowState,
    applyWorkflowState
  };
});
