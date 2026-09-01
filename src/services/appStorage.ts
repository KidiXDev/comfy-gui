import { invoke } from '@tauri-apps/api/core';

export async function loadAppData<T>(name: string): Promise<T | null> {
  try {
    const value = await invoke<string | null>('load_app_data', { name });
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    try {
      const local = localStorage.getItem(`app_data_${name}`);
      return local ? (JSON.parse(local) as T) : null;
    } catch {
      return null;
    }
  }
}

export async function saveAppData(name: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  try {
    await invoke('save_app_data', { name, value: json });
  } catch {
    try {
      localStorage.setItem(`app_data_${name}`, json);
    } catch {
      // ignore
    }
  }
}

export async function deleteAppData(name: string): Promise<void> {
  try {
    await invoke('delete_app_data', { name });
  } catch {
    try {
      localStorage.removeItem(`app_data_${name}`);
    } catch {
      // ignore
    }
  }
}
