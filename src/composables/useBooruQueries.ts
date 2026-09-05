import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import {
  clearBooruCache,
  fetchBooruDetail,
  fetchBooruSettings,
  fetchBooruSources,
  saveBooruSettings,
  searchBooru,
  testBooruCredentials,
  type BooruCredentials,
  type BooruSettingsUpdate
} from '../services/booruGallery';
import { queryKeys } from './queryKeys';

export function useBooruSourcesQuery(
  serverUrl: MaybeRefOrGetter<string>,
  options?: { enabled?: MaybeRefOrGetter<boolean> }
) {
  return useQuery({
    queryKey: computed(() => queryKeys.booru.sources(toValue(serverUrl))),
    queryFn: () => fetchBooruSources(toValue(serverUrl)),
    enabled: computed(() => {
      const url = toValue(serverUrl);
      const isCustomEnabled = options?.enabled ? toValue(options.enabled) : true;
      return Boolean(url) && isCustomEnabled;
    }),
    staleTime: 1000 * 60 * 10
  });
}

export function useBooruSearchQuery(
  serverUrl: MaybeRefOrGetter<string>,
  searchOptions: MaybeRefOrGetter<{
    source: string;
    query: string;
    ratings: string[];
    sort: string;
    cursor?: string | null;
    limit?: number;
  }>,
  options?: { enabled?: MaybeRefOrGetter<boolean> }
) {
  return useQuery({
    queryKey: computed(() =>
      queryKeys.booru.search(
        toValue(serverUrl),
        toValue(searchOptions) as unknown as Record<string, unknown>
      )
    ),
    queryFn: () => searchBooru(toValue(serverUrl), toValue(searchOptions)),
    enabled: computed(() => {
      const url = toValue(serverUrl);
      const opts = toValue(searchOptions);
      const isCustomEnabled = options?.enabled ? toValue(options.enabled) : true;
      return Boolean(url) && Boolean(opts.source) && isCustomEnabled;
    }),
    staleTime: 1000 * 60 * 2
  });
}

export function useBooruDetailQuery(
  serverUrl: MaybeRefOrGetter<string>,
  source: MaybeRefOrGetter<string>,
  postId: MaybeRefOrGetter<string>,
  options?: { enabled?: MaybeRefOrGetter<boolean> }
) {
  return useQuery({
    queryKey: computed(() =>
      queryKeys.booru.detail(
        toValue(serverUrl),
        toValue(source),
        toValue(postId)
      )
    ),
    queryFn: () =>
      fetchBooruDetail(toValue(serverUrl), toValue(source), toValue(postId)),
    enabled: computed(() => {
      const url = toValue(serverUrl);
      const src = toValue(source);
      const id = toValue(postId);
      const isCustomEnabled = options?.enabled ? toValue(options.enabled) : true;
      return Boolean(url && src && id) && isCustomEnabled;
    }),
    staleTime: 1000 * 60 * 15
  });
}

export function useBooruSettingsQuery(
  serverUrl: MaybeRefOrGetter<string>,
  options?: { enabled?: MaybeRefOrGetter<boolean> }
) {
  return useQuery({
    queryKey: computed(() => queryKeys.booru.settings(toValue(serverUrl))),
    queryFn: () => fetchBooruSettings(toValue(serverUrl)),
    enabled: computed(() => {
      const url = toValue(serverUrl);
      const isCustomEnabled = options?.enabled ? toValue(options.enabled) : true;
      return Boolean(url) && isCustomEnabled;
    }),
    staleTime: 1000 * 60 * 5
  });
}

export function useSaveBooruSettingsMutation(
  serverUrl: MaybeRefOrGetter<string>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (update: BooruSettingsUpdate) =>
      saveBooruSettings(toValue(serverUrl), update),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.booru.settings(toValue(serverUrl))
      });
    }
  });
}

export function useClearBooruCacheMutation(
  serverUrl: MaybeRefOrGetter<string>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clearBooruCache(toValue(serverUrl)),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.booru.all
      });
    }
  });
}

export function useTestBooruCredentialsMutation(
  serverUrl: MaybeRefOrGetter<string>
) {
  return useMutation({
    mutationFn: ({
      source,
      credentials
    }: {
      source: keyof BooruCredentials;
      credentials: Record<string, string>;
    }) => testBooruCredentials(toValue(serverUrl), source, credentials)
  });
}
