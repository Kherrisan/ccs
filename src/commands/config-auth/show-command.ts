/**
 * Config Auth Show Command
 *
 * Display current dashboard authentication status.
 */

import { initUI, header, subheader, ok, info, warn, dim, color } from '../../utils/ui';
import type { AuthStatusInfo } from './types';
import { getDashboardAuthConfig } from '../../config/config-loader-facade';

/**
 * Get auth status info with ENV override detection
 */
function getAuthStatus(): AuthStatusInfo {
  const config = getDashboardAuthConfig();

  return {
    enabled: config.enabled,
    configured: !!(config.username && config.password_hash),
    username: config.username,
    sessionTimeoutHours: config.session_timeout_hours ?? 24,
    envOverride: {
      enabled: process.env.CCS_DASHBOARD_AUTH_ENABLED !== undefined,
      username: process.env.CCS_DASHBOARD_USERNAME !== undefined,
      passwordHash: process.env.CCS_DASHBOARD_PASSWORD_HASH !== undefined,
    },
  };
}

/**
 * Handle show command - display current auth status
 */
export async function handleShow(): Promise<void> {
  await initUI();

  console.log('');
  console.log(header('Dashboard Auth Status'));
  console.log('');

  const status = getAuthStatus();

  // Status section
  console.log(subheader('Configuration'));

  if (status.enabled) {
    console.log(ok('Authentication: Enabled'));
  } else {
    console.log(info('Authentication: Disabled'));
  }

  if (status.configured) {
    console.log(ok(`Username: ${status.username}`));
    console.log(info(`Session timeout: ${status.sessionTimeoutHours} hours`));
  } else {
    console.log(warn('Not configured - run `ccs config auth setup`'));
  }

  console.log('');

  // ENV override section
  const hasEnvOverride =
    status.envOverride.enabled || status.envOverride.username || status.envOverride.passwordHash;

  if (hasEnvOverride) {
    console.log(subheader('Environment Overrides'));
    console.log(warn('The following ENV vars override config.yaml:'));

    if (status.envOverride.enabled) {
      const value = process.env.CCS_DASHBOARD_AUTH_ENABLED;
      console.log(`  ${color('CCS_DASHBOARD_AUTH_ENABLED', 'command')}=${value}`);
    }
    if (status.envOverride.username) {
      const value = process.env.CCS_DASHBOARD_USERNAME;
      console.log(`  ${color('CCS_DASHBOARD_USERNAME', 'command')}=${value}`);
    }
    if (status.envOverride.passwordHash) {
      console.log(`  ${color('CCS_DASHBOARD_PASSWORD_HASH', 'command')}=***`);
    }

    console.log('');
  }

  // Help section
  console.log(subheader('Commands'));
  console.log(dim('  ccs config auth setup     Configure authentication'));
  console.log(dim('  ccs config auth disable   Disable authentication'));
  console.log(dim('  ccs config                Open dashboard'));
  console.log('');
}
