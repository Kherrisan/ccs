import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionStatsCard } from '@/components/analytics/session-stats-card';
import type { PaginatedSessions, Session } from '@/hooks/use-usage';
import { AllProviders } from '@tests/setup/test-utils';

vi.mock('date-fns', async () => {
  const actual = await vi.importActual('date-fns');
  return {
    ...actual,
    formatDistanceToNow: vi.fn(() => '27 minutes ago'),
  };
});

function buildSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'session-1',
    projectPath: '/Users/kaitran/CloudPersonal/worktrees/ccs-cli/feature-branch',
    inputTokens: 1_500,
    outputTokens: 2_500,
    cost: 0.08,
    lastActivity: '2026-04-26T14:00:00.000Z',
    modelsUsed: ['claude-sonnet-4'],
    ...overrides,
  };
}

function buildPaginatedSessions(overrides: Partial<PaginatedSessions> = {}): PaginatedSessions {
  return {
    sessions: [buildSession()],
    total: 1,
    limit: 50,
    offset: 0,
    hasMore: false,
    ...overrides,
  };
}

describe('SessionStatsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a loading skeleton', () => {
    const { container } = render(<SessionStatsCard data={undefined} isLoading />, {
      wrapper: AllProviders,
    });

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it('renders the empty state with the live paginated contract', () => {
    render(<SessionStatsCard data={buildPaginatedSessions({ sessions: [], total: 0 })} />, {
      wrapper: AllProviders,
    });

    expect(screen.getByText('Session Stats')).toBeInTheDocument();
    expect(screen.getByText('No session data available')).toBeInTheDocument();
  });

  it('keeps subset session metrics explicitly sample-scoped when pagination truncates the result set', () => {
    const data = buildPaginatedSessions({
      sessions: [
        buildSession({ sessionId: 'session-1', cost: 0.08 }),
        buildSession({
          sessionId: 'session-2',
          projectPath: '/Users/kaitran/projects/platform/worktrees/kai-fix',
          inputTokens: 2_000,
          outputTokens: 3_000,
          cost: 0.12,
          target: 'codex',
        }),
        buildSession({
          sessionId: 'session-3',
          projectPath: '/Users/kaitran/projects/share-pi',
          inputTokens: 1_000,
          outputTokens: 2_000,
          cost: 0.05,
        }),
      ],
      total: 9,
      hasMore: true,
    });

    render(<SessionStatsCard data={data} />, { wrapper: AllProviders });

    expect(screen.getByText('Sampled Sessions')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('9 total')).toBeInTheDocument();
    expect(screen.getByText('Recent Avg Cost')).toBeInTheDocument();
    expect(screen.getAllByText('$0.08').length).toBeGreaterThan(0);
    expect(screen.getByText('codex')).toBeInTheDocument();
  });

  it('keeps the overall average label when the full result set is loaded', () => {
    const data = buildPaginatedSessions({
      sessions: [
        buildSession({ sessionId: 'session-1', cost: 0.04 }),
        buildSession({ sessionId: 'session-2', cost: 0.06 }),
      ],
      total: 2,
      hasMore: false,
    });

    render(<SessionStatsCard data={data} />, { wrapper: AllProviders });

    expect(screen.getByText('Avg Cost/Session')).toBeInTheDocument();
    expect(screen.queryByText('Recent Avg Cost')).not.toBeInTheDocument();
  });

  it('formats project names from worktree paths without regressing the live fixture shape', () => {
    const data = buildPaginatedSessions({
      sessions: [
        buildSession({
          projectPath:
            '/Users/kaitran/Developer/ExaDev/Clients/Architect/repositories/architect/worktrees/2026-01-08',
        }),
      ],
    });

    render(<SessionStatsCard data={data} />, { wrapper: AllProviders });

    expect(
      screen.getByTitle(
        '/Users/kaitran/Developer/ExaDev/Clients/Architect/repositories/architect/worktrees/2026-01-08'
      )
    ).toHaveTextContent('2026-01-08');
  });

  it('formats visible token counts from input plus output only', () => {
    const data = buildPaginatedSessions({
      sessions: [
        buildSession({
          inputTokens: 1_500_000,
          outputTokens: 500_000,
        }),
      ],
    });

    render(<SessionStatsCard data={data} />, { wrapper: AllProviders });

    expect(screen.getByText('2.0M toks')).toBeInTheDocument();
  });
});
