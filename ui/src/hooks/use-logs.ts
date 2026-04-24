import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  api,
  type LogsEntry,
  type LogsLevel,
  type UpdateLogsConfigPayload,
} from '@/lib/api-client';

export type LogsLevelFilter = 'all' | LogsLevel;
export type LogsSourceFilter = 'all' | string;

const CONFIG_QUERY_KEY = ['logs', 'config'] as const;
const SOURCES_QUERY_KEY = ['logs', 'sources'] as const;
const DEFAULT_LIMIT = 150;

export function useLogsWorkspace() {
  const [selectedSource, setSelectedSource] = useState<LogsSourceFilter>('all');
  const [selectedLevel, setSelectedLevel] = useState<LogsLevelFilter>('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim());

  const configQuery = useQuery({
    queryKey: CONFIG_QUERY_KEY,
    queryFn: async () => (await api.logs.getConfig()).logging,
    refetchInterval: 30_000,
  });

  const sourcesQuery = useQuery({
    queryKey: SOURCES_QUERY_KEY,
    queryFn: async () => (await api.logs.getSources()).sources,
    refetchInterval: 15_000,
  });

  const entriesQuery = useQuery({
    queryKey: ['logs', 'entries', selectedSource, selectedLevel, deferredSearch, limit],
    queryFn: async () =>
      (
        await api.logs.getEntries({
          source: selectedSource === 'all' ? undefined : selectedSource,
          level: selectedLevel === 'all' ? undefined : selectedLevel,
          search: deferredSearch || undefined,
          limit,
        })
      ).entries,
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });

  const activeSelectedEntryId = useMemo(() => {
    const nextEntries = entriesQuery.data ?? [];
    if (nextEntries.length === 0) {
      return null;
    }

    if (selectedEntryId && nextEntries.some((entry) => entry.id === selectedEntryId)) {
      return selectedEntryId;
    }

    return nextEntries[0]?.id ?? null;
  }, [entriesQuery.data, selectedEntryId]);

  const selectedEntry = useMemo(
    () => (entriesQuery.data ?? []).find((entry) => entry.id === activeSelectedEntryId) ?? null,
    [activeSelectedEntryId, entriesQuery.data]
  );

  const latestTimestamp = useMemo(() => {
    const timestamps = (sourcesQuery.data ?? [])
      .map((source) => source.lastTimestamp)
      .filter((value): value is string => Boolean(value));
    return timestamps.sort((left, right) => right.localeCompare(left))[0] ?? null;
  }, [sourcesQuery.data]);

  return {
    configQuery,
    sourcesQuery,
    entriesQuery,
    selectedSource,
    setSelectedSource,
    selectedLevel,
    setSelectedLevel,
    search,
    setSearch,
    limit,
    setLimit,
    selectedEntryId: activeSelectedEntryId,
    setSelectedEntryId,
    selectedEntry,
    latestTimestamp,
    isInitialLoading:
      (!configQuery.data && configQuery.isLoading) ||
      (!sourcesQuery.data && sourcesQuery.isLoading) ||
      (!entriesQuery.data && entriesQuery.isLoading),
  };
}

export function useUpdateLogsConfig() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (payload: UpdateLogsConfigPayload) => api.logs.updateConfig(payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CONFIG_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: SOURCES_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['logs', 'entries'] }),
      ]);
      toast.success(t('toasts.loggingConfigSaved'));
    },
    onError: (error: Error) => {
      toast.error(error.message || t('toasts.loggingConfigSaveFailed'));
    },
  });
}

export function getLogLevelOptions(): Array<{ value: LogsLevelFilter; label: string }> {
  return [
    { value: 'all', label: 'All levels' },
    { value: 'error', label: 'Errors' },
    { value: 'warn', label: 'Warnings' },
    { value: 'info', label: 'Info' },
    { value: 'debug', label: 'Debug' },
  ];
}

export function getSelectedSourceLabel(
  source: LogsSourceFilter,
  sources: Array<{ source: string; label: string }>
) {
  if (source === 'all') {
    return 'All sources';
  }

  return sources.find((entry) => entry.source === source)?.label ?? source;
}

export function getSourceLabelMap(
  sources: Array<{ source: string; label: string }>
): Record<string, string> {
  return Object.fromEntries(sources.map((source) => [source.source, source.label]));
}

export function isLogsEntryListEmpty(entries: LogsEntry[] | undefined) {
  return !entries || entries.length === 0;
}
