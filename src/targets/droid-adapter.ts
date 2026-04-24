/**
 * Droid Adapter
 *
 * TargetAdapter implementation for Factory Droid CLI.
 * Writes credentials + active model to ~/.factory/settings.json and spawns `droid`.
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import { TargetAdapter, TargetBinaryInfo, TargetCredentials, TargetType } from './target-adapter';
import { getDroidBinaryInfo, detectDroidCli, checkDroidVersion } from './droid-detector';
import type { ProfileType } from '../types/profile';
import { upsertCcsModel } from './droid-config-manager';
import { resolveDroidProvider } from './droid-provider';
import {
  escapeShellArg,
  getWindowsEscapedCommandShell,
  stripAnthropicEnv,
} from '../utils/shell-executor';
import { wireChildProcessSignals } from '../utils/signal-forwarder';
import { runCleanup } from '../errors';

export class DroidAdapter implements TargetAdapter {
  readonly type: TargetType = 'droid';
  readonly displayName = 'Factory Droid';

  private validateCredentials(creds: TargetCredentials): void {
    if (!creds.baseUrl?.trim()) {
      throw new Error('Droid target requires ANTHROPIC_BASE_URL');
    }
    if (!creds.apiKey?.trim()) {
      throw new Error('Droid target requires ANTHROPIC_AUTH_TOKEN');
    }
  }

  detectBinary(): TargetBinaryInfo | null {
    const info = getDroidBinaryInfo();
    if (!info) return null;

    // Version compatibility check (non-blocking warning)
    checkDroidVersion(info.path);
    return info;
  }

  /**
   * Write CCS credentials to ~/.factory/settings.json as a custom model entry.
   * This is the key difference from Claude — Droid reads config files, not env vars.
   */
  async prepareCredentials(creds: TargetCredentials): Promise<void> {
    this.validateCredentials(creds);
    const provider = resolveDroidProvider({
      provider: creds.provider,
      baseUrl: creds.baseUrl,
      model: creds.model,
    });
    const modelRef = await upsertCcsModel(creds.profile, {
      model: creds.model || 'claude-opus-4-6',
      displayName: `CCS ${creds.profile}`,
      baseUrl: creds.baseUrl,
      apiKey: creds.apiKey,
      provider,
      reasoningOverride: creds.reasoningOverride,
    });
    if (!modelRef.selector) {
      throw new Error(`Failed to resolve Droid model selector for profile "${creds.profile}"`);
    }
  }

  buildArgs(profile: string, userArgs: string[]): string[] {
    if (!/^[a-zA-Z0-9._-]+$/.test(profile)) {
      throw new Error(
        `Invalid profile name "${profile}" for Droid target: only alphanumeric, dot, underscore, hyphen allowed`
      );
    }
    // Droid interactive mode treats unknown argv as queued prompt text.
    // Model selection must be persisted in settings.json (`model`) instead of `-m`.
    return [...userArgs];
  }

  /**
   * Droid uses config file for credentials — keep parent env, but strip stale
   * ANTHROPIC_* values so prior CCS/CLIProxy sessions do not leak into Droid.
   */
  buildEnv(_creds: TargetCredentials, _profileType: ProfileType): NodeJS.ProcessEnv {
    return { ...stripAnthropicEnv(process.env) };
  }

  exec(
    args: string[],
    env: NodeJS.ProcessEnv,
    options?: { cwd?: string; binaryInfo?: TargetBinaryInfo }
  ): void {
    const exitWithCleanup = (code: number): never => {
      try {
        runCleanup();
      } catch {
        // Cleanup should be best-effort on launch errors.
      }
      process.exit(code);
    };

    const droidPath = options?.binaryInfo?.path || detectDroidCli();
    if (!droidPath) {
      console.error('[X] Droid CLI not found. Install: npm i -g @factory/cli');
      return exitWithCleanup(1);
    }
    try {
      const stat = fs.statSync(droidPath);
      if (!stat.isFile()) {
        console.error(`[X] Droid CLI path is not a file: ${droidPath}`);
        return exitWithCleanup(1);
      }
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      console.error(
        `[X] Droid CLI path is not accessible (${error.code || 'unknown'}): ${droidPath}`
      );
      return exitWithCleanup(1);
    }

    const isWindows = process.platform === 'win32';
    const isPowerShellScript = isWindows && /\.ps1$/i.test(droidPath);
    const needsShell = isWindows && /\.(cmd|bat)$/i.test(droidPath);

    let child: ChildProcess;
    if (isPowerShellScript) {
      child = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', droidPath, ...args],
        {
          stdio: 'inherit',
          windowsHide: true,
          env,
        }
      );
    } else if (needsShell) {
      const cmdString = [droidPath, ...args].map(escapeShellArg).join(' ');
      child = spawn(cmdString, {
        stdio: 'inherit',
        windowsHide: true,
        shell: getWindowsEscapedCommandShell(),
        env,
      });
    } else {
      child = spawn(droidPath, args, {
        stdio: 'inherit',
        windowsHide: true,
        env,
      });
    }

    wireChildProcessSignals(child, (err: NodeJS.ErrnoException) => {
      if (err.code === 'EACCES') {
        console.error(`[X] Droid CLI is not executable: ${droidPath}`);
        console.error('    Check file permissions and executable bit.');
      } else if (err.code === 'ENOENT') {
        if (isPowerShellScript) {
          console.error('[X] PowerShell executable not found (required for .ps1 wrapper launch).');
          console.error('    Ensure powershell.exe is available in PATH.');
        } else if (needsShell) {
          console.error('[X] Windows command shell not found for Droid wrapper launch.');
          console.error('    Ensure cmd.exe is available and accessible.');
        } else {
          console.error(`[X] Droid CLI not found: ${droidPath}`);
          console.error('    Install: npm i -g @factory/cli');
        }
      } else {
        console.error(`[X] Failed to start Droid CLI (${droidPath}):`, err.message);
      }
      return exitWithCleanup(1);
    });
  }

  /** Droid supports settings/default and CLIProxy-executed profile flows. */
  supportsProfileType(profileType: ProfileType): boolean {
    return profileType === 'settings' || profileType === 'default' || profileType === 'cliproxy';
  }
}
