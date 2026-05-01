import { describe, expect, it } from 'bun:test';
import { getPresetById, isValidPresetId } from '../../../src/api/services/provider-presets';

describe('provider-presets-novita', () => {
  it('resolves novita preset id', () => {
    const preset = getPresetById('novita');
    expect(preset?.id).toBe('novita');
    expect(preset?.baseUrl).toBe('https://api.novita.ai/anthropic');
    expect(preset?.defaultProfileName).toBe('novita');
  });

  it('resolves novita preset with expected model IDs', () => {
    const preset = getPresetById('novita');
    expect(preset?.defaultModel).toBe('deepseek/deepseek-v3.2');
  });

  it('validates novita preset requires API key', () => {
    const preset = getPresetById('novita');
    expect(preset?.requiresApiKey).toBe(true);
  });

  it('treats novita as a valid preset id', () => {
    expect(isValidPresetId('novita')).toBe(true);
  });

  it('handles whitespace in novita preset id', () => {
    const preset = getPresetById('  novita  ');
    expect(preset?.id).toBe('novita');
  });

  it('handles uppercase novita preset id', () => {
    const preset = getPresetById('NOVITA');
    expect(preset?.id).toBe('novita');
  });

  it('does not resolve partial or invalid novita ids', () => {
    expect(getPresetById('novita-invalid')).toBeUndefined();
    expect(isValidPresetId('novita-invalid')).toBe(false);
  });
});
