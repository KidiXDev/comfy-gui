import { invoke } from '@tauri-apps/api/core';

export interface OutputImage {
  localId: string;
  path: string;
  filename: string;
  subfolder: string;
  extension: string;
  fileSize: number;
  modifiedMs: number;
}

export interface OutputImageMetadata {
  width: number;
  height: number;
  prompt: string;
  negativePrompt: string;
  model: string;
  sampler: string;
  scheduler: string;
  seed: string;
  steps: string;
  cfg: string;
  rawPrompt: string;
  rawWorkflow: string;
}

export function listOutputImages(workingDir: string): Promise<OutputImage[]> {
  return invoke('list_output_images', { workingDir });
}

export function prepareOutputGallery(
  workingDir: string
): Promise<OutputImage[]> {
  return invoke('prepare_output_gallery', { workingDir });
}

export function clearGalleryCache(): Promise<void> {
  return invoke('clear_gallery_cache');
}

export function getGalleryCacheDirectory(): Promise<string> {
  return invoke('gallery_cache_directory');
}

export function refreshOutputImages(
  workingDir: string
): Promise<OutputImage[]> {
  return invoke('refresh_output_images', { workingDir });
}

export function readOutputImageMetadata(
  workingDir: string,
  path: string
): Promise<OutputImageMetadata> {
  return invoke('read_output_image_metadata', { workingDir, path });
}
