import { invoke } from '@tauri-apps/api/core';
import type { LoraPreset, PromptPreset } from '../types/workflow';

export interface PresetFileItem<T = unknown> {
  id: string;
  filename: string;
  category: string;
  data: T;
  updatedAt: number;
}

interface RawPresetItem {
  id: string;
  filename: string;
  category: string;
  content: string;
  updated_at: number;
}

export const PresetService = {
  async listPresets<T>(
    category: 'prompts' | 'loras'
  ): Promise<PresetFileItem<T>[]> {
    try {
      const items = await invoke<RawPresetItem[]>('list_preset_files', {
        category
      });
      return items
        .map((item) => {
          try {
            const parsed = JSON.parse(item.content) as T;
            return {
              id: item.id,
              filename: item.filename,
              category: item.category,
              data: parsed,
              updatedAt: item.updated_at
            };
          } catch {
            return null;
          }
        })
        .filter((item): item is PresetFileItem<T> => item !== null);
    } catch (err) {
      console.warn(`[PresetService] listPresets error for ${category}:`, err);
      return [];
    }
  },

  async savePreset<T>(
    category: 'prompts' | 'loras',
    name: string,
    data: T
  ): Promise<string> {
    const jsonString = JSON.stringify(data, null, 2);
    return await invoke<string>('save_preset_file', {
      category,
      name,
      content: jsonString
    });
  },

  async deletePreset(
    category: 'prompts' | 'loras',
    filename: string
  ): Promise<void> {
    await invoke('delete_preset_file', {
      category,
      filename
    });
  },

  async openFolder(category: 'prompts' | 'loras'): Promise<void> {
    try {
      await invoke('open_presets_folder', { category });
    } catch (err) {
      console.warn(`[PresetService] openFolder error for ${category}:`, err);
    }
  }
};

export type PromptPresetFile = PresetFileItem<PromptPreset>;
export type LoraPresetFile = PresetFileItem<LoraPreset>;
