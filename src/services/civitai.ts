import { invoke } from '@tauri-apps/api/core';

export interface CivitaiFile {
  id: number;
  name: string;
  sizeKB: number;
  type: string;
  primary?: boolean;
  downloadUrl?: string;
  metadata?: { format?: string; fp?: string; size?: string };
  pickleScanResult?: string;
  virusScanResult?: string;
}

export interface CivitaiImage {
  id?: number;
  url: string;
  width: number;
  height: number;
  type?: 'image' | 'video' | string;
  nsfw?: boolean | string;
  nsfwLevel?: number;
  meta?: Record<string, unknown> | null;
}

export function isVideoMedia(
  media?: CivitaiImage | null | { url?: string; type?: string }
): boolean {
  if (!media?.url) return false;
  if (media.type === 'video') return true;
  const cleanUrl = media.url.split('?')[0].toLowerCase();
  return (
    cleanUrl.endsWith('.mp4') ||
    cleanUrl.endsWith('.webm') ||
    cleanUrl.endsWith('.ogg') ||
    cleanUrl.endsWith('.mov') ||
    cleanUrl.endsWith('.mkv')
  );
}

export interface CivitaiVersion {
  id: number;
  name: string;
  description?: string;
  baseModel?: string;
  trainedWords?: string[];
  files: CivitaiFile[];
  images: CivitaiImage[];
  stats?: { downloadCount?: number; rating?: number; thumbsUpCount?: number };
}

export function getComfyTargetFolder(
  modelType: string,
  baseModel = '',
  fileType = ''
): string {
  const base = baseModel.toLowerCase();
  const file = fileType.toLowerCase();
  const isDiffusion =
    file.includes('diffusion') ||
    file.includes('unet') ||
    [
      'anima',
      'auraflow',
      'chroma',
      'cogvideox',
      'flux',
      'hidream',
      'hunyuan',
      'ltxv',
      'lumina',
      'mochi',
      'pixart',
      'qwen',
      'svd',
      'wan',
      'zimage'
    ].some((prefix) => base.startsWith(prefix));

  switch (modelType.toLowerCase()) {
    case 'checkpoint':
      return isDiffusion ? 'models/diffusion_models' : 'models/checkpoints';
    case 'unet':
      return 'models/diffusion_models';
    case 'textencoder':
    case 'clip':
      return 'models/text_encoders';
    case 'clipvision':
      return 'models/clip_vision';
    case 'lora':
    case 'locon':
    case 'dora':
      return 'models/loras';
    case 'vae':
      return 'models/vae';
    case 'textualinversion':
      return 'models/embeddings';
    case 'controlnet':
      return 'models/controlnet';
    case 'upscaler':
      return 'models/upscale_models';
    case 'hypernetwork':
      return 'models/hypernetworks';
    default:
      return 'models/other';
  }
}

export interface CivitaiModel {
  id: number;
  name: string;
  description?: string;
  type: string;
  nsfw: boolean;
  creator?: { username?: string };
  stats?: { downloadCount?: number; rating?: number; thumbsUpCount?: number };
  tags?: string[];
  modelVersions: CivitaiVersion[];
}

export interface CivitaiModelsResponse {
  items: CivitaiModel[];
  metadata: { nextCursor?: string };
}

export function normalizeModelFilename(path: string) {
  return path.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase() ?? '';
}

export function fetchCivitaiModels(options: {
  query: string;
  modelType: string;
  baseModel: string;
  sort: string;
  period: string;
  cursor?: string;
  apiKey: string;
  nsfw?: boolean;
}) {
  return invoke<CivitaiModelsResponse>('models', options);
}

export async function fetchCivitaiBaseModels() {
  const enums = await invoke<{ BaseModel: string[] }>('enums');
  return enums.BaseModel;
}
