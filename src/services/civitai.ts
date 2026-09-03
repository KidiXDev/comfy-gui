import { invoke } from '@tauri-apps/api/core';

export interface CivitaiFile {
  id: number;
  name: string;
  sizeKB: number;
  type: string;
  primary?: boolean;
  metadata?: { format?: string; fp?: string; size?: string };
  pickleScanResult?: string;
  virusScanResult?: string;
}

export interface CivitaiImage {
  url: string;
  width: number;
  height: number;
  nsfw?: boolean | string;
  nsfwLevel?: number;
  meta?: Record<string, unknown> | null;
}

export interface CivitaiVersion {
  id: number;
  name: string;
  baseModel?: string;
  trainedWords?: string[];
  files: CivitaiFile[];
  images: CivitaiImage[];
  stats?: { downloadCount?: number; rating?: number; thumbsUpCount?: number };
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

export function fetchCivitaiModels(options: {
  query: string;
  modelType: string;
  baseModel: string;
  sort: string;
  period: string;
  cursor?: string;
  apiKey: string;
}) {
  return invoke<CivitaiModelsResponse>('models', options);
}

export async function fetchCivitaiBaseModels() {
  const enums = await invoke<{ BaseModel: string[] }>('enums');
  return enums.BaseModel;
}
