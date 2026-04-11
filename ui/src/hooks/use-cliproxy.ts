/**
 * React Query hooks for CLIProxy variants and accounts
 * Phase 03: REST API Routes & CRUD
 * Phase 06: Multi-Account Management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  api,
  type CreateVariant,
  type UpdateVariant,
  type CreatePreset,
  type RoutingStrategy,
} from '@/lib/api-client';
import { toast } from 'sonner';

function invalidateCliproxyRoutingQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: ['cliproxy-catalog'] });
  queryClient.invalidateQueries({ queryKey: ['cliproxy-models'] });
}

function invalidateCliproxyAccountQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: ['cliproxy-accounts'] });
  queryClient.invalidateQueries({ queryKey: ['cliproxy-auth'] });
  invalidateCliproxyRoutingQueries(queryClient);
}

export function useCliproxy() {
  return useQuery({
    queryKey: ['cliproxy'],
    queryFn: () => api.cliproxy.list(),
  });
}

export function useCliproxyAuth() {
  return useQuery({
    queryKey: ['cliproxy-auth'],
    queryFn: () => api.cliproxy.getAuthStatus(),
  });
}

export function useCliproxyCatalog() {
  return useQuery({
    queryKey: ['cliproxy-catalog'],
    queryFn: () => api.cliproxy.catalog(),
    staleTime: 30000,
    retry: 1,
  });
}

export function useCliproxyRoutingStrategy() {
  return useQuery({
    queryKey: ['cliproxy-routing'],
    queryFn: () => api.cliproxy.getRoutingStrategy(),
  });
}

export function useUpdateCliproxyRoutingStrategy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (strategy: RoutingStrategy) => api.cliproxy.updateRoutingStrategy(strategy),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['cliproxy-routing'] });
      toast.success(result.message || `Routing strategy set to ${result.strategy}`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useCreateVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateVariant) => api.cliproxy.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cliproxy'] });
      toast.success('Variant created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, data }: { name: string; data: UpdateVariant }) =>
      api.cliproxy.update(name, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cliproxy'] });
      toast.success('Variant updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => api.cliproxy.delete(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cliproxy'] });
      toast.success('Variant deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Multi-account management hooks
export function useCliproxyAccounts() {
  return useQuery({
    queryKey: ['cliproxy-accounts'],
    queryFn: () => api.cliproxy.accounts.list(),
  });
}

export function useProviderAccounts(provider: string) {
  return useQuery({
    queryKey: ['cliproxy-accounts', provider],
    queryFn: () => api.cliproxy.accounts.listByProvider(provider),
    enabled: !!provider,
  });
}

export function useSetDefaultAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, accountId }: { provider: string; accountId: string }) =>
      api.cliproxy.accounts.setDefault(provider, accountId),
    onSuccess: () => {
      invalidateCliproxyAccountQueries(queryClient);
      toast.success('Default account updated');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useRemoveAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, accountId }: { provider: string; accountId: string }) =>
      api.cliproxy.accounts.remove(provider, accountId),
    onSuccess: () => {
      invalidateCliproxyAccountQueries(queryClient);
      toast.success('Account removed');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function usePauseAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, accountId }: { provider: string; accountId: string }) =>
      api.cliproxy.accounts.pause(provider, accountId),
    onSuccess: () => {
      invalidateCliproxyAccountQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['cliproxy-stats'] });
      toast.success('Account paused');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useResumeAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, accountId }: { provider: string; accountId: string }) =>
      api.cliproxy.accounts.resume(provider, accountId),
    onSuccess: () => {
      invalidateCliproxyAccountQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['cliproxy-stats'] });
      toast.success('Account resumed');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useSoloAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, accountId }: { provider: string; accountId: string }) =>
      api.cliproxy.accounts.solo(provider, accountId),
    onSuccess: (data) => {
      invalidateCliproxyAccountQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['cliproxy-stats'] });
      const pausedCount = data.paused.length;
      toast.success(
        `Solo mode: paused ${pausedCount} other account${pausedCount !== 1 ? 's' : ''}`
      );
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useBulkPauseAccounts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, accountIds }: { provider: string; accountIds: string[] }) =>
      api.cliproxy.accounts.bulkPause(provider, accountIds),
    onSuccess: (data) => {
      invalidateCliproxyAccountQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['cliproxy-stats'] });
      toast.success(
        `Paused ${data.succeeded.length} account${data.succeeded.length !== 1 ? 's' : ''}`
      );
      if (data.failed.length > 0) {
        toast.warning(
          `${data.failed.length} account${data.failed.length !== 1 ? 's' : ''} failed to pause`
        );
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useBulkResumeAccounts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, accountIds }: { provider: string; accountIds: string[] }) =>
      api.cliproxy.accounts.bulkResume(provider, accountIds),
    onSuccess: (data) => {
      invalidateCliproxyAccountQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['cliproxy-stats'] });
      toast.success(
        `Resumed ${data.succeeded.length} account${data.succeeded.length !== 1 ? 's' : ''}`
      );
      if (data.failed.length > 0) {
        toast.warning(
          `${data.failed.length} account${data.failed.length !== 1 ? 's' : ''} failed to resume`
        );
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// OAuth flow hook
export function useStartAuth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, nickname }: { provider: string; nickname?: string }) =>
      api.cliproxy.auth.start(provider, nickname),
    onSuccess: (_data, variables) => {
      invalidateCliproxyAccountQueries(queryClient);
      toast.success(`Account added for ${variables.provider}`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Cancel OAuth flow hook
export function useCancelAuth() {
  return useMutation({
    mutationFn: (provider: string) => api.cliproxy.auth.cancel(provider),
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Kiro IDE import hook (alternative auth path when OAuth callback fails)
export function useKiroImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.cliproxy.auth.kiroImport(),
    onSuccess: (data) => {
      invalidateCliproxyAccountQueries(queryClient);
      if (data.account) {
        toast.success(`Imported Kiro account: ${data.account.email || data.account.id}`);
      } else {
        toast.success('Kiro token imported');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Stats and models hooks for Overview tab
export function useCliproxyStats() {
  return useQuery({
    queryKey: ['cliproxy-stats'],
    queryFn: () => api.cliproxy.stats(),
    refetchInterval: 30000, // Refresh every 30s
  });
}

export function useCliproxyModels() {
  return useQuery({
    queryKey: ['cliproxy-models'],
    queryFn: () => api.cliproxy.models(),
  });
}

export function useUpdateModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, model }: { provider: string; model: string }) =>
      api.cliproxy.updateModel(provider, model),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cliproxy-models'] });
      toast.success('Model updated');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// ==================== Presets ====================

export function usePresets(profile: string) {
  return useQuery({
    queryKey: ['presets', profile],
    queryFn: () => api.presets.list(profile),
    enabled: !!profile,
  });
}

export function useCreatePreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ profile, data }: { profile: string; data: CreatePreset }) =>
      api.presets.create(profile, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['presets', variables.profile] });
      toast.success(`Preset "${variables.data.name}" saved`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeletePreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ profile, name }: { profile: string; name: string }) =>
      api.presets.delete(profile, name),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['presets', variables.profile] });
      toast.success('Preset deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// ==================== Proxy Process Status ====================

export function useProxyStatus() {
  return useQuery({
    queryKey: ['proxy-status'],
    queryFn: () => api.cliproxy.proxyStatus(),
    refetchInterval: 30000, // Refresh every 30s as backup (websocket is primary)
  });
}

export function useStartProxy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.cliproxy.proxyStart(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['proxy-status'] });
      if (data.alreadyRunning) {
        toast.info('CLIProxy was already running');
      } else if (data.started) {
        toast.success('CLIProxy started successfully');
      } else {
        toast.error(data.error || 'Failed to start CLIProxy');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useStopProxy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.cliproxy.proxyStop(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['proxy-status'] });
      if (data.stopped) {
        toast.success(
          `CLIProxy stopped${data.sessionCount ? ` (${data.sessionCount} session(s) disconnected)` : ''}`
        );
      } else {
        toast.error(data.error || 'Failed to stop CLIProxy');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// ==================== Update Check ====================

export function useCliproxyUpdateCheck() {
  return useQuery({
    queryKey: ['cliproxy-update-check'],
    queryFn: () => api.cliproxy.updateCheck(),
    staleTime: 5 * 60 * 1000, // 5 minutes (reduced from 1 hour for faster backend switch response)
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
    refetchOnWindowFocus: true, // Refetch on window focus to catch backend changes
  });
}

// ==================== Backend Management ====================

/**
 * Hook for switching CLIProxy backend (original vs plus)
 * Invalidates all backend-dependent queries to ensure UI consistency
 */
