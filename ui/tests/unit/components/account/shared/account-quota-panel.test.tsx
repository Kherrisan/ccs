import { render, screen, userEvent } from '@tests/setup/test-utils';
import { describe, expect, it } from 'vitest';
import { AccountQuotaPanel } from '@/components/account/shared/account-quota-panel';
import type { GeminiCliQuotaResult } from '@/lib/api-client';

function createGeminiFailureQuota(): GeminiCliQuotaResult {
  return {
    success: false,
    buckets: [],
    projectId: 'test-project',
    lastUpdated: Date.now(),
    error: 'Request had invalid authentication credentials.',
    httpStatus: 401,
    errorCode: 'UNAUTHENTICATED',
    errorDetail:
      '{"error":{"code":401,"message":"Request had invalid authentication credentials.","status":"UNAUTHENTICATED"}}',
    actionHint: 'Run ccs gemini --auth to reconnect this account.',
    needsReauth: true,
  };
}

describe('AccountQuotaPanel failure tooltip', () => {
  it('renders the shared failure tooltip content with viewport-safe shell classes', async () => {
    render(
      <AccountQuotaPanel
        provider="gemini"
        quota={createGeminiFailureQuota()}
        quotaLoading={false}
        mode="detailed"
      />
    );

    await userEvent.hover(screen.getByText('Reauth'));

    const summary = (
      await screen.findAllByText('Request had invalid authentication credentials.')
    ).find((node) => node.closest('[data-slot="tooltip-content"]'));
    expect(summary).toBeInTheDocument();
    const tooltipContent = summary.closest('[data-slot="tooltip-content"]');
    const actionHint = screen
      .getAllByText('Run ccs gemini --auth to reconnect this account.')
      .find((node) => node.closest('[data-slot="tooltip-content"]') === tooltipContent);
    const technicalDetail = screen
      .getAllByText('HTTP 401 | UNAUTHENTICATED')
      .find((node) => node.closest('[data-slot="tooltip-content"]') === tooltipContent);
    expect(actionHint).toBeInTheDocument();
    expect(technicalDetail).toBeInTheDocument();
    expect(tooltipContent?.className).toContain('max-w-[calc(100vw-2rem)]');
    expect(tooltipContent?.className).toContain('bg-popover');
    expect(tooltipContent?.className).toContain('text-popover-foreground');
  });
});
