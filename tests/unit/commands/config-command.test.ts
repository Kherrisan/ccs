import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

const startServerCalls: Array<Record<string, unknown>> = [];
const configAuthCalls: string[][] = [];
let logLines: string[] = [];
let errorLines: string[] = [];
let dashboardAuthEnabled = false;
let startServerError: Error | null = null;
let mockServerBindHost = '::';
let originalConsoleLog: typeof console.log;
let originalConsoleError: typeof console.error;
let originalProcessExit: typeof process.exit;

beforeEach(() => {
  startServerCalls.length = 0;
  configAuthCalls.length = 0;
  logLines = [];
  errorLines = [];
  dashboardAuthEnabled = false;
  startServerError = null;
  mockServerBindHost = '::';

  originalConsoleLog = console.log;
  originalConsoleError = console.error;
  originalProcessExit = process.exit;

  console.log = (...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    errorLines.push(args.map(String).join(' '));
  };

  mock.module('get-port', () => ({
    default: async () => 3000,
  }));

  mock.module('open', () => ({
    default: async () => undefined,
  }));

  mock.module('../../../src/web-server', () => ({
    startServer: async (options: Record<string, unknown>) => {
      startServerCalls.push({ ...options });
      if (startServerError) {
        throw startServerError;
      }
      return {
        server: {
          address: () => ({ address: mockServerBindHost }),
        } as never,
        wss: {} as never,
        cleanup: () => {},
      };
    },
  }));

  mock.module('../../../src/web-server/shutdown', () => ({
    setupGracefulShutdown: () => {},
  }));

  mock.module('../../../src/cliproxy/service-manager', () => ({
    ensureCliproxyService: async () => ({
      started: true,
      alreadyRunning: true,
      port: 8317,
      configRegenerated: false,
    }),
  }));

  mock.module('../../../src/cliproxy/config-generator', () => ({
    CLIPROXY_DEFAULT_PORT: 8317,
  }));

  mock.module('../../../src/config/unified-config-loader', () => ({
    getDashboardAuthConfig: () => ({
      enabled: dashboardAuthEnabled,
    }),
  }));

  const uiModule = {
    initUI: async () => {},
    header: (message: string) => message,
    ok: (message: string) => message,
    info: (message: string) => message,
    warn: (message: string) => message,
    fail: (message: string) => message,
  };
  mock.module('../../../src/utils/ui', () => uiModule);
  mock.module('../../../src/utils/ui.ts', () => uiModule);

  mock.module('../../../src/commands/config-auth', () => ({
    handleConfigAuthCommand: async (args: string[]) => {
      configAuthCalls.push([...args]);
    },
  }));
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  process.exit = originalProcessExit;
  mock.restore();
});

async function loadHandleConfigCommand() {
  const mod = await import(
    `../../../src/commands/config-command?test=${Date.now()}-${Math.random()}`
  );
  return mod.handleConfigCommand;
}

describe('config command dashboard startup', () => {
  it('shows help for literal help token instead of starting the dashboard', async () => {
    const handleConfigCommand = await loadHandleConfigCommand();
    process.exit = ((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as typeof process.exit;

    await expect(handleConfigCommand(['help'])).rejects.toThrow('process.exit(0)');

    expect(startServerCalls).toHaveLength(0);
    expect(logLines.join('\n')).toContain('Usage: ccs config [command] [options]');
  });

  it('routes auth subcommands before dashboard startup', async () => {
    const handleConfigCommand = await loadHandleConfigCommand();

    await handleConfigCommand(['auth', 'setup']);

    expect(configAuthCalls).toEqual([['setup']]);
    expect(startServerCalls).toHaveLength(0);
  });

  it('rejects unknown config subcommands before dashboard startup', async () => {
    const handleConfigCommand = await loadHandleConfigCommand();
    process.exit = ((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as typeof process.exit;

    await expect(handleConfigCommand(['bogus'])).rejects.toThrow('process.exit(1)');

    expect(startServerCalls).toHaveLength(0);
    expect(errorLines.join('\n')).toContain('Unexpected arguments: bogus');
  });

  it('keeps the default startup path free of an explicit host override', async () => {
    const handleConfigCommand = await loadHandleConfigCommand();

    await handleConfigCommand([]);

    expect(startServerCalls).toHaveLength(1);
    expect(startServerCalls[0]).toEqual({ port: 3000, dev: false });

    const rendered = logLines.join('\n');
    expect(rendered).toContain('Dashboard: http://localhost:3000');
    expect(rendered).toContain('Bind host: ::');
    expect(rendered).toContain('Dashboard may be reachable from other devices that can connect to this machine.');
    expect(rendered).toContain('Protect it before sharing: ccs config auth setup');
    expect(errorLines).toHaveLength(0);
  });

  it('passes explicit wildcard hosts through and prints exposure guidance', async () => {
    const handleConfigCommand = await loadHandleConfigCommand();
    mockServerBindHost = '0.0.0.0';

    await handleConfigCommand(['--host', '0.0.0.0', '--port', '4100']);

    expect(startServerCalls).toHaveLength(1);
    expect(startServerCalls[0]).toEqual({ port: 4100, dev: false, host: '0.0.0.0' });

    const rendered = logLines.join('\n');
    expect(rendered).toContain('Dashboard: http://localhost:4100');
    expect(rendered).toContain('Bind host: 0.0.0.0');
    expect(rendered).toContain(
      'Dashboard may be reachable from other devices that can connect to this machine.'
    );
    expect(rendered).toContain('Protect it before sharing: ccs config auth setup');
    expect(errorLines).toHaveLength(0);
  });

  it('fails cleanly when the server cannot bind the requested host', async () => {
    const handleConfigCommand = await loadHandleConfigCommand();
    startServerError = new Error(
      'Unable to bind 192.0.2.123:4100; the address may be unavailable or the port may already be in use'
    );
    process.exit = ((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as typeof process.exit;

    await expect(handleConfigCommand(['--host', '192.0.2.123', '--port', '4100'])).rejects.toThrow(
      'process.exit(1)'
    );

    expect(errorLines.join('\n')).toContain(
      'Failed to start server: Unable to bind 192.0.2.123:4100; the address may be unavailable or the port may already be in use'
    );
  });
});
