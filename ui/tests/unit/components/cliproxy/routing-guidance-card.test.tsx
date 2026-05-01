import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '../../../setup/test-utils';
import { RoutingGuidanceCard } from '@/components/cliproxy/routing-guidance-card';

describe('RoutingGuidanceCard', () => {
  it('shows the current strategy and applies an explicit change', async () => {
    const onApply = vi.fn();
    const onApplyAffinity = vi.fn();

    render(
      <RoutingGuidanceCard
        state={{
          strategy: 'round-robin',
          source: 'live',
          target: 'local',
          reachable: true,
        }}
        sessionAffinityState={{
          enabled: true,
          ttl: '1h',
          source: 'config',
          target: 'local',
          reachable: true,
          manageable: true,
        }}
        isLoading={false}
        isSaving={false}
        onApply={onApply}
        onApplyAffinity={onApplyAffinity}
      />
    );

    expect(screen.getByText('Routing strategy')).toBeInTheDocument();
    expect(screen.getAllByText('round-robin').length).toBeGreaterThan(0);
    expect(screen.getByText('Session affinity')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1h')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /fill first/i }));
    fireEvent.click(screen.getByRole('button', { name: /use fill-first/i }));

    expect(onApply).toHaveBeenCalledWith('fill-first');

    fireEvent.click(screen.getByRole('button', { name: /disable session affinity/i }));
    expect(onApplyAffinity).toHaveBeenCalledWith({ enabled: false, ttl: '1h' });
  });

  it('shows the error state and disables apply', () => {
    render(
      <RoutingGuidanceCard
        isLoading={false}
        isSaving={false}
        error={new Error('Remote CLIProxy is not reachable')}
        onApply={() => undefined}
        onApplyAffinity={() => undefined}
      />
    );

    expect(screen.getByText('Remote CLIProxy is not reachable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /use round-robin/i })).toBeDisabled();
  });

  it('shows remote session-affinity guidance when the setting is not manageable', () => {
    render(
      <RoutingGuidanceCard
        state={{
          strategy: 'round-robin',
          source: 'live',
          target: 'remote',
          reachable: true,
        }}
        sessionAffinityState={{
          source: 'unsupported',
          target: 'remote',
          reachable: true,
          manageable: false,
          message: 'Remote session-affinity management is not supported from CCS yet.',
        }}
        isLoading={false}
        isSaving={false}
        onApply={() => undefined}
        onApplyAffinity={() => undefined}
      />
    );

    expect(
      screen.getByText('Remote session-affinity management is not supported from CCS yet.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /session affinity unavailable/i })).toBeDisabled();
  });
});
