import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '../../../setup/test-utils';
import { RoutingGuidanceCard } from '@/components/cliproxy/routing-guidance-card';

describe('RoutingGuidanceCard', () => {
  it('shows the current strategy and applies an explicit change', async () => {
    const onApply = vi.fn();

    render(
      <RoutingGuidanceCard
        state={{
          strategy: 'round-robin',
          source: 'live',
          target: 'local',
          reachable: true,
        }}
        isLoading={false}
        isSaving={false}
        onApply={onApply}
      />
    );

    expect(screen.getByText('Routing strategy')).toBeInTheDocument();
    expect(screen.getAllByText('round-robin').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /fill first/i }));
    fireEvent.click(screen.getByRole('button', { name: /use fill-first/i }));

    expect(onApply).toHaveBeenCalledWith('fill-first');
  });

  it('shows the error state and disables apply', () => {
    render(
      <RoutingGuidanceCard
        isLoading={false}
        isSaving={false}
        error={new Error('Remote CLIProxy is not reachable')}
        onApply={() => undefined}
      />
    );

    expect(screen.getByText('Remote CLIProxy is not reachable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /use round-robin/i })).toBeDisabled();
  });
});
