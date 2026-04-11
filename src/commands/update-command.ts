/**
 * Update Command Handler
 *
 * Handles `ccs update` command - checks for updates and installs latest version.
 * Uses npm/yarn/pnpm/bun package managers exclusively.
 */

import { spawn } from 'child_process';
import { initUI, header, ok, fail, warn, info, color } from '../utils/ui';
import {
  buildPackageManagerEnv,
  detectCurrentInstall,
  formatManualUpdateCommand,
  readInstalledPackageState,
  type CurrentInstall,
  type InstalledPackageState,
} from '../utils/package-manager-detector';
import { compareVersionsWithPrerelease } from '../utils/update-checker';
import { getVersion } from '../utils/version';

/**
 * Options for the update command
 */
export interface UpdateOptions {
  force?: boolean;
  beta?: boolean;
}

// Version (from centralized utility)
const CCS_VERSION = getVersion();

async function resolveTargetVersion(
  currentVersion: string,
  targetTag: 'latest' | 'dev'
): Promise<string | undefined> {
  const { checkForUpdates } = await import('../utils/update-checker');
  const result = await checkForUpdates(currentVersion, true, 'npm', targetTag);

  if (result.status === 'update_available' && result.latest) {
    return result.latest;
  }

  if (result.status === 'no_update') {
    return currentVersion;
  }

  return undefined;
}

/**
 * Handle the update command
 * Checks for updates and installs the latest version
 */
export async function handleUpdateCommand(options: UpdateOptions = {}): Promise<void> {
  await initUI();
  const { force = false, beta = false } = options;
  const targetTag = beta ? 'dev' : 'latest';
  const currentInstall = detectCurrentInstall();

  console.log('');
  console.log(header('Checking for updates...'));
  console.log('');

  // Force reinstall - skip update check
  if (force) {
    console.log(info(`Force reinstall from @${targetTag} channel...`));
    console.log('');
    const expectedVersion = await resolveTargetVersion(CCS_VERSION, targetTag);
    await performNpmUpdate(currentInstall, targetTag, true, expectedVersion);
    return;
  }

  const { checkForUpdates } = await import('../utils/update-checker');
  const updateResult = await checkForUpdates(CCS_VERSION, true, 'npm', targetTag);

  if (updateResult.status === 'check_failed') {
    handleCheckFailed(updateResult.message ?? 'Update check failed', targetTag, currentInstall);
    return;
  }

  if (updateResult.status === 'no_update') {
    handleNoUpdate(updateResult.reason);
    return;
  }

  // Update available
  console.log(warn(`Update available: ${updateResult.current} -> ${updateResult.latest}`));
  console.log('');

  // Check if this is a downgrade (e.g., stable to older dev)
  const isDowngrade =
    updateResult.latest &&
    updateResult.current &&
    compareVersionsWithPrerelease(updateResult.latest, updateResult.current) < 0;

  // This happens when stable user requests @dev but @dev base is older
  if (isDowngrade && beta) {
    console.log(
      warn(
        'WARNING: Downgrading from ' +
          (updateResult.current || 'unknown') +
          ' to ' +
          (updateResult.latest || 'unknown')
      )
    );
    console.log(warn('Dev channel may be behind stable.'));
    console.log('');
  }

  // Show beta warning
  if (beta) {
    console.log(warn('Installing from @dev channel (unstable)'));
    console.log(warn('Not recommended for production use'));
    console.log(info('Use `ccs update` (without --beta) to return to stable'));
    console.log('');
  }

  await performNpmUpdate(currentInstall, targetTag, false, updateResult.latest);
}

/**
 * Handle failed update check
 */
function handleCheckFailed(
  message: string,
  targetTag: string = 'latest',
  currentInstall: CurrentInstall = detectCurrentInstall()
): void {
  console.log(fail(message));
  console.log('');
  console.log(warn('Possible causes:'));
  console.log('  - Network connection issues');
  console.log('  - Firewall blocking requests');
  console.log('  - GitHub/npm API temporarily unavailable');
  console.log('');
  console.log('Try again later or update manually:');

  console.log(color(`  ${formatManualUpdateCommand(targetTag, currentInstall)}`, 'command'));
  console.log('');
  process.exit(1);
}

/**
 * Handle no update available
 */
function handleNoUpdate(reason: string | undefined): void {
  const version = getVersion();

  let message = `You are already on the latest version (${version})`;

  switch (reason) {
    case 'dismissed':
      message = `Update dismissed. You are on version ${version}`;
      console.log(warn(message));
      break;
    case 'cached':
      message = `No updates available (cached result). You are on version ${version}`;
      console.log(info(message));
      break;
    default:
      console.log(ok(message));
  }
  console.log('');
  process.exit(0);
}

