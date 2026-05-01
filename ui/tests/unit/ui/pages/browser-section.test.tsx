import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent } from '@tests/setup/test-utils';

const mocks = vi.hoisted(() => ({
  useBrowserConfig: vi.fn(),
  useRawConfig: vi.fn(),
  fetchConfig: vi.fn(),
  fetchStatus: vi.fn(),
  saveConfig: vi.fn(),
  fetchRawConfig: vi.fn(),
}));

vi.mock('@/pages/settings/hooks', async () => {
  const actual =
    await vi.importActual<typeof import('@/pages/settings/hooks')>('@/pages/settings/hooks');
  return {
    ...actual,
    useBrowserConfig: mocks.useBrowserConfig,
    useRawConfig: mocks.useRawConfig,
  };
});

import BrowserSection from '@/pages/settings/sections/browser';

describe('BrowserSection', () => {
  beforeEach(() => {
    mocks.fetchConfig.mockReset();
    mocks.fetchStatus.mockReset();
    mocks.saveConfig.mockReset();
    mocks.fetchRawConfig.mockReset();

    mocks.useRawConfig.mockReturnValue({
      rawConfig: 'browser:\n  claude:\n    enabled: true\n',
      loading: false,
      copied: false,
      fetchRawConfig: mocks.fetchRawConfig,
      copyToClipboard: vi.fn(),
    });

    mocks.useBrowserConfig.mockReturnValue({
      config: {
        claude: {
          enabled: true,
          userDataDir: '/tmp/browser-profile',
          devtoolsPort: 9222,
        },
        codex: {
          enabled: true,
        },
      },
      status: {
        claude: {
          enabled: true,
          source: 'config',
          overrideActive: false,
          state: 'ready',
          title: 'Claude Browser Attach is ready.',
          detail: 'CCS can reach the configured Chrome DevTools endpoint.',
          nextStep: 'Launch Claude.',
          effectiveUserDataDir: '/tmp/browser-profile',
          recommendedUserDataDir: '/tmp/browser-profile',
          devtoolsPort: 9222,
          managedMcpServerName: 'ccs-browser',
          managedMcpServerPath: '/tmp/ccs-browser-server.cjs',
          launchCommands: {
            darwin:
              'open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="/tmp/browser-profile"',
            linux:
              'google-chrome --remote-debugging-port=9222 --user-data-dir="/tmp/browser-profile"',
            win32: 'chrome.exe --remote-debugging-port=9222 --user-data-dir="/tmp/browser-profile"',
          },
        },
        codex: {
          enabled: true,
          state: 'enabled',
          title: 'Codex Browser Tools are enabled.',
          detail: 'CCS can inject managed Playwright MCP overrides.',
          nextStep: 'Use a Codex-target launch.',
          serverName: 'ccs_browser',
          supportsConfigOverrides: true,
          binaryPath: '/usr/local/bin/codex',
          version: 'codex-cli 0.120.0',
        },
      },
      loading: false,
      statusLoading: false,
      saving: false,
      error: null,
      success: false,
      fetchConfig: mocks.fetchConfig,
      fetchStatus: mocks.fetchStatus,
      saveConfig: mocks.saveConfig,
    });
  });

  it('uses the current draft for launch guidance and disables testing until the draft is saved', async () => {
    render(<BrowserSection />, { withSettingsProvider: true });

    const pathInput = screen.getByLabelText('Chrome user-data directory');
    await userEvent.clear(pathInput);
    await userEvent.type(pathInput, '/tmp/new-browser-profile');

    const launchCommand = screen.getByText(/new-browser-profile/);
    expect(launchCommand).toBeInTheDocument();

    const testConnectionButton = screen.getByRole('button', { name: 'Test connection' });
    expect(testConnectionButton).toBeDisabled();
  });
});
