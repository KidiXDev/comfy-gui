import type { FaceDetailerSettings } from '../types/workflow';

export type WorkflowNodeRef = [string, number];

interface FaceDetailerSources {
  image: WorkflowNodeRef;
  model: WorkflowNodeRef;
  clip: WorkflowNodeRef;
  vae: WorkflowNodeRef;
  positive: WorkflowNodeRef;
  negative: WorkflowNodeRef;
  seed: number;
}

export function appendFaceDetailerStage(
  prompt: Record<string, unknown>,
  settings: FaceDetailerSettings,
  sources: FaceDetailerSources,
  prefix = 'face_detailer'
): WorkflowNodeRef {
  if (!settings.bboxModel) {
    throw new Error('Select a required bbox detector for Face Detailer.');
  }

  const bboxNode = `${prefix}_bbox`;
  const segmNode = `${prefix}_segm`;
  const turboNode = `${prefix}_turbo`;
  const detailerNode = `${prefix}_apply`;

  prompt[bboxNode] = {
    inputs: { model_name: settings.bboxModel },
    class_type: 'UltralyticsDetectorProvider',
    _meta: { title: 'Load Face BBox Detector' }
  };

  if (settings.segmModel) {
    prompt[segmNode] = {
      inputs: { model_name: settings.segmModel },
      class_type: 'UltralyticsDetectorProvider',
      _meta: { title: 'Load Optional Face Segmentation Detector' }
    };
  }

  let modelSource = sources.model;
  if (settings.turboEnabled) {
    if (!settings.turboLora) {
      throw new Error('Select a Turbo LoRA for Face Detailer.');
    }
    prompt[turboNode] = {
      inputs: {
        lora_name: settings.turboLora,
        strength_model: 1,
        model: sources.model
      },
      class_type: 'YELoadLoraModel',
      _meta: { title: 'Load Face Detailer Turbo LoRA' }
    };
    modelSource = [turboNode, 0];
  }

  const inputs: Record<string, unknown> = {
    guide_size: settings.guideSize,
    guide_size_for: true,
    max_size: 1024,
    seed: Math.max(0, Math.trunc(sources.seed)),
    steps: settings.turboEnabled ? settings.turboSteps : settings.steps,
    cfg: settings.turboEnabled ? 1 : settings.cfg,
    sampler_name: settings.samplerName,
    scheduler: settings.scheduler,
    denoise: settings.denoise,
    feather: settings.feather,
    noise_mask: true,
    force_inpaint: true,
    bbox_threshold: settings.bboxThreshold,
    bbox_dilation: 10,
    bbox_crop_factor: 3,
    sam_detection_hint: 'center-1',
    sam_dilation: 0,
    sam_threshold: 0.93,
    sam_bbox_expansion: 0,
    sam_mask_hint_threshold: 0.7,
    sam_mask_hint_use_negative: 'False',
    drop_size: 10,
    wildcard: '',
    cycle: 1,
    inpaint_model: false,
    noise_mask_feather: 20,
    tiled_encode: false,
    tiled_decode: false,
    image: sources.image,
    model: modelSource,
    clip: sources.clip,
    vae: sources.vae,
    positive: sources.positive,
    negative: sources.negative,
    bbox_detector: [bboxNode, 0]
  };
  if (settings.segmModel) inputs.segm_detector_opt = [segmNode, 1];

  prompt[detailerNode] = {
    inputs,
    class_type: 'FaceDetailer',
    _meta: { title: 'Face Detailer' }
  };
  return [detailerNode, 0];
}
