import { describe, expect, it } from 'bun:test';
import {
  buildCliproxyRoutingHints,
  getManagedModelPrefix,
} from '../../../src/shared/cliproxy-model-routing';

describe('cliproxy model routing hints', () => {
  it('uses short managed prefixes for overlapping Gemini and Antigravity models', () => {
    const routing = buildCliproxyRoutingHints(
      {
        gemini: {
          provider: 'gemini',
          displayName: 'Gemini',
          models: [{ id: 'gemini-3-flash-preview', name: 'Gemini Flash' }],
        },
        agy: {
          provider: 'agy',
          displayName: 'Antigravity',
          models: [{ id: 'gemini-3-flash', name: 'Gemini 3 Flash' }],
        },
      },
      [
        { id: 'gemini-3-flash-preview', owned_by: 'antigravity', type: 'antigravity' },
        { id: 'gemini-3-flash', owned_by: 'antigravity', type: 'antigravity' },
      ]
    );

    expect(getManagedModelPrefix('gemini')).toBe('gcli');
    expect(getManagedModelPrefix('agy')).toBe('agy');

    expect(routing.gemini?.models[0]).toMatchObject({
      recommendedModelId: 'gcli/gemini-3-flash-preview',
      unprefixedStatus: 'shadowed',
      effectiveProvider: 'agy',
      effectiveDisplayName: 'Antigravity',
    });

    expect(routing.agy?.models[0]).toMatchObject({
      recommendedModelId: 'agy/gemini-3-flash',
      unprefixedStatus: 'safe',
      effectiveProvider: 'agy',
    });
  });

  it('marks models as prefix-only when they are not advertised unprefixed', () => {
    const routing = buildCliproxyRoutingHints(
      {
        gemini: {
          provider: 'gemini',
          displayName: 'Gemini',
          models: [{ id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' }],
        },
      },
      []
    );

    expect(routing.gemini?.prefixOnlyCount).toBe(1);
    expect(routing.gemini?.models[0]).toMatchObject({
      recommendedModelId: 'gcli/gemini-3.1-pro-preview',
      unprefixedStatus: 'prefix-only',
      effectiveProvider: null,
    });
  });
});
