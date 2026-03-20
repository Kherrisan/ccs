import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveLifecyclePort } from '../../../src/commands/cliproxy/proxy-lifecycle-subcommand';
import { CLIPROXY_DEFAULT_PORT } from '../../../src/cliproxy/config/port-manager';
import { runWithScopedConfigDir } from '../../../src/utils/config-manager';

let tempDir: string;

function writeUnifiedConfig(localPort: number): void {
  const configPath = path.join(tempDir, 'config.yaml');
  const yaml = `version: 2
accounts: {}
profiles: {}
preferences:
  theme: system
  telemetry: false
  auto_update: true
cliproxy:
  oauth_accounts: {}
  providers:
    - gemini
    - codex
    - agy
  variants: {}
cliproxy_server:
  local:
    port: ${localPort}
`;
  fs.writeFileSync(configPath, yaml, 'utf8');
}

describe('resolveLifecyclePort', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-proxy-lifecycle-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('uses configured cliproxy_server.local.port', async () => {
    writeUnifiedConfig(9456);
    await runWithScopedConfigDir(tempDir, () => {
      expect(resolveLifecyclePort()).toBe(9456);
    });
  });

  it('falls back to default port when configured local port is invalid', async () => {
    writeUnifiedConfig(70000);
    await runWithScopedConfigDir(tempDir, () => {
      expect(resolveLifecyclePort()).toBe(CLIPROXY_DEFAULT_PORT);
    });
  });

  it('falls back to default port when config file is missing', async () => {
    await runWithScopedConfigDir(tempDir, () => {
      expect(resolveLifecyclePort()).toBe(CLIPROXY_DEFAULT_PORT);
    });
  });
});
