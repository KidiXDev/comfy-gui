import type {
  ComfyHistoryEntry,
  ComfyObjectInfo,
  ComfyPromptResponse
} from '../types/comfy';

export interface AutocompleteItem {
  label: string;
  insert_text: string;
  category: number | string;
  total_post: number;
  kind?: 'wildcard';
}

export type AutocompleteSearchMode = 'tag' | 'artist' | 'wildcard';

export interface TagAutocompleteSettings {
  search_algorithm: 'fuzzy' | 'contains' | 'prefix';
  search_limit: number;
}

export interface ModelMetadata {
  name: string;
  base_model: string | null;
}

export interface UploadedImage {
  name: string;
  subfolder: string;
  type: string;
}

export interface WdTaggerSettings {
  modelName: string;
  generalThreshold: number;
  characterThreshold: number;
  addRating: boolean;
  excludeTags: string;
}

export const ComfyApi = {
  cleanUrl(serverUrl: string): string {
    return serverUrl.trim().replace(/\/+$/u, '');
  },

  async checkHealth(serverUrl: string): Promise<boolean> {
    const base = this.cleanUrl(serverUrl);
    try {
      const res = await fetch(`${base}/system_stats`, {
        method: 'GET',
        signal: AbortSignal.timeout(2500)
      });
      if (res.ok) return true;
    } catch {
      // fallback
    }

    try {
      const res = await fetch(`${base}/prompt`, {
        method: 'GET',
        signal: AbortSignal.timeout(2500)
      });
      if (res.ok) return true;
    } catch {
      // offline
    }

    return false;
  },

  async fetchObjectInfo(serverUrl: string): Promise<ComfyObjectInfo> {
    const url = `${this.cleanUrl(serverUrl)}/object_info`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch object info: ${res.status} ${res.statusText}`
      );
    }
    return (await res.json()) as ComfyObjectInfo;
  },

  async queuePrompt(
    serverUrl: string,
    prompt: Record<string, unknown>,
    clientId: string
  ): Promise<ComfyPromptResponse> {
    const url = `${this.cleanUrl(serverUrl)}/prompt`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        client_id: clientId
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to queue prompt: ${res.status} - ${errorText}`);
    }

    return (await res.json()) as ComfyPromptResponse;
  },

  async fetchHistory(
    serverUrl: string,
    promptId: string
  ): Promise<Record<string, ComfyHistoryEntry>> {
    const url = `${this.cleanUrl(serverUrl)}/history/${promptId}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch history: ${res.statusText}`);
    }
    return (await res.json()) as Record<string, ComfyHistoryEntry>;
  },

  async interrupt(serverUrl: string): Promise<void> {
    const url = `${this.cleanUrl(serverUrl)}/interrupt`;
    await fetch(url, { method: 'POST' });
  },

  async shutdown(serverUrl: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.cleanUrl(serverUrl)}/comfygui/shutdown`, {
        method: 'POST',
        signal: AbortSignal.timeout(3000)
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async uploadImage(serverUrl: string, file: Blob, name: string) {
    const form = new FormData();
    form.append('image', file, name);
    form.append('type', 'input');
    form.append('overwrite', 'true');
    const res = await fetch(`${this.cleanUrl(serverUrl)}/upload/image`, {
      method: 'POST',
      body: form
    });
    if (!res.ok) throw new Error(`Image upload failed: ${res.statusText}`);
    return (await res.json()) as UploadedImage;
  },

  async fetchNodeInfo(serverUrl: string, classType: string) {
    try {
      const res = await fetch(
        `${this.cleanUrl(serverUrl)}/object_info/${encodeURIComponent(classType)}`
      );
      if (!res.ok) return null;
      const data =
        (await res.json()) as import('../types/comfy').ComfyObjectInfo;
      return data[classType] ?? null;
    } catch {
      return null;
    }
  },

  async runWdTagger(
    serverUrl: string,
    imageName: string,
    settings: WdTaggerSettings
  ): Promise<string> {
    const prompt = {
      '1': {
        inputs: {
          model_name: settings.modelName,
          dtype: 'auto',
          general_threshold: settings.generalThreshold,
          character_threshold: settings.characterThreshold,
          add_rating: settings.addRating,
          exclude_tags: settings.excludeTags,
          batch_size: 1,
          image: ['2', 0]
        },
        class_type: 'WDTimmTagger'
      },
      '2': {
        inputs: { image: imageName },
        class_type: 'LoadImage'
      },
      '4': {
        inputs: { source: ['1', 0] },
        class_type: 'PreviewAny'
      }
    };
    const clientId = `comfy-gui-tagger-${crypto.randomUUID()}`;
    const queued = await this.queuePrompt(serverUrl, prompt, clientId);
    for (let attempt = 0; attempt < 240; attempt++) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 500);
      });
      const entry = (await this.fetchHistory(serverUrl, queued.prompt_id))[
        queued.prompt_id
      ];
      const output = entry?.outputs?.['4']?.text;
      if (output) {
        const text = (
          Array.isArray(output) ? output.join(', ') : output
        ).trim();
        try {
          const parsed = JSON.parse(text) as unknown;
          if (Array.isArray(parsed)) return parsed.join(', ');
        } catch {
          // The tagger may already return a plain prompt string.
        }
        return text;
      }
      if (entry?.status?.status_str === 'error') {
        throw new Error('WD Tagger execution failed.');
      }
      if (entry?.status?.completed) break;
    }
    throw new Error('WD Tagger did not return tags.');
  },

  async fetchBridgeModels(
    serverUrl: string
  ): Promise<import('../types/comfy').BridgeModelsResponse | null> {
    const url = `${this.cleanUrl(serverUrl)}/comfygui/models`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        return (await res.json()) as import('../types/comfy').BridgeModelsResponse;
      }
    } catch {
      // Bridge not installed or server not ready
    }
    return null;
  },

  async fetchBridgeSystem(
    serverUrl: string
  ): Promise<import('../types/comfy').BridgeSystemResponse | null> {
    const url = `${this.cleanUrl(serverUrl)}/comfygui/system`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        return (await res.json()) as import('../types/comfy').BridgeSystemResponse;
      }
    } catch {
      // Bridge not installed
    }
    return null;
  },

  async refreshBridgeModels(serverUrl: string): Promise<boolean> {
    const url = `${this.cleanUrl(serverUrl)}/comfygui/refresh`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(3000)
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async searchTags(
    serverUrl: string,
    query: string,
    limit: number,
    mode: AutocompleteSearchMode = 'tag',
    signal?: AbortSignal
  ): Promise<AutocompleteItem[]> {
    const base = this.cleanUrl(serverUrl);
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (mode === 'artist') params.set('category', '1');
    if (mode === 'wildcard') params.set('mode', 'wildcard');
    const res = await fetch(
      `${base}/yet_essential/autocomplete/search?${params.toString()}`,
      { signal }
    );
    if (!res.ok) return [];
    const payload = (await res.json()) as { items?: AutocompleteItem[] };
    return payload.items ?? [];
  },

  async updateTagAutocompleteSettings(
    serverUrl: string,
    algorithm: 'fuzzy' | 'contains' | 'prefix',
    limit: number
  ): Promise<boolean> {
    try {
      const res = await fetch(
        `${this.cleanUrl(serverUrl)}/yet_essential/settings/update`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            search_algorithm: algorithm,
            search_limit: limit
          })
        }
      );
      return res.ok;
    } catch {
      return false;
    }
  },

  async fetchTagAutocompleteSettings(
    serverUrl: string
  ): Promise<TagAutocompleteSettings | null> {
    try {
      const res = await fetch(
        `${this.cleanUrl(serverUrl)}/yet_essential/settings/get`,
        { signal: AbortSignal.timeout(2500) }
      );
      if (!res.ok) return null;
      const settings = (await res.json()) as Partial<TagAutocompleteSettings>;
      if (
        !['fuzzy', 'contains', 'prefix'].includes(
          settings.search_algorithm ?? ''
        ) ||
        !Number.isFinite(settings.search_limit)
      ) {
        return null;
      }
      return settings as TagAutocompleteSettings;
    } catch {
      return null;
    }
  },

  async checkTagAutocomplete(serverUrl: string): Promise<boolean> {
    return (await this.fetchTagAutocompleteSettings(serverUrl)) !== null;
  },

  async fetchModelMetadata(
    serverUrl: string,
    folderType: string
  ): Promise<ModelMetadata[]> {
    try {
      const params = new URLSearchParams({ type: folderType });
      const res = await fetch(
        `${this.cleanUrl(serverUrl)}/yet_essential/model/metadata?${params}`
      );
      return res.ok ? ((await res.json()) as ModelMetadata[]) : [];
    } catch {
      return [];
    }
  },

  getViewImageUrl(
    serverUrl: string,
    filename: string,
    subfolder = '',
    type = 'output'
  ): string {
    const base = this.cleanUrl(serverUrl);
    const params = new URLSearchParams({
      filename,
      subfolder,
      type
    });
    return `${base}/view?${params.toString()}`;
  },

  getModelPreviewUrl(
    serverUrl: string,
    category:
      'checkpoints' | 'unet' | 'diffusion_models' | 'loras' | 'vae' | 'clip',
    name: string,
    res = 300
  ): string {
    const base = this.cleanUrl(serverUrl);
    const params = new URLSearchParams({
      type: category,
      name,
      res: String(res)
    });
    return `${base}/comfygui/model_preview?${params.toString()}`;
  }
};
