import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UsageTrendChart } from '@/components/analytics/usage-trend-chart';
import { AllProviders } from '@tests/setup/test-utils';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Area: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: ({ content }: { content: (args: unknown) => ReactNode }) => (
    <div data-testid="chart-tooltip">
      {content({
        active: true,
        label: '14:00',
        payload: [
          {
            name: 'Tokens',
            value: 1_200,
            color: '#0080FF',
            payload: { requests: 4 },
          },
          {
            name: 'Cost',
            value: 1.5,
            color: '#00C49F',
            payload: { requests: 4 },
          },
        ],
      })}
    </div>
  ),
  defs: ({ children }: { children: ReactNode }) => <>{children}</>,
  linearGradient: ({ children }: { children: ReactNode }) => <>{children}</>,
  stop: () => null,
}));

describe('UsageTrendChart', () => {
  it('does not overclaim hourly request semantics in the tooltip', () => {
    render(
      <UsageTrendChart
        granularity="hourly"
        data={[
          {
            hour: '2026-04-26 14:00',
            tokens: 1_200,
            inputTokens: 700,
            outputTokens: 500,
            cacheTokens: 200,
            cost: 1.5,
            modelsUsed: 2,
            requests: 4,
          },
        ]}
      />,
      { wrapper: AllProviders }
    );

    expect(screen.getByText('Tokens: 1.2K')).toBeInTheDocument();
    expect(screen.getByText('Cost: $1.5')).toBeInTheDocument();
    expect(screen.queryByText(/Requests:/)).not.toBeInTheDocument();
  });
});
