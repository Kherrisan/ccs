import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '@tests/setup/test-utils';
import { SharedPage } from '@/pages/shared';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function accountsResponse() {
  return jsonResponse({
    default: 'work',
    plain_ccs_lane: null,
    accounts: [
      {
        name: 'work',
        type: 'oauth',
        created: '2026-05-01T00:00:00.000Z',
        context_mode: 'isolated',
        shared_resource_mode: 'shared',
      },
      {
        name: 'sandbox',
        type: 'oauth',
        created: '2026-05-02T00:00:00.000Z',
        context_mode: 'isolated',
        shared_resource_mode: 'profile-local',
      },
    ],
  });
}

describe('SharedPage', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('shows an actionable error state when shared items request fails', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.endsWith('/api/shared/summary')) {
        return jsonResponse({
          commands: 0,
          skills: 0,
          agents: 0,
          plugins: 0,
          settings: false,
          total: 0,
          symlinkStatus: { valid: true, message: 'Symlinks active' },
        });
      }
      if (url.endsWith('/api/accounts')) {
        return accountsResponse();
      }
      if (url.endsWith('/api/shared/commands')) {
        return jsonResponse({ error: 'Backend unavailable' }, 500);
      }

      return jsonResponse({ items: [] });
    });

    render(<SharedPage />);

    expect(await screen.findByText('Failed to load shared commands')).toBeInTheDocument();
    expect(screen.getByText('Backend unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows detail content and distinguishes no-match state from loaded results', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.endsWith('/api/shared/summary')) {
        return jsonResponse({
          commands: 1,
          skills: 0,
          agents: 0,
          plugins: 0,
          settings: false,
          total: 1,
          symlinkStatus: { valid: true, message: 'Symlinks active' },
        });
      }
      if (url.endsWith('/api/accounts')) {
        return accountsResponse();
      }
      if (url.endsWith('/api/shared/commands')) {
        return jsonResponse({
          items: [
            {
              name: 'engineer/review',
              description: 'Review the latest PR changes.',
              path: '/tmp/commands/engineer/review.md',
              type: 'command',
            },
          ],
        });
      }
      if (url.includes('/api/shared/content?')) {
        return jsonResponse({
          content: '# Review\n\nFull review workflow',
          contentPath: '/tmp/commands/engineer/review.md',
        });
      }

      return jsonResponse({ items: [] });
    });

    render(<SharedPage />);

    expect(await screen.findByText('Showing 1 of 1 commands')).toBeInTheDocument();
    await waitFor(() => {
      const requestedUrls = fetchMock.mock.calls.map(([input]) => requestUrl(input));
      expect(requestedUrls.some((url) => url.includes('/api/shared/content?'))).toBe(true);
    });

    const searchInput = screen.getByRole('textbox', {
      name: 'Filter commands by name, description, or path',
    });
    await userEvent.type(searchInput, 'no-match');

    expect(await screen.findByText('No commands match "no-match".')).toBeInTheDocument();
  });

  it('loads plugin directory content and renders real settings content', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.endsWith('/api/shared/summary')) {
        return jsonResponse({
          commands: 0,
          skills: 0,
          agents: 0,
          plugins: 1,
          settings: true,
          total: 2,
          symlinkStatus: { valid: true, message: 'Symlinks active' },
        });
      }
      if (url.endsWith('/api/accounts')) {
        return accountsResponse();
      }
      if (url.endsWith('/api/shared/commands')) {
        return jsonResponse({ items: [] });
      }
      if (url.endsWith('/api/shared/plugins')) {
        return jsonResponse({
          items: [
            {
              name: 'cache',
              description: 'Directory with 2 items: payloads/, plugin-index.json',
              path: '/tmp/plugins/cache',
              type: 'plugin',
            },
          ],
        });
      }
      if (url.includes('/api/shared/content?') && url.includes('type=plugins')) {
        return jsonResponse({
          content:
            '# Plugin directory: cache\n\n## Directory contents\n\n- payloads/\n- plugin-index.json',
          contentPath: '/tmp/plugins/cache',
        });
      }
      if (url.includes('/api/shared/content?') && url.includes('type=settings')) {
        return jsonResponse({
          content:
            '{\n  "env": {\n    "ANTHROPIC_MODEL": "claude-sonnet-4-5"\n  },\n  "permissions": {\n    "allow": [\n      "Bash(git status)"\n    ]\n  }\n}',
          contentPath: '/tmp/.ccs/shared/settings.json',
        });
      }

      return jsonResponse({ error: `Unexpected request: ${url}` }, 404);
    });

    render(<SharedPage />);

    await userEvent.click(await screen.findByRole('tab', { name: /Plugins/ }));

    expect(
      await screen.findByText('Directory with 2 items: payloads/, plugin-index.json')
    ).toBeInTheDocument();
    expect(await screen.findByText('plugin-index.json')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Settings/ }));

    expect(await screen.findByText('Showing 1 of 1 settings')).toBeInTheDocument();
    expect(
      await screen.findByText((content) =>
        content.includes('"ANTHROPIC_MODEL": "claude-sonnet-4-5"')
      )
    ).toBeInTheDocument();
    expect(screen.getByText('/tmp/.ccs/shared/settings.json')).toBeInTheDocument();

    const requestedUrls = fetchMock.mock.calls.map(([input]) => requestUrl(input));
    expect(
      requestedUrls.some(
        (url) => url.includes('/api/shared/content?') && url.includes('type=settings')
      )
    ).toBe(true);
  });

  it('shows account resource policy context on the shared hub', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.endsWith('/api/shared/summary')) {
        return jsonResponse({
          commands: 0,
          skills: 0,
          agents: 0,
          plugins: 0,
          settings: false,
          total: 0,
          symlinkStatus: { valid: true, message: 'Symlinks active' },
        });
      }
      if (url.endsWith('/api/accounts')) {
        return accountsResponse();
      }
      if (url.endsWith('/api/shared/commands')) {
        return jsonResponse({ items: [] });
      }

      return jsonResponse({ items: [] });
    });

    render(<SharedPage />);

    expect(await screen.findByText('Resource policies')).toBeInTheDocument();
    expect(screen.getByText('1 shared')).toBeInTheDocument();
    expect(screen.getByText('1 profile-local')).toBeInTheDocument();
    expect(screen.getByText('sandbox')).toBeInTheDocument();
  });

  it('shows offline guidance when network request fails', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.endsWith('/api/shared/summary')) {
        throw new TypeError('Failed to fetch');
      }
      throw new TypeError('Failed to fetch');
    });

    render(<SharedPage />);

    expect(await screen.findByText('Counts unavailable')).toBeInTheDocument();
    expect(
      screen.getAllByText(
        'Connection to dashboard server lost or restarting. Keep `ccs config` running, then retry.'
      ).length
    ).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Retry counts' })).toBeInTheDocument();
  });
});