/**
 * Perform update via npm/yarn/pnpm/bun
 */
function verifyCurrentInstallVersion(
  currentInstall: CurrentInstall,
  targetTag: string,
  expectedVersion?: string,
  previousState?: InstalledPackageState,
  isReinstall: boolean = false
): void {
  const nextState = readInstalledPackageState(currentInstall);
  const installedVersion = nextState.version;
  if (!installedVersion) {
    console.log('');
    console.log(
      fail('Update finished, but CCS could not verify the current installation version.')
    );
    console.log('');
    console.log('Current install remains ambiguous. Re-run manually:');
    console.log(color(`  ${formatManualUpdateCommand(targetTag, currentInstall)}`, 'command'));
    console.log('');
    process.exit(1);
  }

  const installChanged =
    previousState !== undefined &&
    (previousState.version !== nextState.version ||
      previousState.packageJsonMtimeMs !== nextState.packageJsonMtimeMs ||
      previousState.scriptMtimeMs !== nextState.scriptMtimeMs);

  if (expectedVersion && installedVersion !== expectedVersion) {
    if (previousState?.version && installedVersion !== previousState.version) {
      return;
    }

    const comparison = compareVersionsWithPrerelease(installedVersion, expectedVersion);
    if (comparison < 0) {
      console.log('');
      console.log(
        fail(
          `Update completed outside the current installation. Current binary still reports ${installedVersion}; expected ${expectedVersion}.`
        )
      );
      if (previousState?.version && previousState.version === installedVersion) {
        console.log(
          warn(
            `The current install path did not change from ${previousState.version}; another package manager likely updated a different copy of CCS.`
          )
        );
      }
      console.log('');
      console.log('Re-run manually against the current install:');
      console.log(color(`  ${formatManualUpdateCommand(targetTag, currentInstall)}`, 'command'));
      console.log('');
      process.exit(1);
    }
  }

  if (
    isReinstall &&
    previousState?.version &&
    installedVersion === previousState.version &&
    !installChanged
  ) {
    console.log('');
    console.log(
      fail(
        `Reinstall completed, but CCS could not verify that the current installation changed from ${previousState.version}.`
      )
    );
    console.log('');
    console.log('Re-run manually against the current install:');
    console.log(color(`  ${formatManualUpdateCommand(targetTag, currentInstall)}`, 'command'));
    console.log('');
    process.exit(1);
  }
}

