/**
 * Claude Spawner Utilities
 *
 * Cross-platform Claude CLI spawn utilities for CCS.
 * Handles Windows .cmd/.bat/.ps1 files properly.
 */

import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import {
  escapeShellArg,
  getWindowsEscapedCommandShell,
  stripClaudeCodeEnv,
} from './shell-executor';
import { getClaudeCliInfo } from './claude-detector';
import { ErrorManager } from './error-manager';

export interface SpawnClaudeOptions {
  /** Arguments to pass to Claude CLI */
  args?: string[];
  /** Environment variables to merge with process.env */
  env?: NodeJS.ProcessEnv;
  /** Working directory */
  cwd?: string;
  /** Stdio configuration (default: 'inherit') */
  stdio?: SpawnOptions['stdio'];
}

export interface SpawnClaudeResult {
  /** The spawned child process */
  child: ChildProcess;
  /** Path to the Claude CLI executable */
  claudePath: string;
}

/**
 * Spawn Claude CLI with cross-platform support.
 *
 * Handles Windows .cmd/.bat/.ps1 wrappers automatically.
 * Returns the ChildProcess for custom event handling.
 *
 * @throws Error if Claude CLI is not found
 */
export function spawnClaude(options: SpawnClaudeOptions = {}): SpawnClaudeResult {
  const claudeInfo = getClaudeCliInfo();
  if (!claudeInfo) {
    throw new Error('Claude CLI not found');
  }

  const { path: claudeCli, needsShell } = claudeInfo;
  const { args = [], env, cwd, stdio = 'inherit' } = options;

  // Merge environment
  const mergedEnvBase = env ? { ...process.env, ...env } : process.env;
  const mergedEnv = stripClaudeCodeEnv(mergedEnvBase);

  let child: ChildProcess;
  if (needsShell) {
    // Windows .cmd/.bat/.ps1: concatenate into string to avoid DEP0190 warning
    const cmdString = [claudeCli, ...args].map(escapeShellArg).join(' ');
    child = spawn(cmdString, {
      stdio,
      windowsHide: true,
      shell: getWindowsEscapedCommandShell(),
      env: mergedEnv,
      cwd,
    });
  } else {
    // Unix or Windows native: use array form (faster, no shell overhead)
    child = spawn(claudeCli, args, {
      stdio,
      windowsHide: true,
      env: mergedEnv,
      cwd,
    });
  }

  return { child, claudePath: claudeCli };
}

/**
 * Spawn Claude CLI and wait for exit.
 *
 * Convenience function that returns a promise resolving to the exit code.
 */
export function spawnClaudeSync(options: SpawnClaudeOptions = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    try {
      const { child } = spawnClaude(options);

      child.on('exit', (code) => {
        resolve(code ?? 0);
      });

      child.on('error', (error) => {
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Spawn Claude CLI with automatic exit handling.
 *
 * Exits the current process when Claude exits, preserving exit code/signal.
 * Used for simple pass-through scenarios.
 */
export function execClaudeWithExitHandling(options: SpawnClaudeOptions = {}): void {
  let result: SpawnClaudeResult;

  try {
    result = spawnClaude(options);
  } catch {
    // Claude not found - show error and exit
    void ErrorManager.showClaudeNotFound();
    process.exit(1);
  }

  const { child } = result;

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal as NodeJS.Signals);
    } else {
      process.exit(code ?? 0);
    }
  });

  child.on('error', async () => {
    await ErrorManager.showClaudeNotFound();
    process.exit(1);
  });
}

/**
 * Check if shell execution is needed for a given path.
 *
 * Returns true for Windows .cmd/.bat/.ps1 files.
 */
export function needsShellExecution(executablePath: string): boolean {
  const isWindows = process.platform === 'win32';
  return isWindows && /\.(cmd|bat|ps1)$/i.test(executablePath);
}
