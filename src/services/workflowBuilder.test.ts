import assert from 'node:assert/strict';
import type { WorkflowState } from '../types/workflow';
import { buildKDXzPrompt } from './workflowBuilder';

const state: WorkflowState = {
  positivePrompt: 'test',
  negativePrompt: 'bad',
  models: {
    unetName: 'anima.safetensors',
    clipName: 'clip.safetensors',
    vaeName: 'vae.safetensors',
    shift: 2.5
  },
  loras: [],
  sampler: {
    steps: 20,
    cfg: 4,
    samplerName: 'euler',
    scheduler: 'simple',
    denoise: 0.7,
    seed: 1,
    randomizeSeed: false,
    variationEnabled: false,
    variationSeed: 2,
    variationStrength: 0.35
  },
  imageInput: {
    mode: 'img2img',
    imageName: 'input.png',
    imageWidth: 512,
    imageHeight: 768,
    maskName: '',
    modelPatch: 'patch.safetensors',
    llliteStrength: 1,
    llliteStart: 0,
    llliteEnd: 1,
    turboEnabled: true,
    turboLora: 'turbo.safetensors',
    inpaintSteps: 30,
    inpaintCfg: 4,
    turboSteps: 8,
    turboCfg: 1
  },
  resolution: {
    preset: 'Custom',
    batchSize: 1,
    width: 512,
    height: 768,
    isCustom: true
  },
  postfx: {
    enabled: false,
    styleStage: {
      enabled: false,
      vignetteStrength: 0,
      vignetteSoftness: 0.5,
      filmGrain: 0,
      bloomStrength: 0,
      bloomRadius: 1.5,
      bloomThreshold: 0.7,
      chromaticAberration: 0
    },
    adjustStage: {
      enabled: false,
      brightness: 0,
      contrast: 1,
      saturation: 1,
      sharpness: 0
    },
    upscale: { enabled: false, upscaleModel: '', upscaleBy: 1 }
  },
  faceDetailer: {
    enabled: false,
    bboxModel: 'bbox/face.pt',
    segmModel: '',
    steps: 20,
    turboSteps: 8,
    cfg: 4,
    samplerName: 'euler',
    scheduler: 'simple',
    bboxThreshold: 0.5,
    denoise: 0.31,
    feather: 5,
    guideSize: 512,
    turboEnabled: false,
    turboLora: 'turbo.safetensors'
  }
};

const img2img = buildKDXzPrompt(state) as Record<
  string,
  { class_type: string }
>;
assert.equal(img2img['30'].class_type, 'LoadImage');
assert.equal(img2img['19'].class_type, 'VAEEncode');
assert.equal(img2img['9'].class_type, 'KSampler');

state.sampler.variationEnabled = true;
const variation = buildKDXzPrompt(state) as Record<
  string,
  { class_type: string; inputs: Record<string, unknown> }
>;
assert.equal(variation['9'].class_type, 'YEKSampler');
assert.equal(variation['9'].inputs.variation_seed, 2);
assert.equal(variation['9'].inputs.variation_strength, 0.35);

state.faceDetailer.enabled = true;
state.faceDetailer.turboEnabled = true;
state.positivePrompt = '';
const detailed = buildKDXzPrompt(state) as Record<
  string,
  { class_type: string; inputs: Record<string, unknown> }
>;
assert.equal(detailed['face_detailer_apply'].class_type, 'FaceDetailer');
assert.equal(detailed['face_detailer_turbo'].class_type, 'YELoadLoraModel');
assert.equal(detailed['face_detailer_apply'].inputs.steps, 8);
assert.equal(detailed['face_detailer_apply'].inputs.cfg, 1);
assert.deepEqual(detailed['face_detailer_apply'].inputs.positive, [
  'face_detailer_positive_zero',
  0
]);
assert.equal(detailed['face_detailer_segm'], undefined);

state.imageInput.mode = 'inpaint';
state.imageInput.maskName = 'mask.png';
const inpaint = buildKDXzPrompt(state) as Record<
  string,
  { class_type: string; inputs: Record<string, unknown> }
>;
assert.equal(inpaint['31'].class_type, 'LoadImageMask');
assert.equal(inpaint['33'].class_type, 'AnimaLLLiteApply');
assert.equal(inpaint['34'].class_type, 'LoraLoaderModelOnly');
assert.equal(inpaint['21'].class_type, 'YEClipTextEncodePrompt');
assert.equal(inpaint['17'].class_type, 'YEClipTextEncodePrompt');
assert.equal(inpaint['9'].class_type, 'YEKSampler');
assert.equal(inpaint['19'].class_type, 'EmptyLatentImage');
assert.deepEqual(inpaint['19'].inputs, {
  width: 512,
  height: 768,
  batch_size: 1
});
assert.deepEqual(inpaint['9'].inputs.model, ['34', 0]);
assert.equal(inpaint['9'].inputs.steps, 8);
assert.equal(inpaint['9'].inputs.cfg, 1);
assert.equal(inpaint['9'].inputs.denoise, 1);
assert.equal(inpaint['13'], undefined);

state.imageInput.turboEnabled = false;
const standardInpaint = buildKDXzPrompt(state) as Record<
  string,
  { inputs: Record<string, unknown> }
>;
assert.equal(standardInpaint['34'], undefined);
assert.deepEqual(standardInpaint['9'].inputs.model, ['33', 0]);
assert.equal(standardInpaint['9'].inputs.steps, 30);
assert.equal(standardInpaint['9'].inputs.cfg, 4);
