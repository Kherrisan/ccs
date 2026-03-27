import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AllProviders } from '../../../../setup/test-utils';
import { useProviderEditor } from '@/components/cliproxy/provider-editor/use-provider-editor';

function createJsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const wrapper = ({ children }: { children: ReactNode }) => <AllProviders>{children}</AllProviders>;

describe('useProviderEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('derives extended-context state from all Anthropic model env keys', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/api/settings/claude/raw')) {
          return Promise.resolve(
            createJsonResponse({
              profile: 'claude',
              settings: {
                env: {
                  ANTHROPIC_MODEL: 'claude-sonnet-4-6',
                  ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6[1m]',
                  ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
                  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
                },
              },
              mtime: 1,
              path: '~/.ccs/profiles/claude/settings.json',
            })
          );
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    const { result } = renderHook(() => useProviderEditor('claude'), { wrapper });

    await waitFor(() => expect(result.current.currentModel).toBe('claude-sonnet-4-6'));
    expect(result.current.extendedContextEnabled).toBe(true);
  });

  it('applies [1m] across compatible Claude mappings and leaves Haiku plain', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/api/settings/claude/raw')) {
          return Promise.resolve(
            createJsonResponse({
              profile: 'claude',
              settings: {
                env: {
                  ANTHROPIC_MODEL: 'claude-sonnet-4-6',
                  ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6',
                  ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
                  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
                },
              },
              mtime: 1,
              path: '~/.ccs/profiles/claude/settings.json',
            })
          );
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    const { result } = renderHook(() => useProviderEditor('claude'), { wrapper });

    await waitFor(() => expect(result.current.currentModel).toBe('claude-sonnet-4-6'));

    act(() => {
      result.current.toggleExtendedContext(true);
    });

    const nextSettings = JSON.parse(result.current.rawJsonContent);
    expect(nextSettings.env).toMatchObject({
      ANTHROPIC_MODEL: 'claude-sonnet-4-6[1m]',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6[1m]',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6[1m]',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    });
  });

  it('preserves explicit long-context intent when preset-style updates replace mappings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/api/settings/claude/raw')) {
          return Promise.resolve(
            createJsonResponse({
              profile: 'claude',
              settings: {
                env: {
                  ANTHROPIC_MODEL: 'claude-sonnet-4-6[1m]',
                  ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6[1m]',
                  ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6[1m]',
                  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
                },
              },
              mtime: 1,
              path: '~/.ccs/profiles/claude/settings.json',
            })
          );
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    const { result } = renderHook(() => useProviderEditor('claude'), { wrapper });

    await waitFor(() => expect(result.current.extendedContextEnabled).toBe(true));

    act(() => {
      result.current.updateEnvValues({
        ANTHROPIC_MODEL: 'claude-opus-4-6',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
      });
    });

    const nextSettings = JSON.parse(result.current.rawJsonContent);
    expect(nextSettings.env).toMatchObject({
      ANTHROPIC_MODEL: 'claude-opus-4-6[1m]',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6[1m]',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6[1m]',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    });
  });
});
