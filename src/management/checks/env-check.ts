/**
 * Environment Health Check - OAuth readiness diagnostics
 */

import { getEnvironmentDiagnostics } from '../environment-diagnostics';
import { ok, warn } from '../../utils/ui';
import { getCcsDirSource } from '../../utils/config-manager';
import { HealthCheck, IHealthChecker, createSpinner } from './types';
import { getCcsDir } from '../../config/config-loader-facade';

const ora = createSpinner();

/**
 * Check environment for OAuth readiness
 * Helps diagnose Windows headless false positives
 */
export class EnvironmentChecker implements IHealthChecker {
  name = 'Environment';

  run(results: HealthCheck): void {
    const spinner = ora('Checking environment').start();
    const diag = getEnvironmentDiagnostics();

    // Determine overall environment health
    let envStatus: 'OK' | 'WARN' = 'OK';
    let envMessage = 'Browser available';

    // Check for potential issues
    if (diag.detectedHeadless) {
      if (diag.platform === 'win32' && diag.ttyStatus === 'undefined') {
        // Windows false positive - this is actually a warning
        envStatus = 'WARN';
        envMessage = 'Headless detected (may be false positive on Windows)';
      } else if (diag.sshSession) {
        envMessage = 'SSH session (headless mode)';
      } else {
        envMessage = 'Headless environment';
      }
    }

    if (envStatus === 'WARN') {
      spinner.warn();
      console.log(`  ${warn('Environment'.padEnd(22))}  ${envMessage}`);
    } else {
      spinner.succeed();
      console.log(`  ${ok('Environment'.padEnd(22))}  ${envMessage}`);
    }

    // Show key environment details
    console.log(`  ${''.padEnd(24)}  Platform: ${diag.platformName}`);
    if (diag.sshSession) {
      console.log(`  ${''.padEnd(24)}  SSH: Yes (${diag.sshReason})`);
    }
    if (diag.ttyStatus === 'undefined') {
      console.log(`  ${''.padEnd(24)}  TTY: undefined [!]`);
    }
    console.log(`  ${''.padEnd(24)}  Browser: ${diag.browserReason}`);

    // Show CCS directory and source
    const ccsDir = getCcsDir();
    const [dirSource] = getCcsDirSource();
    const sourceLabel = dirSource === 'default' ? '' : ` (via ${dirSource})`;
    console.log(`  ${''.padEnd(24)}  CCS Dir: ${ccsDir}${sourceLabel}`);

    results.addCheck(
      'Environment',
      envStatus === 'OK' ? 'success' : 'warning',
      envMessage,
      envStatus === 'WARN' ? 'If browser opens correctly, this warning can be ignored' : undefined,
      {
        status: envStatus,
        info: envMessage,
      }
    );
  }
}

/**
 * Run environment check
 */
export function runEnvironmentCheck(results: HealthCheck): void {
  const checker = new EnvironmentChecker();
  checker.run(results);
}
