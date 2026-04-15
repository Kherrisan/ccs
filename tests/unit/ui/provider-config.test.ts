import { describe, expect, it } from 'bun:test';
import {
  getDeviceCodeProviderInstruction,
  getProviderDisplayName,
} from '../../../ui/src/lib/provider-config';

describe('provider-config fallbacks', () => {
  it('uses translated fallback copy for unknown providers', () => {
    expect(getProviderDisplayName('not-a-provider')).toBe('Unknown provider: not-a-provider');
    expect(getProviderDisplayName(undefined)).toBe('Unknown provider: unknown');
  });

  it('uses translated default device-code guidance for unknown providers', () => {
    expect(getDeviceCodeProviderInstruction('not-a-provider')).toBe(
      'Complete the authorization in your browser.'
    );
  });
});
