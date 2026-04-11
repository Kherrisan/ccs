/**
 * React Query hooks for account management
 * Dashboard parity: Full CRUD operations for auth profiles
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Account, PlainCcsLane } from '@/lib/api-client';
import {
  summarizeAuthAccountContinuity,
  type AuthAccountRow,
  type SharedGroupSummary,
} from '@/lib/account-continuity';
import { toast } from 'sonner';

export interface AuthAccountsView {
  accounts: AuthAccountRow[];
  default: string | null;
  cliproxyCount: number;
  legacyContextCount: number;
  legacyContinuityCount: number;
  sharedCount: number;
  sharedStandardCount: number;
  deeperSharedCount: number;
  isolatedCount: number;
  sharedAloneCount: number;
  sharedPeerAccountCount: number;
  deeperReadyAccountCount: number;
  sharedPeerGroups: string[];
  deeperReadyGroups: string[];
  sharedGroups: string[];
  groupSummaries: SharedGroupSummary[];
  plainCcsLane: PlainCcsLane | null;
}

export function useAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.accounts.list(),
    select: (data): AuthAccountsView => {
      const authAccounts = data.accounts.filter((account) => account.type !== 'cliproxy');
      const continuity = summarizeAuthAccountContinuity(authAccounts);
      const cliproxyCount = data.accounts.length - authAccounts.length;
      const defaultAccount = continuity.accounts.some((account) => account.name === data.default)
        ? data.default
        : null;

      return {
        accounts: continuity.accounts,
        default: defaultAccount,
        cliproxyCount,
        legacyContextCount: continuity.legacyContextCount,
        legacyContinuityCount: continuity.legacyContinuityCount,
        sharedCount: continuity.sharedCount,
        sharedStandardCount: continuity.sharedStandardCount,
        deeperSharedCount: continuity.deeperSharedCount,
        isolatedCount: continuity.isolatedCount,
        sharedAloneCount: continuity.sharedAloneCount,
        sharedPeerAccountCount: continuity.sharedPeerAccountCount,
        deeperReadyAccountCount: continuity.deeperReadyAccountCount,
        sharedPeerGroups: continuity.sharedPeerGroups,
        deeperReadyGroups: continuity.deeperReadyGroups,
        sharedGroups: continuity.sharedGroups,
        groupSummaries: continuity.groupSummaries,
        plainCcsLane: data.plain_ccs_lane ?? null,
      };
    },
  });
}

export function useSetDefaultAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => api.accounts.setDefault(name),
    onSuccess: (_data, name) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast.success(`Default account set to "${name}"`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useResetDefaultAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.accounts.resetDefault(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast.success('Default account reset to CCS');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => api.accounts.delete(name),
    onSuccess: (_data, name) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast.success(`Account "${name}" deleted`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateAccountContext() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      name,
      context_mode,
      context_group,
      continuity_mode,
    }: {
      name: string;
      context_mode: 'isolated' | 'shared';
      context_group?: string;
      continuity_mode?: 'standard' | 'deeper';
    }) => api.accounts.updateContext(name, { context_mode, context_group, continuity_mode }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      const contextSummary =
        vars.context_mode === 'shared'
          ? vars.continuity_mode === 'deeper'
            ? `shared (${(vars.context_group || 'default').trim().toLowerCase().replace(/\s+/g, '-')}, deeper continuity)`
            : `shared (${(vars.context_group || 'default').trim().toLowerCase().replace(/\s+/g, '-')}, standard)`
          : 'isolated';
      toast.success(`Updated "${vars.name}" context to ${contextSummary}`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useConfirmLegacyAccountPolicies() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (accounts: Account[]) => {
      const legacyTargets = accounts.filter(
        (account) => account.context_inferred || account.continuity_inferred
      );

      const results = await Promise.allSettled(
        legacyTargets.map((account) => {
          const isShared = account.context_mode === 'shared';
          return api.accounts.updateContext(account.name, {
            context_mode: isShared ? 'shared' : 'isolated',
            context_group: isShared ? account.context_group || 'default' : undefined,
            continuity_mode: isShared
              ? account.continuity_mode === 'deeper'
                ? 'deeper'
                : 'standard'
              : undefined,
          });
        })
      );

      const failed = results.filter((result) => result.status === 'rejected').length;
      return { updatedCount: legacyTargets.length - failed, failedCount: failed };
    },
    onSuccess: ({ updatedCount, failedCount }) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      if (failedCount > 0 && updatedCount > 0) {
        toast.error(
          `Confirmed ${updatedCount} legacy account${updatedCount > 1 ? 's' : ''}, but ${failedCount} update${failedCount > 1 ? 's' : ''} failed. Refreshed account state.`
        );
        return;
      }

      if (failedCount > 0) {
        toast.error(
          `Failed to confirm ${failedCount} legacy account${failedCount > 1 ? 's' : ''}. Refreshed account state.`
        );
        return;
      }

      if (updatedCount > 0) {
        toast.success(
          `Confirmed explicit sync mode for ${updatedCount} legacy account${updatedCount > 1 ? 's' : ''}`
        );
        return;
      }

      toast.info('No legacy accounts need confirmation');
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast.error(error.message);
    },
  });
}
