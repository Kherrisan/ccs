/**
 * Auth Context - Dashboard authentication state management
 * Provides auth status and login/logout functions globally.
 */

/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from 'react';
import { checkAuth, login as apiLogin, logout as apiLogout } from '@/lib/auth-api';

interface AuthContextValue {
  /** Whether authentication is required for this dashboard */
  authRequired: boolean;
  /** Whether user is currently authenticated */
  isAuthenticated: boolean;
  /** Username of authenticated user */
  username: string | null;
  /** Whether auth check is in progress */
  loading: boolean;
  /** Login with credentials */
  login: (username: string, password: string) => Promise<void>;
  /** Logout current session */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authRequired, setAuthRequired] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Check auth status on mount
  useEffect(() => {
    checkAuth()
      .then((res) => {
        setAuthRequired(res.authRequired);
        setIsAuthenticated(res.authenticated);
        setUsername(res.username);
      })
      .catch(() => {
        // If auth check fails (network error, server down, CORS issue),
        // fail closed: require auth instead of granting access.
        // Prevents silently broken dashboard when server is unreachable.
        setAuthRequired(true);
        setIsAuthenticated(false);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (user: string, password: string) => {
    const res = await apiLogin(user, password);
    setIsAuthenticated(true);
    setUsername(res.username);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setIsAuthenticated(false);
    setUsername(null);
  }, []);

  const value = useMemo(
    () => ({
      authRequired,
      isAuthenticated,
      username,
      loading,
      login,
      logout,
    }),
    [authRequired, isAuthenticated, username, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
