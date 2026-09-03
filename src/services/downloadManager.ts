import { invoke } from '@tauri-apps/api/core';

export interface DownloadRecord {
  gid: string;
  versionId: number;
  name: string;
  fileName: string;
  modelType: string;
  baseModel: string;
  modelPath: string;
  previewUrl?: string;
  status: 'active' | 'waiting' | 'paused' | 'complete' | 'error' | 'removed';
  completedLength: number;
  totalLength: number;
  downloadSpeed: number;
  errorMessage?: string;
  createdAt: number;
}

export function listDownloads() {
  return invoke<DownloadRecord[]>('list');
}

export function pauseDownload(gid: string) {
  return invoke('pause', { gid });
}

export function resumeDownload(gid: string) {
  return invoke('resume', { gid });
}

export function cancelDownload(gid: string) {
  return invoke('cancel', { gid });
}

export function queueCivitaiDownload(options: {
  versionId: number;
  workingDir: string;
  apiKey: string;
}) {
  return invoke<DownloadRecord>('download', options);
}
