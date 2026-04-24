import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '@tests/setup/test-utils';

const hookState = vi.hoisted(() => ({
  catalogData: undefined as
    | {
        catalogs: Record<
          string,
          {
            provider: string;
            displayName: string;
            defaultModel: string;
            models: Array<{ id: string; name: string }>;
          }
        >;
      }
    | undefined,
}));

const applyDefaultPresetMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-cliproxy', () => ({
  useCliproxyAuth: () => ({
    data: {
      authStatus: [
        {
          provider: 'gemini',
          displayName: 'Gemini',
          authenticated: false,
          accounts: [],
        },
      ],
    },
    refetch: vi.fn(),
  }),
  useCliproxyCatalog: () => ({
    data: hookState.catalogData,
  }),
  useCreateVariant: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useStartAuth: () => ({
    isPending: false,
    mutate: (_args: unknown, options?: { onSuccess?: (data: Record<string, unknown>) => void }) => {
      options?.onSuccess?.({});
    },
  }),
  useCancelAuth: () => ({
    mutate: vi.fn(),
  }),
}));

vi.mock('@/lib/preset-utils', () => ({
  applyDefaultPreset: applyDefaultPresetMock,
}));

vi.mock('@/components/setup/wizard/steps/provider-step', () => ({
  ProviderStep: ({ onSelect }: { onSelect: (providerId: string) => void }) => (
    <button onClick={() => onSelect('gemini')}>choose-gemini</button>
  ),
}));

vi.mock('@/components/setup/wizard/steps/auth-step', () => ({
  AuthStep: ({ onStartAuth }: { onStartAuth: () => void }) => (
    <button onClick={onStartAuth}>start-auth</button>
  ),
}));

vi.mock('@/components/setup/wizard/steps/account-step', () => ({
  AccountStep: () => <div>account-step</div>,
}));

vi.mock('@/components/setup/wizard/steps/variant-step', () => ({
  VariantStep: () => <div>variant-step</div>,
}));

vi.mock('@/components/setup/wizard/steps/success-step', () => ({
  SuccessStep: () => <div>success-step</div>,
}));

import { QuickSetupWizard } from '@/components/setup/wizard';

describe('QuickSetupWizard preset catalog reuse', () => {
  beforeEach(() => {
    hookState.catalogData = undefined;
    applyDefaultPresetMock.mockReset();
    applyDefaultPresetMock.mockResolvedValue({ success: true, presetName: 'Gemini Pro' });
  });

  it('does not pass a synthesized static catalog before the catalog query resolves', async () => {
    render(<QuickSetupWizard open onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'choose-gemini' }));
    await userEvent.click(screen.getByRole('button', { name: 'start-auth' }));

    await waitFor(() =>
      expect(applyDefaultPresetMock).toHaveBeenCalledWith('gemini', undefined, undefined)
    );
  });

  it('passes the fetched provider catalog once the query has resolved', async () => {
    hookState.catalogData = {
      catalogs: {
        gemini: {
          provider: 'gemini',
          displayName: 'Gemini',
          defaultModel: 'gemini-3.9-pro-preview',
          models: [{ id: 'gemini-3.9-pro-preview', name: 'Gemini 3.9 Pro Preview' }],
        },
      },
    };

    render(<QuickSetupWizard open onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'choose-gemini' }));
    await userEvent.click(screen.getByRole('button', { name: 'start-auth' }));

    await waitFor(() =>
      expect(applyDefaultPresetMock).toHaveBeenCalledWith(
        'gemini',
        undefined,
        expect.objectContaining({
          defaultModel: 'gemini-3.9-pro-preview',
        })
      )
    );
  });
});
