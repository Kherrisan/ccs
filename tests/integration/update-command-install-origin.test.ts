import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let tempRoot = '';
let currentPackageRoot = '';
let currentPrefix = '';
let bunPackageRoot = '';
let fakeBinDir = '';
let originalArgv1 = '';
let originalPath = '';
let originalConsoleLog: typeof console.log;
let originalProcessExit: typeof process.exit;
let logLines: string[] = [];
let exitCodes: number[] = [];

function writePackage(root: string, version: string): void {
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: '@kaitranntt/ccs', version }, null, 2)
  );
}

function readPackageVersion(root: string): string {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version as string;
}

function writeExecutable(filePath: string, contents: string): void {
  writeFileSync(filePath, contents);
  chmodSync(filePath, 0o755);
}

async function loadHandleUpdateCommand() {
  const mod = await import(`../../src/commands/update-command?test=${Date.now()}-${Math.random()}`);
  return mod.handleUpdateCommand;
}

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'ccs-update-origin-'));
  currentPrefix = join(tempRoot, 'prefix');
  currentPackageRoot = join(currentPrefix, 'lib', 'node_modules', '@kaitranntt', 'ccs');
  bunPackageRoot = join(
    tempRoot,
    '.bun',
    'install',
    'global',
    'node_modules',
    '@kaitranntt',
    'ccs'
  );
  fakeBinDir = join(tempRoot, 'bin');

  mkdirSync(join(currentPackageRoot, 'dist'), { recursive: true });
  mkdirSync(fakeBinDir, { recursive: true });
  writePackage(currentPackageRoot, '7.67.0-dev.5');
  writePackage(bunPackageRoot, '0.0.0-stale');

  originalArgv1 = process.argv[1] ?? '';
  process.argv[1] = join(currentPackageRoot, 'dist', 'ccs.js');

  originalPath = process.env.PATH ?? '';
  process.env.PATH = `${fakeBinDir}:${originalPath}`;

  logLines = [];
  exitCodes = [];
  originalConsoleLog = console.log;
  console.log = (...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  };

  originalProcessExit = process.exit;
  process.exit = ((code?: number) => {
    exitCodes.push(code ?? 0);
  }) as typeof process.exit;
});

afterEach(() => {
  console.log = originalConsoleLog;
  process.exit = originalProcessExit;
  process.argv[1] = originalArgv1;
  process.env.PATH = originalPath;
  if (tempRoot) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

async function waitForExitCode(expectedCode: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (exitCodes.includes(expectedCode)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`process.exit(${expectedCode}) was not observed`);
}

describe('update-command install origin integration', () => {
  it('updates the current npm-owned install instead of drifting to another manager', async () => {
    writeExecutable(
      join(fakeBinDir, 'npm'),
      `#!/bin/sh
if [ "$npm_config_prefix" = "${currentPrefix}" ] || [ "$NPM_CONFIG_PREFIX" = "${currentPrefix}" ]; then
  cat > "${join(currentPackageRoot, 'package.json')}" <<'EOF'
{"name":"@kaitranntt/ccs","version":"7.67.0-dev.9"}
EOF
  exit 0
fi
exit 13
`
    );

    writeExecutable(
      join(fakeBinDir, 'bun'),
      `#!/bin/sh
cat > "${join(bunPackageRoot, 'package.json')}" <<'EOF'
{"name":"@kaitranntt/ccs","version":"7.67.0-dev.9"}
EOF
exit 0
`
    );

    const handleUpdateCommand = await loadHandleUpdateCommand();

    await handleUpdateCommand(
      { beta: true },
      {
        initUI: async () => {},
        getVersion: () => '7.67.0-dev.5',
        compareVersionsWithPrerelease: (left: string, right: string) => left.localeCompare(right),
        checkForUpdates: async () => ({
          status: 'update_available',
          current: '7.67.0-dev.5',
          latest: '7.67.0-dev.9',
        }),
      }
    );
    await waitForExitCode(0);

    expect(readPackageVersion(currentPackageRoot)).toBe('7.67.0-dev.9');
    expect(readPackageVersion(bunPackageRoot)).toBe('0.0.0-stale');
    expect(logLines.join('\n')).toContain('Updating via npm');
  });

  it('fails if the update exits 0 but the current install stays stale', async () => {
    writeExecutable(
      join(fakeBinDir, 'npm'),
      `#!/bin/sh
exit 0
`
    );

    writeExecutable(
      join(fakeBinDir, 'bun'),
      `#!/bin/sh
cat > "${join(bunPackageRoot, 'package.json')}" <<'EOF'
{"name":"@kaitranntt/ccs","version":"7.67.0-dev.9"}
EOF
exit 0
`
    );

    const handleUpdateCommand = await loadHandleUpdateCommand();

    await handleUpdateCommand(
      { beta: true },
      {
        initUI: async () => {},
        getVersion: () => '7.67.0-dev.5',
        compareVersionsWithPrerelease: (left: string, right: string) => left.localeCompare(right),
        checkForUpdates: async () => ({
          status: 'update_available',
          current: '7.67.0-dev.5',
          latest: '7.67.0-dev.9',
        }),
      }
    );
    await waitForExitCode(1);

    expect(readPackageVersion(currentPackageRoot)).toBe('7.67.0-dev.5');
    expect(logLines.join('\n')).toContain('outside the current installation');
    expect(logLines.join('\n')).toContain('NPM_CONFIG_PREFIX=');
  });
});
