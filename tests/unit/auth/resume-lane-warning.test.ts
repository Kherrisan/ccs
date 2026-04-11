import { describe, expect, it } from 'bun:test';
import { maybeWarnAboutResumeLaneMismatch } from '../../../src/auth/resume-lane-warning';

describe('resume lane warning', () => {
  it('prints guidance when the plain ccs lane differs from the account lane', async () => {
    const logs: string[] = [];

    await maybeWarnAboutResumeLaneMismatch('work', '/tmp/account-lane', ['--resume'], {
      log: (message) => logs.push(message),
      resolvePlainLane: async () => ({
        kind: 'native',
        label: 'native Claude lane',
        configDir: '/tmp/native-lane',
        projectCount: 12,
      }),
    });

    expect(logs[0]).toContain('Resume for account "work" will search that account lane');
    expect(logs).toContain('[i]   Account lane: /tmp/account-lane');
    expect(logs).toContain('[i]   Plain ccs lane: native Claude lane (/tmp/native-lane)');
    expect(logs).toContain('[i]   Recover the original lane first: ccs -r');
  });

  it('does not log anything when resume is not requested', async () => {
    const logs: string[] = [];

    await maybeWarnAboutResumeLaneMismatch('work', '/tmp/account-lane', ['hello'], {
      log: (message) => logs.push(message),
      resolvePlainLane: async () => {
        throw new Error('should not be called');
      },
    });

    expect(logs).toHaveLength(0);
  });

  it('swallows diagnostic failures and keeps the warning path non-fatal', async () => {
    const logs: string[] = [];

    await expect(
      maybeWarnAboutResumeLaneMismatch('work', '/tmp/account-lane', ['-r'], {
        debug: true,
        log: (message) => logs.push(message),
        resolvePlainLane: async () => {
          throw new Error('broken config');
        },
      })
    ).resolves.toBeUndefined();

    expect(logs[0]).toContain('Resume lane guidance skipped because diagnostics failed');
    expect(logs[1]).toContain('Diagnostic error: broken config');
  });
});
