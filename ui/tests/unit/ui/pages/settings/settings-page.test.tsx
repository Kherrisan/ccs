import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@tests/setup/test-utils';

const mocks = vi.hoisted(() => ({
  useSettingsTab: vi.fn(),
  useRawConfig: vi.fn(),
  setActiveTab: vi.fn(),
  fetchRawConfig: vi.fn(),
  copyToClipboard: vi.fn(),
}));

vi.mock('@/pages/settings/hooks', () => ({
  useSettingsTab: mocks.useSettingsTab,
  useRawConfig: mocks.useRawConfig,
}));

vi.mock('react-resizable-panels', () => ({
  PanelGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PanelResizeHandle: () => <div data-testid="panel-resize-handle" />,
}));

vi.mock('@/components/shared/code-editor', () => ({
  CodeEditor: ({ value }: { value: string }) => (
    <textarea aria-label="config editor" readOnly value={value} />
  ),
}));

vi.mock('@/pages/settings/sections/websearch', () => ({
  default: () => <div>WebSearch Section</div>,
}));

vi.mock('@/pages/settings/sections/channels', () => ({
  default: () => <div>Channels Section</div>,
}));

vi.mock('@/pages/settings/sections/globalenv-section', () => ({
  default: () => <div>Global Env Section</div>,
}));

vi.mock('@/pages/settings/sections/thinking', () => ({
  default: () => <div>Thinking Section</div>,
}));

vi.mock('@/pages/settings/sections/proxy', () => ({
  default: () => <div>Proxy Section</div>,
}));

vi.mock('@/pages/settings/sections/auth-section', () => ({
  default: () => <div>Auth Section</div>,
}));

vi.mock('@/pages/settings/sections/backups-section', () => ({
  default: () => <div>Backups Section</div>,
}));

import { SettingsPage } from '@/pages/settings';

describe('SettingsPage raw config panel', () => {
  beforeEach(() => {
    mocks.setActiveTab.mockReset();
    mocks.fetchRawConfig.mockReset();
    mocks.copyToClipboard.mockReset();

    mocks.useSettingsTab.mockReturnValue({
      activeTab: 'websearch',
      setActiveTab: mocks.setActiveTab,
    });
  });

  it('keeps the current config editor visible while raw config refreshes', async () => {
    mocks.useRawConfig.mockReturnValue({
      rawConfig: 'websearch:\n  enabled: true\n',
      loading: true,
      copied: false,
      fetchRawConfig: mocks.fetchRawConfig,
      copyToClipboard: mocks.copyToClipboard,
    });

    render(<SettingsPage />);

    expect(await screen.findAllByText('WebSearch Section')).toHaveLength(2);
    expect(screen.getByLabelText('config editor')).toHaveValue('websearch:\n  enabled: true\n');
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });
});
