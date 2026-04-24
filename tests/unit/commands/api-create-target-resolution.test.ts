import { describe, expect, it } from 'bun:test';

import { resolvePresetDefaultTarget } from '../../../src/commands/api-command/create-command';

describe('api create target resolution', () => {
  it('uses the preset default target when no explicit target is provided', () => {
    expect(resolvePresetDefaultTarget({ defaultTarget: 'droid' }, undefined)).toBe('droid');
  });

  it('lets an explicit target override the preset default target', () => {
    expect(resolvePresetDefaultTarget({ defaultTarget: 'droid' }, 'claude')).toBe('claude');
  });

  it('returns null when neither an explicit target nor a preset default exists', () => {
    expect(resolvePresetDefaultTarget(null, undefined)).toBeNull();
  });
});
