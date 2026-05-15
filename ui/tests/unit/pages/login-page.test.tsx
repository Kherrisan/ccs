import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { LoginPage } from '@/pages/login';
import { render, screen, userEvent, waitFor } from '@tests/setup/test-utils';

const { navigateMock, useAuthMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: useAuthMock,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');

  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ state: { from: { pathname: '/settings' } } }),
  };
});

describe('LoginPage', () => {
  beforeEach(async () => {
    navigateMock.mockReset();
    useAuthMock.mockReturnValue({
      authRequired: true,
      isAuthenticated: false,
      username: null,
      loading: false,
      accessMode: 'login',
      authEnabled: true,
      authConfigured: true,
      isLocalAccess: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    await i18n.changeLanguage('en');
  });

  it('redirects away when dashboard auth is disabled for remote access', async () => {
    useAuthMock.mockReturnValue({
      authRequired: false,
      isAuthenticated: false,
      username: null,
      loading: false,
      accessMode: 'open',
      authEnabled: false,
      authConfigured: false,
      isLocalAccess: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/settings', { replace: true });
    });
    expect(screen.queryByRole('heading', { name: 'Remote access needs auth setup' })).toBeNull();
  });

  it('renders the incomplete setup copy when auth is enabled without credentials', () => {
    useAuthMock.mockReturnValue({
      authRequired: true,
      isAuthenticated: false,
      username: null,
      loading: false,
      accessMode: 'setup',
      authEnabled: true,
      authConfigured: false,
      isLocalAccess: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(<LoginPage />);

    expect(
      screen.getAllByText(
        'Dashboard auth is turned on, but the setup is incomplete. Finish the configuration for this CCS instance before signing in.'
      )
    ).not.toHaveLength(0);
    expect(
      screen.getByText(
        'Create or re-enable dashboard credentials, then reopen this page from the remote device.'
      )
    ).toBeVisible();
    expect(
      screen.getByText('Docker deployment? Run the setup inside the running container:')
    ).toBeVisible();
    expect(screen.getByText('docker exec -it ccs-cliproxy ccs config auth setup')).toBeVisible();
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
  });

  it('toggles password visibility on the login form', async () => {
    render(<LoginPage />);

    expect(screen.getByRole('button', { name: 'Light' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Dark' })).toBeVisible();

    const passwordInput = screen.getByLabelText('Password');
    expect(passwordInput).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(passwordInput).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
