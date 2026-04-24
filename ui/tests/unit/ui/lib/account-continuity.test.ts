import { describe, expect, it } from 'vitest';
import { summarizeAuthAccountContinuity } from '@/lib/account-continuity';
import type { Account } from '@/lib/api-client';

function createAccount(name: string, overrides: Partial<Account> = {}): Account {
  return {
    name,
    created: '2026-04-03T00:00:00.000Z',
    ...overrides,
  };
}

describe('summarizeAuthAccountContinuity', () => {
  it('keeps isolated accounts out of shared readiness', () => {
    const summary = summarizeAuthAccountContinuity([
      createAccount('acc1', { context_mode: 'isolated' }),
      createAccount('acc2', { context_mode: 'isolated', context_inferred: true }),
    ]);

    expect(summary.isolatedCount).toBe(2);
    expect(summary.sharedCount).toBe(0);
    expect(summary.sharedPeerGroups).toEqual([]);
    expect(summary.deeperReadyGroups).toEqual([]);
    expect(summary.accounts.map((account) => account.sameGroupPeerCount)).toEqual([0, 0]);
  });

  it('marks shared accounts without a peer as incomplete', () => {
    const summary = summarizeAuthAccountContinuity([
      createAccount('acc1', {
        context_mode: 'shared',
        context_group: 'default',
        continuity_mode: 'standard',
      }),
      createAccount('acc2', { context_mode: 'isolated' }),
    ]);

    expect(summary.sharedCount).toBe(1);
    expect(summary.sharedAloneCount).toBe(1);
    expect(summary.sharedPeerGroups).toEqual([]);
    expect(summary.accounts[0]?.sameGroupPeerCount).toBe(0);
  });

  it('detects same-group peers and deeper-ready groups separately', () => {
    const summary = summarizeAuthAccountContinuity([
      createAccount('acc1', {
        context_mode: 'shared',
        context_group: 'sprint-a',
        continuity_mode: 'deeper',
      }),
      createAccount('acc2', {
        context_mode: 'shared',
        context_group: 'sprint-a',
        continuity_mode: 'deeper',
      }),
      createAccount('acc3', {
        context_mode: 'shared',
        context_group: 'sprint-b',
        continuity_mode: 'standard',
      }),
      createAccount('acc4', {
        context_mode: 'shared',
        context_group: 'sprint-b',
        continuity_mode: 'standard',
      }),
    ]);

    expect(summary.sharedPeerGroups).toEqual(['sprint-a', 'sprint-b']);
    expect(summary.deeperReadyGroups).toEqual(['sprint-a']);
    expect(summary.deeperReadyAccountCount).toBe(2);
    expect(
      summary.accounts.find((account) => account.name === 'acc1')?.sameGroupDeeperPeerCount
    ).toBe(1);
    expect(
      summary.accounts.find((account) => account.name === 'acc3')?.sameGroupDeeperPeerCount
    ).toBe(0);
  });
});
