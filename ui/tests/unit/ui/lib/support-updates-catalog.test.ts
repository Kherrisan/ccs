import { describe, expect, it } from 'vitest';
import { CLI_SUPPORT_ENTRIES, SUPPORT_NOTICES } from '@/lib/support-updates-catalog';

describe('support-updates catalog codex routing', () => {
  it('routes the Codex runtime notice to the Codex dashboard', () => {
    const notice = SUPPORT_NOTICES.find((entry) => entry.id === 'codex-target-runtime-support');

    expect(notice).toBeDefined();
    expect(notice?.routes).toContainEqual({ label: 'Codex CLI', path: '/codex' });
    expect(notice?.actions).toContainEqual(
      expect.objectContaining({
        id: 'open-codex-dashboard',
        type: 'route',
        path: '/codex',
      })
    );
  });

  it('routes the Codex target entry to the Codex dashboard', () => {
    const entry = CLI_SUPPORT_ENTRIES.find((item) => item.id === 'codex-target');

    expect(entry).toBeDefined();
    expect(entry?.routes).toEqual([{ label: 'Codex CLI', path: '/codex' }]);
  });
});
