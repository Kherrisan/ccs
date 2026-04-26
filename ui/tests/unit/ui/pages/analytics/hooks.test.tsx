import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAnalyticsPage } from '@/pages/analytics/hooks';
import { AllProviders } from '@tests/setup/test-utils';

const usageMocks = vi.hoisted(() => ({
  useUsageSummary: vi.fn(() => ({ data: undefined, isLoading: false })),
  useUsageTrends: vi.fn(() => ({ data: undefined, isLoading: false })),
  useHourlyUsage: vi.fn(() => ({ data: undefined, isLoading: false })),
  useModelUsage: vi.fn(() => ({ data: undefined, isLoading: false })),
  useRefreshUsage: vi.fn(() => vi.fn()),
  useUsageStatus: vi.fn(() => ({ data: { lastFetch: null } })),
  useSessions: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

vi.mock('@/hooks/use-usage', () => usageMocks);

describe('useAnalyticsPage', () => {
  it('requests a broader recent session sample instead of the old 3-session slice', () => {
    renderHook(() => useAnalyticsPage(), {
      wrapper: AllProviders,
    });

    expect(usageMocks.useSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 50,
      })
    );
    expect(usageMocks.useSessions).not.toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 3,
      })
    );
  });
});
