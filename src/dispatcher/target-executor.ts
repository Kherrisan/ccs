/**
 * Native target execution — short-circuit dispatch for passthrough flag commands.
 *
 * Extracted from src/ccs.ts (lines 291-295, 394-426).
 * Handles direct execution of native Codex flag passthrough (--help, --version, etc.)
 * before the main profile dispatch loop runs.
 */

import { fail, info } from '../utils/ui';
import { getTarget } from '../targets';
import { getNativeCodexPassthroughArgs } from './cli-argument-parser';
import type { TargetCredentials } from '../targets';

// ========== Interfaces ==========

export interface ProfileError extends Error {
  profileName?: string;
  availableProfiles?: string;
  suggestions?: string[];
}

// ========== Native Codex Flag Command Executor ==========

export function execNativeCodexFlagCommand(args: string[]): void {
  const adapter = getTarget('codex');
  if (!adapter) {
    console.error(fail('Target adapter not found for "codex"'));
    process.exit(1);
  }

  const binaryInfo = adapter.detectBinary();
  if (!binaryInfo) {
    console.error(fail('Codex CLI not found.'));
    console.error(info('Install a recent @openai/codex build, then retry.'));
    process.exit(1);
  }

  const targetArgs = getNativeCodexPassthroughArgs(args);
  if (!targetArgs) {
    console.error(fail('Native Codex passthrough args could not be resolved.'));
    process.exit(1);
  }
  const creds: TargetCredentials = {
    profile: 'default',
    baseUrl: '',
    apiKey: '',
  };

  const builtArgs = adapter.buildArgs('default', targetArgs, {
    creds,
    profileType: 'default',
    binaryInfo,
  });
  const targetEnv = adapter.buildEnv(creds, 'default');
  adapter.exec(builtArgs, targetEnv, { binaryInfo });
}
