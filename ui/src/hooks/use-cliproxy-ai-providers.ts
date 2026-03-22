import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import type {
  AiProviderFamilyId,
  UpsertAiProviderEntryInput,
} from '../../../src/cliproxy/ai-providers';

const QUERY_KEY = ['cliproxy-ai-providers'] as const;

export function useCliproxyAiProviders() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.cliproxy.aiProviders.list(),
  });
}

export function useCreateCliproxyAiProviderEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      family,
      data,
    }: {
      family: AiProviderFamilyId;
      data: UpsertAiProviderEntryInput;
    }) => api.cliproxy.aiProviders.create(family, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Provider entry created');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateCliproxyAiProviderEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      family,
      index,
      data,
    }: {
      family: AiProviderFamilyId;
      index: number;
      data: UpsertAiProviderEntryInput;
    }) => api.cliproxy.aiProviders.update(family, index, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Provider entry updated');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteCliproxyAiProviderEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ family, index }: { family: AiProviderFamilyId; index: number }) =>
      api.cliproxy.aiProviders.delete(family, index),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Provider entry removed');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
