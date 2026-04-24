import { describe, expect, it } from 'bun:test';
import { redactContext } from '../../../../src/services/logging/log-redaction';

describe('log redaction', () => {
  it('redacts sensitive keys and preserves non-sensitive values', () => {
    const redacted = redactContext({
      token: 'secret-token',
      api_key: 'secret-key',
      safe: 'kept',
      count: 3,
      enabled: true,
    });

    expect(redacted).toEqual({
      token: '[redacted]',
      api_key: '[redacted]',
      safe: 'kept',
      count: 3,
      enabled: true,
    });
  });

  it('sanitizes nested objects and arrays recursively', () => {
    const redacted = redactContext({
      request: {
        headers: {
          authorization: 'Bearer abc',
          cookie: 'session=123',
        },
        steps: [
          { secret: 'hidden' },
          { label: 'safe-step' },
          ['nested-array', { password_hash: 'hidden-hash' }],
        ],
      },
    });

    expect(redacted).toEqual({
      request: {
        headers: {
          authorization: '[redacted]',
          cookie: '[redacted]',
        },
        steps: [
          { secret: '[redacted]' },
          { label: 'safe-step' },
          ['nested-array', { password_hash: '[redacted]' }],
        ],
      },
    });
  });

  it('caps recursive depth, truncates long strings, and preserves nullish values', () => {
    const deeplyNested = {
      first: {
        second: {
          third: {
            fourth: {
              fifth: {
                sixth: 'too-deep',
              },
            },
          },
        },
      },
    };
    const longValue = 'a'.repeat(2_500);

    const redacted = redactContext({
      nested: deeplyNested,
      longValue,
      nothing: null,
      missing: undefined,
    });

    expect(redacted.nested).toEqual({
      first: {
        second: {
          third: {
            fourth: '[max-depth]',
          },
        },
      },
    });
    expect(redacted.longValue).toBe(`${'a'.repeat(2_000)}...[truncated]`);
    expect(redacted.nothing).toBeNull();
    expect(redacted.missing).toBeUndefined();
  });

  it('reduces Error instances to safe name and message fields', () => {
    const error = new Error('boom'.repeat(700));
    error.name = 'ExplodedError';

    const redacted = redactContext({ error });

    expect(redacted).toEqual({
      error: {
        name: 'ExplodedError',
        message: `${'boom'.repeat(500)}...[truncated]`,
      },
    });
  });
});
