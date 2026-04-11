import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

let logLines: string[] = [];
let spawnCalls: Array<{ command: string; args: string[]; env?: NodeJS.ProcessEnv }> = [];
let exitCodes: number[] = [];
let stateReads = 0;
let originalConsoleLog: typeof console.log;
let originalProcessExit: typeof process.exit;
let updateCheckResult:
  | { status: 'update_available'; current: string; latest: string }
  | { status: 'no_update' }
  | { status: 'check_failed'; message: string };
let currentInstallOverride = installDescriptor();

type Scenario = {
  beforeState: {
    version: string | null;
    packageJsonMtimeMs: number | null;
    scriptMtimeMs: number | null;
  };
  afterState: {
    version: string | null;
    packageJsonMtimeMs: number | null;
    scriptMtimeMs: number | null;
  };
};

let scenario: Scenario;

function installDescriptor() {
  return {
    manager: 'npm' as const,
    scriptPath: '/tmp/ccs-prefix/bin/ccs',
    resolvedScriptPath: '/tmp/ccs-prefix/lib/node_modules/@kaitranntt/ccs/dist/ccs.js',
    packageRoot: '/tmp/ccs-prefix/lib/node_modules/@kaitranntt/ccs',
    prefix: '/tmp/ccs-prefix',
    detectionSource: 'path' as const,
  };
}

beforeEach(() => {
  logLines = [];
  spawnCalls = [];
  exitCodes = [];
  stateReads = 0;
  scenario = {
    beforeState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
    afterState: { version: '7.67.0-dev.9', packageJsonMtimeMs: 200, scriptMtimeMs: 200 },
  };
  updateCheckResult = {
    status: 'update_available',
    current: '7.67.0-dev.5',
    latest: '7.67.0-dev.9',
  };
  currentInstallOverride = installDescriptor();

  originalConsoleLog = console.log;
  originalProcessExit = process.exit;

  console.log = (...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  };

  process.exit = ((code?: number) => {
    exitCodes.push(code ?? 0);
    throw new Error(`process.exit(${code ?? 0})`);
  }) as typeof process.exit;

  mock.module('child_process', () => ({
    spawn: (command: string, args: string[], options?: { env?: NodeJS.ProcessEnv }) => {
      spawnCalls.push({ command, args, env: options?.env });
      return {
        on: (event: string, callback: (code?: number) => void) => {
          if (event === 'exit') {
            callback(0);
          }
        },
      };
    },
  }));

  mock.module('../../../src/utils/ui', () => ({
    initUI: async () => {},
    header: (value: string) => value,
    ok: (value: string) => `[OK] ${value}`,
    fail: (value: string) => `[X] ${value}`,
    warn: (value: string) => `[!] ${value}`,
    info: (value: string) => `[i] ${value}`,
    color: (value: string) => value,
  }));

  mock.module('../../../src/utils/version', () => ({
    getVersion: () => '7.67.0-dev.5',
  }));

  mock.module('../../../src/utils/update-checker', () => ({
    compareVersionsWithPrerelease: (left: string, right: string) => left.localeCompare(right),
    checkForUpdates: async () => updateCheckResult,
  }));

  mock.module('../../../src/utils/package-manager-detector', () => ({
    detectCurrentInstall: () => currentInstallOverride,
    buildPackageManagerEnv: () => {
      if (currentInstallOverride.manager === 'npm') {
        return {
          PATH: '/usr/bin',
          npm_config_prefix: '/tmp/ccs-prefix',
          NPM_CONFIG_PREFIX: '/tmp/ccs-prefix',
        };
      }

      if (currentInstallOverride.manager === 'bun') {
        return { PATH: '/usr/bin', BUN_INSTALL: '/tmp/bun-prefix' };
      }

      if (currentInstallOverride.manager === 'yarn') {
        return { PATH: '/usr/bin', YARN_GLOBAL_FOLDER: '/tmp/yarn-prefix' };
      }

      return { PATH: '/usr/bin', PNPM_HOME: '/tmp/pnpm-prefix' };
    },
    formatManualUpdateCommand: () => {
      if (currentInstallOverride.manager === 'npm') {
        return 'NPM_CONFIG_PREFIX=/tmp/ccs-prefix npm install -g @kaitranntt/ccs@dev';
      }

      if (currentInstallOverride.manager === 'bun') {
        return 'BUN_INSTALL=/tmp/bun-prefix bun add -g @kaitranntt/ccs@dev';
      }

      if (currentInstallOverride.manager === 'yarn') {
        return 'YARN_GLOBAL_FOLDER=/tmp/yarn-prefix yarn global add @kaitranntt/ccs@dev';
      }

      return 'PNPM_HOME=/tmp/pnpm-prefix pnpm add -g @kaitranntt/ccs@dev';
    },
    readInstalledPackageState: () => {
      stateReads += 1;
      return stateReads === 1 ? scenario.beforeState : scenario.afterState;
    },
  }));
});

