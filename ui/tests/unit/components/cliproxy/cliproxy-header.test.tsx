import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../../setup/test-utils';

const hookMocks = vi.hoisted(() => ({
  startAuth: vi.fn(),
}));

vi.mock('@/hooks/use-cliproxy', () => ({
  useCliproxyAuth: () => ({
    data: {
      authStatus: [],
    },
  }),
  useCliproxyUpdateCheck: () => ({
    data: {
      backendLabel: 'CLIProxy Plus',
      currentVersion: '6.9.23-0',
      isStable: true,
      stabilityMessage: undefined,
    },
  }),
}));

vi.mock('@/hooks/use-cliproxy-auth-flow', () => ({
  useCliproxyAuthFlow: () => ({
    provider: null,
    isAuthenticating: false,
    startAuth: hookMocks.startAuth,
  }),
}));

import { CliproxyHeader } from '@/components/cliproxy/cliproxy-header';

describe('CliproxyHeader', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders version data from the shared update query without issuing a direct fetch', () => {
    render(
      <CliproxyHeader onRefresh={vi.fn()} isRefreshing={false} lastUpdated={new Date()} isRunning />
    );

    expect(screen.getByText('CLIProxy Plus')).toBeInTheDocument();
    expect(screen.getByText('v6.9.23-0')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
