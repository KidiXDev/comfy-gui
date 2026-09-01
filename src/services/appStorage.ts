import { invoke } from '@tauri-apps/api/core';

type AppDataName =
  | 'launcher_config'
  | 'lora_presets'
  | 'prompt_textarea_sizes'
  | 'remove_background_preferences'
  | 'session_history'
  | 'upscaler_preferences'
  | 'workflow_session_state';

type DataFile = 'config' | 'history' | 'state';
type DataContainer = Partial<Record<AppDataName, unknown>>;

const dataFiles: Record<AppDataName, DataFile> = {
  launcher_config: 'config',
  lora_presets: 'state',
  prompt_textarea_sizes: 'state',
  remove_background_preferences: 'state',
  session_history: 'history',
  upscaler_preferences: 'state',
  workflow_session_state: 'state'
};

const pendingWrites: Record<DataFile, Promise<void>> = {
  config: Promise.resolve(),
  history: Promise.resolve(),
  state: Promise.resolve()
};

async function loadDataFile(file: DataFile): Promise<DataContainer> {
  const value = await invoke<string | null>('load_app_data', { name: file });
  return value ? (JSON.parse(value) as DataContainer) : {};
}

export async function loadAppData<T>(name: AppDataName): Promise<T | null> {
  const file = dataFiles[name];
  await pendingWrites[file].catch(console.error);
  const data = await loadDataFile(file);
  return (data[name] as T | undefined) ?? null;
}

export async function saveAppData(
  name: AppDataName,
  value: unknown
): Promise<void> {
  const file = dataFiles[name];
  const write = pendingWrites[file].catch(console.error).then(async () => {
    const data = await loadDataFile(file);
    data[name] = value;
    await invoke('save_app_data', {
      name: file,
      value: JSON.stringify(data)
    });
  });
  pendingWrites[file] = write;
  await write;
}

export async function deleteAppData(name: AppDataName): Promise<void> {
  const file = dataFiles[name];
  const write = pendingWrites[file].catch(console.error).then(async () => {
    const data = await loadDataFile(file);
    delete data[name];
    await invoke('save_app_data', {
      name: file,
      value: JSON.stringify(data)
    });
  });
  pendingWrites[file] = write;
  await write;
}