afterEach(() => {
  console.log = originalConsoleLog;
  process.exit = originalProcessExit;
  mock.restore();
});

async function loadHandleUpdateCommand() {
  const mod = await import(
    `../../../src/commands/update-command?test=${Date.now()}-${Math.random()}`
  );
  return mod.handleUpdateCommand;
}

describe('update-command current install handling', () => {
  it('updates through the current install manager and prefix', async () => {
    const handleUpdateCommand = await loadHandleUpdateCommand();

    await expect(handleUpdateCommand({ beta: true })).rejects.toThrow('process.exit(0)');

    const installCall = spawnCalls.find((call) => call.args.includes('install'));

    expect(installCall?.command).toBe('npm');
    expect(installCall?.args).toEqual(['install', '-g', '@kaitranntt/ccs@dev']);
    expect(installCall?.env?.npm_config_prefix).toBe('/tmp/ccs-prefix');
  });

  it('fails when another manager updated elsewhere but the current binary stayed stale', async () => {
    scenario = {
      beforeState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
      afterState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
    };
    const handleUpdateCommand = await loadHandleUpdateCommand();

    await expect(handleUpdateCommand({ beta: true })).rejects.toThrow('process.exit(1)');

    expect(logLines.join('\n')).toContain('outside the current installation');
    expect(logLines.join('\n')).toContain(
      'NPM_CONFIG_PREFIX=/tmp/ccs-prefix npm install -g @kaitranntt/ccs@dev'
    );
  });

  it('keeps force mode under exact target-version verification', async () => {
    scenario = {
      beforeState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
      afterState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
    };
    const handleUpdateCommand = await loadHandleUpdateCommand();

    await expect(handleUpdateCommand({ force: true, beta: true })).rejects.toThrow(
      'process.exit(1)'
    );

    expect(logLines.join('\n')).toContain('outside the current installation');
  });

  it('fails force mode when target resolution says no update and the current install stays unchanged', async () => {
    scenario = {
      beforeState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
      afterState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
    };
    updateCheckResult = { status: 'no_update' };
    const handleUpdateCommand = await loadHandleUpdateCommand();

    await expect(handleUpdateCommand({ force: true, beta: true })).rejects.toThrow(
      'process.exit(1)'
    );

    expect(logLines.join('\n')).toContain('could not verify that the current installation changed');
  });

  it('fails force mode when target version resolution fails and the current install stays unchanged', async () => {
    scenario = {
      beforeState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
      afterState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
    };
    updateCheckResult = { status: 'check_failed', message: 'network' };
    const handleUpdateCommand = await loadHandleUpdateCommand();

    await expect(handleUpdateCommand({ force: true, beta: true })).rejects.toThrow(
      'process.exit(1)'
    );

    expect(logLines.join('\n')).toContain('could not verify that the current installation changed');
  });

  it('accepts a newer installed version when the dist-tag moves during update', async () => {
    scenario = {
      beforeState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
      afterState: { version: '7.67.1-dev.0', packageJsonMtimeMs: 200, scriptMtimeMs: 200 },
    };
    const handleUpdateCommand = await loadHandleUpdateCommand();

    await expect(handleUpdateCommand({ beta: true })).rejects.toThrow('process.exit(0)');

    expect(logLines.join('\n')).not.toContain('outside the current installation');
  });

  it('accepts force reinstall when the version stays the same but the current install files change', async () => {
    scenario = {
      beforeState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 100, scriptMtimeMs: 100 },
      afterState: { version: '7.67.0-dev.5', packageJsonMtimeMs: 200, scriptMtimeMs: 200 },
    };
    updateCheckResult = { status: 'no_update' };
    const handleUpdateCommand = await loadHandleUpdateCommand();

    await expect(handleUpdateCommand({ force: true, beta: true })).rejects.toThrow(
      'process.exit(0)'
    );

    expect(logLines.join('\n')).not.toContain(
      'could not verify that the current installation changed'
    );
  });

  it.each([
    ['bun', 'add', 'BUN_INSTALL', '/tmp/bun-prefix'],
    ['yarn', 'global', 'YARN_GLOBAL_FOLDER', '/tmp/yarn-prefix'],
    ['pnpm', 'add', 'PNPM_HOME', '/tmp/pnpm-prefix'],
  ])(
    'routes updates through the current %s install and env',
    async (manager, expectedArg, envKey, envValue) => {
      currentInstallOverride = {
        ...installDescriptor(),
        manager: manager as 'bun' | 'yarn' | 'pnpm',
        prefix: envValue,
      };

      const handleUpdateCommand = await loadHandleUpdateCommand();

      await expect(handleUpdateCommand({ beta: true })).rejects.toThrow('process.exit(0)');

      const updateCall = spawnCalls.find(
        (call) =>
          call.command === manager && call.args.some((arg) => arg.includes('@kaitranntt/ccs@dev'))
      );
      expect(updateCall?.args).toContain(expectedArg);
      expect(updateCall?.env?.[envKey]).toBe(envValue);
    }
  );
});
