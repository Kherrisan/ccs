import { describe, expect, it } from 'vitest';
import { getClientPlatformKey } from '@/lib/platform';

describe('getClientPlatformKey', () => {
  it('prefers navigator.userAgentData.platform when available', () => {
    expect(
      getClientPlatformKey({
        userAgentData: { platform: 'macOS' },
        platform: 'Win32',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      })
    ).toBe('darwin');
  });

  it('falls back to navigator.platform when userAgentData is unavailable', () => {
    expect(
      getClientPlatformKey({
        platform: 'Win32',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
      })
    ).toBe('win32');
  });

  it('falls back to user-agent parsing when platform is unavailable', () => {
    expect(
      getClientPlatformKey({
        platform: '',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      })
    ).toBe('win32');
  });
});
