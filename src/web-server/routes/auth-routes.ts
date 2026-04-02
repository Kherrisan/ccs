/**
 * Dashboard Authentication Routes
 * Handles login, logout, session check, and setup status.
 */

import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { getDashboardAuthConfig } from '../../config/unified-config-loader';
import { isLoopbackRemoteAddress, loginRateLimiter } from '../middleware/auth-middleware';

/**
 * Timing-safe string comparison to prevent timing attacks.
 * Returns true if strings match, false otherwise.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still compare to avoid length-based timing leak
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const router = Router();

/**
 * POST /api/auth/login
 * Authenticate user with username/password.
 * Rate limited: 5 attempts per 15 minutes.
 */
router.post('/login', loginRateLimiter, async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  const authConfig = getDashboardAuthConfig();

  // Check if auth is configured
  if (!authConfig.enabled || !authConfig.username || !authConfig.password_hash) {
    res.status(400).json({ error: 'Authentication not configured' });
    return;
  }

  // Validate bcrypt hash format to prevent bcrypt.compare errors
  const isBcryptHash = /^\$2[aby]?\$\d{2}\$.{53}$/.test(authConfig.password_hash);
  if (!isBcryptHash) {
    res.status(500).json({ error: 'Invalid password hash format in config' });
    return;
  }

  // Verify credentials (timing-safe comparison for username)
  const usernameMatch = timingSafeEqual(username, authConfig.username);
  const passwordMatch = await bcrypt.compare(password, authConfig.password_hash);

  if (!usernameMatch || !passwordMatch) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  // Regenerate session to prevent session fixation, then set auth
  req.session.regenerate((err) => {
    if (err) {
      res.status(500).json({ error: 'Session error' });
      return;
    }
    req.session.authenticated = true;
    req.session.username = username;
    res.json({ success: true, username });
  });
});

/**
 * POST /api/auth/logout
 * Clear session and log out user.
 */
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to logout' });
      return;
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

/**
 * GET /api/auth/check
 * Check if user is authenticated and if auth is required.
 */
router.get('/check', (req: Request, res: Response) => {
  const authConfig = getDashboardAuthConfig();
  const isLocal = isLoopbackRemoteAddress(req.socket.remoteAddress);

  // When auth is not configured and access is remote, the dashboard API
  // endpoints return 403. Signal auth-required so the UI can show the
  // login/setup page instead of a silently broken dashboard.
  const effectiveAuthRequired = authConfig.enabled || !isLocal;

  res.json({
    authRequired: effectiveAuthRequired,
    authenticated: req.session?.authenticated ?? false,
    username: req.session?.username ?? null,
  });
});

/**
 * GET /api/auth/setup
 * Check if authentication is properly configured.
 */
router.get('/setup', (_req: Request, res: Response) => {
  const authConfig = getDashboardAuthConfig();

  res.json({
    enabled: authConfig.enabled,
    configured: !!(authConfig.username && authConfig.password_hash),
    sessionTimeoutHours: authConfig.session_timeout_hours ?? 24,
  });
});

export default router;
