import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as browserInstaller from '../../../../src/utils/browser/mcp-installer';
import {
  ensureBrowserMcp,
  ensureBrowserMcpConfig,
  ensureBrowserMcpOrThrow,
  getBrowserMcpServerName,
  getBrowserMcpServerPath,
  syncBrowserMcpToConfigDir,
  uninstallBrowserMcp,
} from '../../../../src/utils/browser';

describe('ensureBrowserMcp', () => {
  let tempHome: string | undefined;
  let originalCcsHome: string | undefined;

  function setupTempHome(): string {
    const nextTempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-browser-mcp-'));
    tempHome = nextTempHome;
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = nextTempHome;
    return nextTempHome;
  }

  function getManagedConfig() {
    return {
      type: 'stdio',
      command: 'node',
      args: [getBrowserMcpServerPath()],
      env: {
        NODE_PATH: path.join(process.cwd(), 'node_modules'),
      },
    };
  }

  afterEach(() => {
    mock.restore();

    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }

    tempHome = undefined;
    originalCcsHome = undefined;
  });

  it('installs the bundled browser MCP server and preserves existing user mcpServers entries', () => {
    setupTempHome();

    const claudeUserConfigPath = path.join(tempHome as string, '.claude.json');
    fs.writeFileSync(
      claudeUserConfigPath,
      JSON.stringify(
        {
          mcpServers: {
            existing: { command: 'uvx', args: ['some-server'] },
          },
        },
        null,
        2
      ) + '\n',
      'utf8'
    );

    expect(ensureBrowserMcp()).toBe(true);
    expect(fs.existsSync(getBrowserMcpServerPath())).toBe(true);

    const config = JSON.parse(fs.readFileSync(claudeUserConfigPath, 'utf8')) as {
      mcpServers: Record<string, unknown>;
    };

    expect(config.mcpServers.existing).toEqual({ command: 'uvx', args: ['some-server'] });
    expect(config.mcpServers[getBrowserMcpServerName()]).toEqual(getManagedConfig());
  });

  it('preserves the existing ~/.claude.json permissions when provisioning browser MCP', () => {
    setupTempHome();

    const claudeUserConfigPath = path.join(tempHome as string, '.claude.json');
    fs.writeFileSync(claudeUserConfigPath, JSON.stringify({ existing: true }, null, 2) + '\n', {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.chmodSync(claudeUserConfigPath, 0o600);

    expect(ensureBrowserMcpConfig()).toBe(true);
    expect(fs.statSync(claudeUserConfigPath).mode & 0o777).toBe(0o600);
  });

  it('copies the bundled browser MCP artifact while preserving source permissions', () => {
    setupTempHome();

    const bundledServerPath = path.join(
      process.cwd(),
      'lib',
      'mcp',
      'ccs-browser-server.cjs'
    );
    const originalMode = fs.statSync(bundledServerPath).mode & 0o777;

    expect(ensureBrowserMcp()).toBe(true);
    expect(fs.statSync(getBrowserMcpServerPath()).mode & 0o777).toBe(originalMode);
  });

  it('reconciles installed browser MCP permissions when contents already match', () => {
    setupTempHome();

    const bundledServerPath = path.join(
      process.cwd(),
      'lib',
      'mcp',
      'ccs-browser-server.cjs'
    );
    const originalMode = fs.statSync(bundledServerPath).mode & 0o777;

    expect(ensureBrowserMcp()).toBe(true);
    fs.chmodSync(getBrowserMcpServerPath(), 0o600);

    expect(ensureBrowserMcp()).toBe(true);
    expect(fs.statSync(getBrowserMcpServerPath()).mode & 0o777).toBe(originalMode);
  });

  it('removes the managed browser runtime while preserving unrelated server entries', () => {
    setupTempHome();

    const claudeUserConfigPath = path.join(tempHome as string, '.claude.json');
    fs.writeFileSync(
      claudeUserConfigPath,
      JSON.stringify(
        {
          mcpServers: {
            existing: { command: 'uvx', args: ['some-server'] },
          },
        },
        null,
        2
      ) + '\n',
      'utf8'
    );

    expect(ensureBrowserMcp()).toBe(true);

    const instancePath = path.join(tempHome as string, '.ccs', 'instances', 'work');
    fs.mkdirSync(instancePath, { recursive: true });
    fs.writeFileSync(
      path.join(instancePath, '.claude.json'),
      JSON.stringify(
        {
          mcpServers: {
            existing: { command: 'uvx', args: ['instance-server'] },
            [getBrowserMcpServerName()]: { command: 'node', args: ['/tmp/override.cjs'] },
          },
          otherKey: 'keep-me',
        },
        null,
        2
      ) + '\n',
      'utf8'
    );

    expect(uninstallBrowserMcp()).toBe(true);
    expect(fs.existsSync(getBrowserMcpServerPath())).toBe(false);

    const globalConfig = JSON.parse(fs.readFileSync(claudeUserConfigPath, 'utf8')) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(globalConfig.mcpServers).toEqual({
      existing: { command: 'uvx', args: ['some-server'] },
    });

    const instanceConfig = JSON.parse(
      fs.readFileSync(path.join(instancePath, '.claude.json'), 'utf8')
    ) as {
      otherKey: string;
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(instanceConfig.otherKey).toBe('keep-me');
    expect(instanceConfig.mcpServers).toEqual({
      existing: { command: 'uvx', args: ['instance-server'] },
    });
  });

  it('syncs the managed browser MCP entry into an instance config dir', () => {
    setupTempHome();

    fs.writeFileSync(
      path.join(tempHome as string, '.claude.json'),
      JSON.stringify(
        {
          mcpServers: {
            [getBrowserMcpServerName()]: getManagedConfig(),
          },
        },
        null,
        2
      ) + '\n',
      'utf8'
    );

    const instancePath = path.join(tempHome as string, '.ccs', 'instances', 'work');
    fs.mkdirSync(instancePath, { recursive: true });

    expect(syncBrowserMcpToConfigDir(instancePath)).toBe(true);

    const instanceConfig = JSON.parse(
      fs.readFileSync(path.join(instancePath, '.claude.json'), 'utf8')
    ) as {
      mcpServers: Record<string, unknown>;
    };
    expect(instanceConfig.mcpServers[getBrowserMcpServerName()]).toEqual(getManagedConfig());
  });

  it('throws when the bundled browser MCP runtime cannot be prepared', () => {
    setupTempHome();

    const ensureSpy = spyOn(browserInstaller, 'ensureBrowserMcp').mockReturnValue(false);

    expect(() => ensureBrowserMcpOrThrow()).toThrow(
      'Browser MCP is enabled, but CCS could not prepare the local browser tool.'
    );
    expect(ensureSpy).toHaveBeenCalled();
  });
});
