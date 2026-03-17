import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

let calls: string[] = [];
let logLines: string[] = [];
let originalConsoleLog: typeof console.log;
let originalProcessExit: typeof process.exit;

beforeEach(() => {
  calls = [];
  logLines = [];
  originalConsoleLog = console.log;
  originalProcessExit = process.exit;

  console.log = (...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  };

  const uiModule = {
    initUI: async () => {},
    header: (message: string) => message,
    subheader: (message: string) => message,
    color: (message: string) => message,
    dim: (message: string) => message,
    ok: (message: string) => message,
    info: (message: string) => message,
    warn: (message: string) => message,
    fail: (message: string) => message,
  };
  mock.module('../../../src/utils/ui', () => uiModule);
  mock.module('../../../src/utils/ui.ts', () => uiModule);

  mock.module('../../../src/commands/config-auth/setup-command', () => ({
    handleSetup: async () => {
      calls.push('setup');
    },
  }));

  mock.module('../../../src/commands/config-auth/show-command', () => ({
    handleShow: async () => {
      calls.push('show');
    },
  }));

  mock.module('../../../src/commands/config-auth/disable-command', () => ({
    handleDisable: async () => {
      calls.push('disable');
    },
  }));
});

afterEach(() => {
  console.log = originalConsoleLog;
  process.exit = originalProcessExit;
  mock.restore();
});

async function loadHandleConfigAuthCommand() {
  const mod = await import(
    `../../../src/commands/config-auth?test=${Date.now()}-${Math.random()}`
  );
  return mod.handleConfigAuthCommand;
}

describe('config-auth command routing', () => {
  it('routes the status alias to show', async () => {
    const handleConfigAuthCommand = await loadHandleConfigAuthCommand();

    await handleConfigAuthCommand(['status']);

    expect(calls).toEqual(['show']);
  });

  it('keeps auth help available', async () => {
    const handleConfigAuthCommand = await loadHandleConfigAuthCommand();

    await handleConfigAuthCommand(['--help']);

    expect(calls).toEqual([]);
    expect(logLines.join('\n')).toContain('Dashboard Auth Management');
  });

  it('rejects trailing arguments for zero-arg subcommands', async () => {
    const handleConfigAuthCommand = await loadHandleConfigAuthCommand();
    process.exit = ((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as typeof process.exit;

    await expect(handleConfigAuthCommand(['disable', 'now'])).rejects.toThrow('process.exit(1)');

    expect(calls).toEqual([]);
    expect(logLines.join('\n')).toContain('Unexpected arguments for "config auth disable": now');
  });
});
