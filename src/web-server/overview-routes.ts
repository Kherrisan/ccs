/**
 * Overview Routes (Phase 07)
 *
 * Dashboard overview API for counts and health summary.
 */

import { Router, Request, Response } from 'express';
import { loadConfigSafe } from '../utils/config-manager';
import { runHealthChecks } from './health-service';
import { getAllAuthStatus, initializeAccounts } from '../cliproxy/auth/auth-handler';
import { getVersion } from '../utils/version';
import ProfileRegistry from '../auth/profile-registry';

export const overviewRoutes = Router();

/**
 * GET /api/overview
 */
overviewRoutes.get('/', async (_req: Request, res: Response) => {
  try {
    const config = loadConfigSafe();

    const profileCount = Object.keys(config.profiles).length;
    const cliproxyVariantCount = Object.keys(config.cliproxy || {}).length;

    // Count authenticated built-in providers (gemini, codex, agy, qwen, iflow)
    initializeAccounts();
    const authStatuses = getAllAuthStatus();
    const authenticatedProviderCount = authStatuses.filter((s) => s.authenticated).length;

    // Total CLIProxy = custom variants + authenticated providers
    const totalCliproxyCount = cliproxyVariantCount + authenticatedProviderCount;

    // Get quick health summary
    const health = await runHealthChecks();

    res.json({
      version: getVersion(),
      profiles: profileCount,
      cliproxy: totalCliproxyCount,
      cliproxyVariants: cliproxyVariantCount,
      cliproxyProviders: authenticatedProviderCount,
      accounts: getAccountCount(),
      health: {
        status:
          health.summary.errors > 0 ? 'error' : health.summary.warnings > 0 ? 'warning' : 'ok',
        passed: health.summary.passed,
        total: health.summary.total,
      },
    });
  } catch {
    res.json({
      version: getVersion(),
      profiles: 0,
      cliproxy: 0,
      cliproxyVariants: 0,
      cliproxyProviders: 0,
      accounts: 0,
      health: { status: 'error', passed: 0, total: 0 },
    });
  }
});

function getAccountCount(): number {
  try {
    const registry = new ProfileRegistry();

    // Merge legacy (profiles.json) and unified (config.yaml) accounts
    const legacyProfiles = registry.getAllProfiles();
    const unifiedAccounts = registry.getAllAccountsUnified();

    // Count unique accounts (unified takes precedence for duplicates)
    const allNames = new Set([...Object.keys(legacyProfiles), ...Object.keys(unifiedAccounts)]);

    return allNames.size;
  } catch {
    return 0;
  }
}
