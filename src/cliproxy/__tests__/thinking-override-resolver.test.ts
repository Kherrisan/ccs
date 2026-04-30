import { describe, expect, it } from 'bun:test';
import type { ThinkingConfig } from '../../config/unified-config-types';
import {
  buildThinkingStartupStatus,
  parseEnvThinkingOverride,
  resolveRuntimeThinkingOverride,
  shouldDisableCodexReasoning,
} from '../executor/thinking-override-resolver';

const baseConfig: ThinkingConfig = {
  mode: 'auto',
  tier_defaults: {
    opus: 'high',
    sonnet: 'medium',
    haiku: 'low',
  },
  show_warnings: true,
};

describe('thinking-override-resolver', () => {
  it('parses env thinking values with CLI-compatible integer handling', () => {
    expect(parseEnvThinkingOverride(undefined)).toBeUndefined();
    expect(parseEnvThinkingOverride('   ')).toBeUndefined();
    expect(parseEnvThinkingOverride('8192')).toBe(8192);
    expect(parseEnvThinkingOverride(' OFF ')).toBe('off');
    expect(parseEnvThinkingOverride('bogus')).toBeUndefined();
    expect(parseEnvThinkingOverride('-1')).toBeUndefined();
    expect(parseEnvThinkingOverride('100001')).toBeUndefined();
  });

  it('resolves runtime priority as flag > env', () => {
    expect(resolveRuntimeThinkingOverride('high', 'low')).toEqual({
      thinkingOverride: 'high',
      thinkingSource: 'flag',
    });
    expect(resolveRuntimeThinkingOverride(undefined, 'xhigh')).toEqual({
      thinkingOverride: 'xhigh',
      thinkingSource: 'env',
    });
    expect(resolveRuntimeThinkingOverride(undefined, 'invalid')).toEqual({
      thinkingOverride: undefined,
      thinkingSource: undefined,
    });
  });

  it('disables codex reasoning for off aliases regardless of case', () => {
    expect(shouldDisableCodexReasoning(baseConfig, 'OFF')).toBe(true);
    expect(
      shouldDisableCodexReasoning(
        {
          ...baseConfig,
          mode: 'off',
        },
        'high'
      )
    ).toBe(false);
    expect(
      shouldDisableCodexReasoning(
        {
          ...baseConfig,
          mode: 'manual',
          override: 'off',
        },
        undefined
      )
    ).toBe(true);
  });

  it('builds startup status from effective precedence instead of raw config mode', () => {
    const offConfig: ThinkingConfig = { ...baseConfig, mode: 'off' };

    expect(buildThinkingStartupStatus(offConfig, 'high', 'env')).toEqual({
      thinkingLabel: 'high',
      sourceLabel: 'env: CCS_THINKING',
    });

    expect(buildThinkingStartupStatus(offConfig, undefined, undefined)).toEqual({
      thinkingLabel: 'off',
      sourceLabel: 'config: off',
    });

    expect(buildThinkingStartupStatus(baseConfig, 'off', 'flag', '--effort off')).toEqual({
      thinkingLabel: 'off',
      sourceLabel: 'flag: --effort off',
    });
  });
});
