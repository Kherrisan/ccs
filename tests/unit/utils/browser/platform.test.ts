import { describe, expect, it } from 'bun:test';
import { getNodePlatformKey } from '../../../../src/utils/browser/platform';

describe('browser platform helper', () => {
  it('maps darwin explicitly', () => {
    expect(getNodePlatformKey('darwin')).toBe('darwin');
  });

  it('maps win32 explicitly', () => {
    expect(getNodePlatformKey('win32')).toBe('win32');
  });

  it('falls back to linux for other node platforms', () => {
    expect(getNodePlatformKey('linux')).toBe('linux');
    expect(getNodePlatformKey('freebsd')).toBe('linux');
  });
});
