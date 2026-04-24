import { describe, expect, it } from 'vitest';
import { readCodexMcpServers } from '@/lib/codex-config';

describe('readCodexMcpServers', () => {
  it('marks the CCS browser MCP entry as managed by Browser settings', () => {
    const entries = readCodexMcpServers({
      mcp_servers: {
        ccs_browser: {
          command: 'npx',
          args: ['-y', '@playwright/mcp@0.0.70'],
          enabled: true,
        },
        playwright: {
          command: 'npx',
          args: ['-y', '@playwright/mcp@latest'],
          enabled: true,
        },
      },
    });

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'ccs_browser',
          isCcsManaged: true,
          managementSurface: 'browser-settings',
        }),
        expect.objectContaining({
          name: 'playwright',
          isCcsManaged: false,
          managementSurface: null,
        }),
      ])
    );
  });
});
