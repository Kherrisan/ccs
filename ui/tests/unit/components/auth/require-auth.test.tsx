import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/components/auth/require-auth';

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: useAuthMock,
}));

function renderGuard(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>login page</div>} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<div>dashboard page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('RequireAuth', () => {
  beforeEach(() => {
    useAuthMock.mockReset();
  });

  it('allows remote readonly sessions through without redirecting to login', () => {
    useAuthMock.mockReturnValue({
      authRequired: false,
      isAuthenticated: false,
      username: null,
      loading: false,
      authEnabled: false,
      authConfigured: false,
      isLocalAccess: false,
      accessMode: 'open',
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderGuard();

    expect(screen.getByText('dashboard page')).toBeVisible();
    expect(screen.queryByText('login page')).toBeNull();
  });

  it('redirects unauthenticated users when dashboard auth is enabled', () => {
    useAuthMock.mockReturnValue({
      authRequired: true,
      isAuthenticated: false,
      username: null,
      loading: false,
      authEnabled: true,
      authConfigured: true,
      isLocalAccess: false,
      accessMode: 'login',
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderGuard();

    expect(screen.getByText('login page')).toBeVisible();
    expect(screen.queryByText('dashboard page')).toBeNull();
  });
});