async function performNpmUpdate(
  currentInstall: CurrentInstall,
  targetTag: string = 'latest',
  isReinstall: boolean = false,
  expectedVersion?: string
): Promise<void> {
  const packageManager = currentInstall.manager;
  let updateCommand: string;
  let updateArgs: string[];
  let cacheCommand: string | null;
  let cacheArgs: string[] | null;
  const childEnv = buildPackageManagerEnv(currentInstall);
  const previousState = readInstalledPackageState(currentInstall);

  switch (packageManager) {
    case 'npm':
      updateCommand = 'npm';
      updateArgs = ['install', '-g', `@kaitranntt/ccs@${targetTag}`];
      cacheCommand = 'npm';
      cacheArgs = ['cache', 'clean', '--force'];
      break;
    case 'yarn':
      updateCommand = 'yarn';
      updateArgs = ['global', 'add', `@kaitranntt/ccs@${targetTag}`];
      cacheCommand = 'yarn';
      cacheArgs = ['cache', 'clean'];
      break;
    case 'pnpm':
      updateCommand = 'pnpm';
      updateArgs = ['add', '-g', `@kaitranntt/ccs@${targetTag}`];
      cacheCommand = 'pnpm';
      cacheArgs = ['store', 'prune'];
      break;
    case 'bun':
      updateCommand = 'bun';
      updateArgs = ['add', '-g', `@kaitranntt/ccs@${targetTag}`];
      // On Windows, bun's global bin symlink may not update properly without removal first
      // Pre-remove to ensure clean reinstall (mirrors dev-install.sh behavior)
      cacheCommand = process.platform === 'win32' ? 'bun' : null;
      cacheArgs = process.platform === 'win32' ? ['remove', '-g', '@kaitranntt/ccs'] : null;
      break;
    default:
      updateCommand = 'npm';
      updateArgs = ['install', '-g', `@kaitranntt/ccs@${targetTag}`];
      cacheCommand = 'npm';
      cacheArgs = ['cache', 'clean', '--force'];
  }

  console.log(info(`${isReinstall ? 'Reinstalling' : 'Updating'} via ${packageManager}...`));
  console.log('');

  const isWindows = process.platform === 'win32';

  const performUpdate = (): void => {
    // On Windows, use shell with full command string to avoid deprecation warning
    // Also suppress Node deprecation warnings that may come from package managers
    // Pipe stderr on Windows to filter npm cleanup warnings (EPERM on native modules)
    const child = isWindows
      ? spawn(`${updateCommand} ${updateArgs.join(' ')}`, [], {
          stdio: ['inherit', 'inherit', 'pipe'],
          shell: true,
          env: { ...childEnv, NODE_NO_WARNINGS: '1' },
        })
      : spawn(updateCommand, updateArgs, { stdio: 'inherit', env: childEnv });

    // On Windows, filter stderr to hide npm cleanup warnings (EPERM on bcrypt.node etc.)
    // These warnings are cosmetic - update succeeds despite file locking by antivirus/indexing
    // Use line-buffering to handle chunk splitting (data events don't guarantee message boundaries)
    if (isWindows && child.stderr) {
      let stderrBuffer = '';
      child.stderr.on('data', (data: Buffer) => {
        stderrBuffer += data.toString();
        const lines = stderrBuffer.split('\n');
        stderrBuffer = lines.pop() || ''; // Keep incomplete line in buffer
        for (const line of lines) {
          // Skip npm cleanup warnings (EPERM, ENOTEMPTY, EBUSY on native module prebuilds)
          if (!/npm warn cleanup/i.test(line)) {
            process.stderr.write(line + '\n');
          }
        }
      });
      child.stderr.on('close', () => {
        // Flush remaining buffer on stream close
        if (stderrBuffer && !/npm warn cleanup/i.test(stderrBuffer)) {
          process.stderr.write(stderrBuffer);
        }
      });
    }

    child.on('exit', (code) => {
      if (code === 0) {
        if (expectedVersion || previousState?.version) {
          verifyCurrentInstallVersion(
            currentInstall,
            targetTag,
            expectedVersion,
            previousState,
            isReinstall
          );
        }
        console.log('');
        console.log(ok(`${isReinstall ? 'Reinstall' : 'Update'} successful!`));
        console.log('');
        console.log(`Run ${color('ccs --version', 'command')} to verify`);
        console.log(info(`Tip: Use ${color('ccs config', 'command')} for web-based configuration`));
        console.log('');
      } else {
        console.log('');
        console.log(fail(`${isReinstall ? 'Reinstall' : 'Update'} failed`));
        console.log('');
        console.log('Try manually:');
        console.log(color(`  ${formatManualUpdateCommand(targetTag, currentInstall)}`, 'command'));
        console.log('');
      }
      process.exit(code || 0);
    });

    child.on('error', () => {
      console.log('');
      console.log(fail(`Failed to run ${packageManager} ${isReinstall ? 'reinstall' : 'update'}`));
      console.log('');
      console.log('Try manually:');
      console.log(color(`  ${formatManualUpdateCommand(targetTag, currentInstall)}`, 'command'));
      console.log('');
      process.exit(1);
    });
  };

  if (cacheCommand && cacheArgs) {
    // For bun on Windows, we pre-remove instead of cache clear
    const isBunPreRemove = packageManager === 'bun' && cacheArgs.includes('remove');
    const stepMessage = isBunPreRemove
      ? 'Removing existing installation...'
      : 'Clearing package cache...';
    const failMessage = isBunPreRemove
      ? 'Pre-removal failed, proceeding anyway...'
      : 'Cache clearing failed, proceeding anyway...';

    console.log(info(stepMessage));
    // On Windows, use shell with full command string to avoid deprecation warning
    const cacheChild = isWindows
      ? spawn(`${cacheCommand} ${cacheArgs.join(' ')}`, [], {
          stdio: 'inherit',
          shell: true,
          env: { ...childEnv, NODE_NO_WARNINGS: '1' },
        })
      : spawn(cacheCommand, cacheArgs, { stdio: 'inherit', env: childEnv });

    cacheChild.on('exit', (code) => {
      if (code !== 0) {
        console.log(warn(failMessage));
      }
      performUpdate();
    });

    cacheChild.on('error', () => {
      console.log(warn(failMessage));
      performUpdate();
    });
  } else {
    performUpdate();
  }
}
