import { describe, expect, it } from 'vitest';
import { getPresetById, resolvePresetApiKeyValue } from '@/lib/provider-presets';

describe('resolvePresetApiKeyValue', () => {
  it('keeps an explicit API key when one is provided', () => {
    const preset = getPresetById('llamacpp');
    expect(resolvePresetApiKeyValue(preset, 'custom-token')).toBe('custom-token');
  });

  it('uses the local-provider sentinel for Ollama when no API key is provided', () => {
    const preset = getPresetById('ollama');
    expect(resolvePresetApiKeyValue(preset, '')).toBe('ollama');
  });

  it('uses the local-provider sentinel for llama.cpp when no API key is provided', () => {
    const preset = getPresetById('llamacpp');
    expect(resolvePresetApiKeyValue(preset, '')).toBe('llamacpp');
  });

  it('returns an empty string for API-key providers when input is empty', () => {
    const preset = getPresetById('openrouter');
    expect(resolvePresetApiKeyValue(preset, '')).toBe('');
  });
});
