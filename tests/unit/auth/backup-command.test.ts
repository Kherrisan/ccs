import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import ProfileRegistry from '../../../src/auth/profile-registry';
import { InstanceManager } from '../../../src/management/instance-manager';
import { handleBackup } from '../../../src/auth/commands/backup-command';

describe('auth backup command', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;
  let originalUnified: string | undefined;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-auth-backup-'));
    originalCcsHome = process.env.CCS_HOME;
    originalUnified = process.env.CCS_UNIFIED_CONFIG;
    process.env.CCS_HOME = tempHome;
    process.env.CCS_UNIFIED_CONFIG = '1';
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
    else delete process.env.CCS_HOME;

    if (originalUnified !== undefined) process.env.CCS_UNIFIED_CONFIG = originalUnified;
    else delete process.env.CCS_UNIFIED_CONFIG;

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  function writeConfig(): void {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 12',
        'accounts:',
        '  work:',
        '    created: "2026-04-04T00:00:00.000Z"',
        '    context_mode: shared',
        '    context_group: default',
        '    continuity_mode: deeper',
        'profiles: {}',
        'cliproxy:',
        '  oauth_accounts: {}',
        '  providers: {}',
        '  variants: {}',
      ].join('\n'),
      'utf8'
    );
  }

  it('creates a JSON backup for an auth account continuity lane', async () => {
    writeConfig();
    const instanceMgr = new InstanceManager();
    const registry = new ProfileRegistry();
    const instancePath = await instanceMgr.ensureInstance('work', {
      mode: 'shared',
      group: 'default',
      continuityMode: 'deeper',
    });

    fs.mkdirSync(path.join(instancePath, 'projects', 'demo-project'), { recursive: true });
    fs.writeFileSync(
      path.join(instancePath, 'projects', 'demo-project', 'history.jsonl'),
      '{}\n',
      'utf8'
    );
    fs.writeFileSync(path.join(instancePath, 'todos', 'todo.md'), '- keep this\n', 'utf8');

    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
    try {
      await handleBackup(
        {
          registry,
          instanceMgr,
          version: 'test',
        },
        ['work', '--json']
      );
    } finally {
      consoleSpy.mockRestore();
    }

    const backupBase = path.join(tempHome, '.ccs', 'backups', 'auth-continuity', 'work');
    const [latestBackupDir] = fs.readdirSync(backupBase).sort().reverse();
    expect(latestBackupDir).toBeTruthy();
    const backupPath = path.join(backupBase, latestBackupDir as string);
    expect(fs.existsSync(path.join(backupPath, 'manifest.json'))).toBe(true);
    expect(
      fs.existsSync(path.join(backupPath, 'projects', 'demo-project', 'history.jsonl'))
    ).toBe(true);
    expect(fs.existsSync(path.join(backupPath, 'todos', 'todo.md'))).toBe(true);
  });
});
