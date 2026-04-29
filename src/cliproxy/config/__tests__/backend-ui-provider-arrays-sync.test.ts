/**
 * Provider Sync Test
 *
 * Validates that backend CLIPROXY_PROFILES and UI CLIPROXY_PROVIDERS stay in sync.
 * This test catches mismatches when adding new providers.
 */

import { describe, expect, test } from 'bun:test';
import { CLIPROXY_PROFILES } from '../../../auth/profile-detector';
import { CLIPROXY_PROVIDERS } from '../../../../ui/src/lib/provider-config';

describe('Provider Sync', () => {
  test('backend CLIPROXY_PROFILES matches UI CLIPROXY_PROVIDERS', () => {
    const backend = [...CLIPROXY_PROFILES].sort();
    const ui = [...CLIPROXY_PROVIDERS].sort();

    expect(backend).toEqual(ui);
  });

  test('both arrays have same length', () => {
    expect(CLIPROXY_PROFILES.length).toBe(CLIPROXY_PROVIDERS.length);
  });

  test('UI array contains all backend providers', () => {
    for (const provider of CLIPROXY_PROFILES) {
      expect(CLIPROXY_PROVIDERS).toContain(provider);
    }
  });
});
