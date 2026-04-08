import { describe, expect, it } from 'bun:test';
import {
  deduplicateCcsImageAnalyzerHooks,
  isCcsImageAnalyzerHook,
  removeCcsImageAnalyzerHooks,
} from '../../../../src/utils/hooks/image-analyzer-hook-utils';

describe('image-analyzer-hook-utils', () => {
  it('detects CCS-managed image hooks across current and legacy path variants', () => {
    expect(
      isCcsImageAnalyzerHook({
        matcher: 'Read',
        hooks: [
          {
            type: 'command',
            command: 'node "/Users/kaitran/.ccs/hooks/image-analyzer-transformer.cjs"',
          },
        ],
      })
    ).toBe(true);

    expect(
      isCcsImageAnalyzerHook({
        matcher: 'Read',
        hooks: [
          {
            type: 'command',
            command: 'node "/home/kai/.ccs/hooks/image-analyzer-transformer.cjs"',
          },
        ],
      })
    ).toBe(true);

    expect(
      isCcsImageAnalyzerHook({
        matcher: 'Read',
        hooks: [{ type: 'command', command: 'node "/tmp/custom-read-hook.cjs"' }],
      })
    ).toBe(false);

    expect(
      isCcsImageAnalyzerHook({
        matcher: 'Read',
        hooks: [
          {
            type: 'command',
            command: 'node "/Users/kaitran/.ccs/hooks/image-analyzer-transformer-custom.cjs"',
          },
        ],
      })
    ).toBe(false);
  });

  it('deduplicates only CCS-managed image hooks', () => {
    const settings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Read',
            hooks: [
              {
                type: 'command',
                command: 'node "/Users/kaitran/.ccs/hooks/image-analyzer-transformer.cjs"',
              },
            ],
          },
          {
            matcher: 'Read',
            hooks: [
              {
                type: 'command',
                command: 'node "/home/kai/.ccs/hooks/image-analyzer-transformer.cjs"',
              },
            ],
          },
          {
            matcher: 'Read',
            hooks: [{ type: 'command', command: 'node "/tmp/custom-read-hook.cjs"' }],
          },
        ],
      },
    } satisfies Record<string, unknown>;

    expect(deduplicateCcsImageAnalyzerHooks(settings)).toBe(true);
    expect((settings.hooks.PreToolUse as unknown[])).toHaveLength(2);
  });

  it('removes only CCS-managed image hooks and preserves unrelated hooks', () => {
    const settings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Read',
            hooks: [
              {
                type: 'command',
                command: 'node "/Users/kaitran/.ccs/hooks/image-analyzer-transformer.cjs"',
              },
            ],
          },
          {
            matcher: 'Read',
            hooks: [{ type: 'command', command: 'node "/tmp/custom-read-hook.cjs"' }],
          },
          {
            matcher: 'WebSearch',
            hooks: [
              {
                type: 'command',
                command: 'node "/Users/kaitran/.ccs/hooks/websearch-transformer.cjs"',
              },
            ],
          },
        ],
      },
    } satisfies Record<string, unknown>;

    expect(removeCcsImageAnalyzerHooks(settings)).toBe(true);
    expect(settings.hooks.PreToolUse).toEqual([
      {
        matcher: 'Read',
        hooks: [{ type: 'command', command: 'node "/tmp/custom-read-hook.cjs"' }],
      },
      {
        matcher: 'WebSearch',
        hooks: [
          {
            type: 'command',
            command: 'node "/Users/kaitran/.ccs/hooks/websearch-transformer.cjs"',
          },
        ],
      },
    ]);
  });
});
