import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UsageSummaryCards } from '@/components/analytics/usage-summary-cards';
import type { UsageSummary } from '@/hooks/use-usage';
import { AllProviders } from '@tests/setup/test-utils';

function buildSummary(overrides: Partial<UsageSummary> = {}): UsageSummary {
  return {
    totalTokens: 3_000,
    totalInputTokens: 2_000,
    totalOutputTokens: 1_000,
    totalCacheTokens: 500,
    totalCacheCreationTokens: 300,
    totalCacheReadTokens: 200,
    totalCost: 2,
    tokenBreakdown: {
      input: { tokens: 2_000, cost: 0.8 },
      output: { tokens: 1_000, cost: 0.7 },
      cacheCreation: { tokens: 300, cost: 0.3 },
      cacheRead: { tokens: 200, cost: 0.2 },
    },
    totalDays: 2,
    averageTokensPerDay: 1_500,
    averageCostPerDay: 1,
    ...overrides,
  };
}

describe('UsageSummaryCards', () => {
  it('labels total tokens as I/O-only when cache is excluded from the backend total', () => {
    render(<UsageSummaryCards data={buildSummary()} />, { wrapper: AllProviders });

    expect(screen.getByText('Total Tokens (I/O)')).toBeInTheDocument();
    expect(screen.getByText('2.0K in / 1.0K out')).toBeInTheDocument();
    expect(screen.getByText('Cache Tokens')).toBeInTheDocument();
    expect(screen.getByText('$0.50 (25% of cost)')).toBeInTheDocument();
  });

  it('falls back to an inclusive total label when total tokens already include cache', () => {
    render(
      <UsageSummaryCards
        data={buildSummary({
          totalTokens: 3_500,
        })}
      />,
      { wrapper: AllProviders }
    );

    expect(screen.getByText('Total Tokens')).toBeInTheDocument();
    expect(screen.getByText('2.0K in / 1.0K out / 500 cache')).toBeInTheDocument();
    expect(screen.queryByText('Total Tokens (I/O)')).not.toBeInTheDocument();
  });
});
