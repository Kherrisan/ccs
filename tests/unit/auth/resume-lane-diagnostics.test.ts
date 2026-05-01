import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  parseResumeFlagIntent,
  resolveConfiguredPlainCcsResumeLane,
} from '../../../src/auth/resume-lane-diagnostics';

describe('resume lane diagnostics', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;
  let originalUnified: string | undefined;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-resume-lane-'));
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

  function writeConfig(lines: string[]): void {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(path.join(ccsDir, 'config.yaml'), `${lines.join('\n')}\n`, 'utf8');
  }

  it('parses implicit and explicit resume flags', () => {
    expect(parseResumeFlagIntent(['-r'])).toEqual({ implicit: true });
    expect(parseResumeFlagIntent(['--resume'])).toEqual({ implicit: true });
    expect(parseResumeFlagIntent(['--resume', 'abc123'])).toEqual({
      implicit: false,
      explicitSessionId: 'abc123',
    });
    expect(parseResumeFlagIntent(['--resume=xyz'])).toEqual({
      implicit: false,
      explicitSessionId: 'xyz',
    });
    expect(parseResumeFlagIntent(['hello'])).toBeNull();
  });

  it('defaults to the native lane when no account/default mapping exists', async () => {
    writeConfig([
      'version: 12',
      'accounts: {}',
      'profiles: {}',
      'cliproxy:',
      '  oauth_accounts: {}',
      '  providers: {}',
      '  variants: {}',
    ]);

    const lane = await resolveConfiguredPlainCcsResumeLane();
    expect(lane.kind).toBe('native');
    expect(lane.configDir).toBe(path.join(tempHome, '.claude'));
  });

  it('resolves the plain ccs lane to a default account when configured', async () => {
    writeConfig([
      'version: 12',
      'default: work',
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
    ]);

    const lane = await resolveConfiguredPlainCcsResumeLane();
    expect(lane.kind).toBe('account-default');
    expect(lane.accountName).toBe('work');
    expect(lane.configDir).toBe(path.join(tempHome, '.ccs', 'instances', 'work'));
  });

  it('resolves the plain ccs lane to inherited account continuity when configured', async () => {
    writeConfig([
      'version: 12',
      'accounts:',
      '  work:',
      '    created: "2026-04-04T00:00:00.000Z"',
      '    context_mode: shared',
      '    context_group: default',
      '    continuity_mode: deeper',
      'profiles: {}',
      'continuity:',
      '  inherit_from_account:',
      '    default: work',
      'cliproxy:',
      '  oauth_accounts: {}',
      '  providers: {}',
      '  variants: {}',
    ]);

    const lane = await resolveConfiguredPlainCcsResumeLane();
    expect(lane.kind).toBe('account-inherited');
    expect(lane.accountName).toBe('work');
    expect(lane.configDir).toBe(path.join(tempHome, '.ccs', 'instances', 'work'));
  });

  it('resolves a non-account default profile through continuity inheritance', async () => {
    writeConfig([
      'version: 12',
      'default: glm',
      'accounts:',
      '  work:',
      '    created: "2026-04-04T00:00:00.000Z"',
      'profiles:',
      '  glm:',
      '    type: api',
      '    settings: ~/.ccs/glm.settings.json',
      'continuity:',
      '  inherit_from_account:',
      '    glm: work',
      'cliproxy:',
      '  oauth_accounts: {}',
      '  providers: {}',
      '  variants: {}',
    ]);

    const lane = await resolveConfiguredPlainCcsResumeLane();
    expect(lane.kind).toBe('account-inherited');
    expect(lane.accountName).toBe('work');
  });
});
