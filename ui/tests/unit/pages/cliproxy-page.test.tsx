import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent } from '@tests/setup/test-utils';

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

vi.mock('@/hooks/use-cliproxy', () => ({
  useCliproxy: () => ({
    data: { variants: [] },
    isFetching: false,
  }),
  useCliproxyAuth: () => ({
    data: {
      authStatus: [
        {
          provider: 'gemini',
          displayName: 'Gemini',
          authenticated: true,
          accounts: [{ id: 'acct-1', provider: 'gemini' }],
        },
      ],
      source: 'local',
    },
    isLoading: false,
  }),
  useCliproxyCatalog: () => ({
    data: hookState.catalogData,
  }),
  useCliproxyUpdateCheck: () => ({
    data: undefined,
  }),
  useSetDefaultAccount: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveAccount: () => ({ mutate: vi.fn(), isPending: false }),
  usePauseAccount: () => ({ mutate: vi.fn(), isPending: false }),
  useResumeAccount: () => ({ mutate: vi.fn(), isPending: false }),
  useSoloAccount: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkPauseAccounts: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkResumeAccounts: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteVariant: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/components/quick-setup-wizard', () => ({
  QuickSetupWizard: () => null,
}));

vi.mock('@/components/monitoring/proxy-status-widget', () => ({
  ProxyStatusWidget: () => null,
}));

vi.mock('@/components/account/account-safety-warning-card', () => ({
  AccountSafetyWarningCard: () => null,
}));

vi.mock('@/components/cliproxy/provider-logo', () => ({
  ProviderLogo: () => <div>provider-logo</div>,
}));

vi.mock('@/components/cliproxy/provider-editor', () => ({
  ProviderEditor: ({ onAddAccount }: { onAddAccount: () => void }) => (
    <button onClick={onAddAccount}>open-add-account</button>
  ),
}));

vi.mock('@/components/account/add-account-dialog', () => ({
  AddAccountDialog: ({ open, catalog }: { open: boolean; catalog?: { defaultModel?: string } }) =>
    open ? (
      <div data-testid="add-account-dialog" data-catalog={catalog?.defaultModel ?? 'missing'} />
    ) : null,
}));

import { CliproxyPage } from '@/pages/cliproxy';

describe('CliproxyPage add-account catalog gating', () => {
  beforeEach(() => {
    hookState.catalogData = undefined;
  });

  it('does not pass a static fallback catalog before the catalog query resolves', async () => {
    render(<CliproxyPage />);

    await userEvent.click(screen.getByRole('button', { name: 'open-add-account' }));

    expect(screen.getByTestId('add-account-dialog')).toHaveAttribute('data-catalog', 'missing');
  });

  it('passes the fetched provider catalog after the catalog query resolves', async () => {
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

    render(<CliproxyPage />);

    await userEvent.click(screen.getByRole('button', { name: 'open-add-account' }));

    expect(screen.getByTestId('add-account-dialog')).toHaveAttribute(
      'data-catalog',
      'gemini-3.9-pro-preview'
    );
  });
});