export function useUpdateBackend() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['update-backend'], // Used by ProxyStatusWidget to detect backend switching
    mutationFn: ({ backend, force = false }: { backend: 'original' | 'plus'; force?: boolean }) =>
      api.cliproxyServer.updateBackend(backend, force),
    onSuccess: () => {
      // Invalidate all queries that depend on backend setting
      // Use refetchType: 'all' to force immediate refetch even if query is stale
      queryClient.invalidateQueries({ queryKey: ['cliproxy-update-check'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['cliproxy-versions'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['cliproxy-server-config'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['proxy-status'] });
      queryClient.invalidateQueries({ queryKey: ['cliproxy-stats'] });
      toast.success('Backend updated');
    },
    onError: (error: Error) => {
      // Handle 409 conflict (proxy running)
      if (error.message.includes('Proxy is running')) {
        toast.error('Stop the proxy first to change backend');
      } else {
        toast.error(error.message);
      }
    },
  });
}

// ==================== Version Management ====================

export function useCliproxyVersions() {
  return useQuery({
    queryKey: ['cliproxy-versions'],
    queryFn: () => api.cliproxy.versions(),
    staleTime: 5 * 60 * 1000, // 5 minutes (reduced for faster backend switch response)
    refetchOnWindowFocus: true, // Refetch on focus to catch backend changes
  });
}

export function useInstallVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ version, force }: { version: string; force?: boolean }) =>
      api.cliproxy.install(version, force),
    onSuccess: (data) => {
      if (data.requiresConfirmation) {
        // Don't show toast - let caller handle confirmation dialog
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['cliproxy-versions'] });
      queryClient.invalidateQueries({ queryKey: ['cliproxy-update-check'] });
      queryClient.invalidateQueries({ queryKey: ['proxy-status'] });
      if (data.success) {
        toast.success(data.message || `Installed v${data.version}`);
      } else {
        toast.error(data.error || 'Installation failed');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useRestartProxy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.cliproxy.restart(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['proxy-status'] });
      if (data.success) {
        toast.success(`Proxy restarted on port ${data.port}`);
      } else {
        toast.error(data.error || 'Restart failed');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
