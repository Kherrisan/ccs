import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

async function loadTokensCommand() {
  return await import(
    `../../../src/commands/tokens-command?test=${Date.now()}-${Math.random()}`
  );
}

async function loadCliproxyModule() {
  return await import(`../../../src/cliproxy?test=${Date.now()}-${Math.random()}`);
}

async function loadUnifiedConfigModule() {
  return await import(
    `../../../src/config/unified-config-loader?test=${Date.now()}-${Math.random()}`
  );
}

describe('tokens command auth rotation', () => {
  let tempHome = '';
  let logLines: string[] = [];
  let errorLines: string[] = [];
  let originalCcsHome: string | undefined;
  let originalNoColor: string | undefined;
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-tokens-rotation-'));
    logLines = [];
    errorLines = [];
    originalCcsHome = process.env.CCS_HOME;
    originalNoColor = process.env.NO_COLOR;
    originalConsoleLog = console.log;
    originalConsoleError = console.error;

    process.env.CCS_HOME = tempHome;
    process.env.NO_COLOR = '1';
    console.log = (...args: unknown[]) => {
      logLines.push(args.map(String).join(' '));
    };
    console.error = (...args: unknown[]) => {
      errorLines.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
    else delete process.env.CCS_HOME;

    if (originalNoColor !== undefined) process.env.NO_COLOR = originalNoColor;
    else delete process.env.NO_COLOR;

    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('applies api-key and regenerated secret in a single invocation', async () => {
    const { handleTokensCommand } = await loadTokensCommand();
    const { getCliproxyConfigPath } = await loadCliproxyModule();
    const { loadUnifiedConfig } = await loadUnifiedConfigModule();

    const exitCode = await handleTokensCommand([
      '--api-key',
      'ccs-custom-key-123',
      '--regenerate-secret',
    ]);

    expect(exitCode).toBe(0);
    expect(errorLines).toHaveLength(0);
    expect(logLines.some((line) => line.includes('New management secret generated'))).toBe(true);
    expect(logLines.some((line) => line.includes('Global API key updated'))).toBe(true);
    expect(logLines.filter((line) => line.includes('CLIProxy config regenerated'))).toHaveLength(1);

    const config = loadUnifiedConfig();
    const managementSecret = config?.cliproxy.auth?.management_secret;
    expect(config?.cliproxy.auth?.api_key).toBe('ccs-custom-key-123');
    expect(typeof managementSecret).toBe('string');
    expect((managementSecret ?? '').length).toBeGreaterThan(20);

    const cliproxyConfig = fs.readFileSync(getCliproxyConfigPath(), 'utf8');
    expect(cliproxyConfig).toContain('"ccs-custom-key-123"');
  });

  it('rejects conflicting manual and generated secret flags', async () => {
    const { handleTokensCommand } = await loadTokensCommand();
    const { getConfigYamlPath } = await loadUnifiedConfigModule();

    const exitCode = await handleTokensCommand([
      '--secret',
      'manual-secret',
      '--regenerate-secret',
    ]);

    expect(exitCode).toBe(1);
    expect(
      errorLines.some((line) => line.includes('Cannot combine --secret with --regenerate-secret'))
    ).toBe(true);
    expect(fs.existsSync(getConfigYamlPath())).toBe(false);
  });
});
