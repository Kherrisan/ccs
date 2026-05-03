/**
 * CLI argument parsing and normalization utilities.
 *
 * Extracted from src/ccs.ts (lines 129-244, 246-296, 371-392).
 * Pure functions — no side effects except console.error and process.exit.
 */

import { fail, warn } from '../utils/ui';
import { LEGACY_CURSOR_PROFILE_NAME } from '../cursor/constants';
import { resolveTargetType, stripTargetFlag } from '../targets/target-resolver';
import { resolveDroidReasoningRuntime } from '../targets/droid-reasoning-runtime';
import type { ProfileDetectionResult } from '../auth/profile-detector';

// ========== Interfaces ==========

export interface DetectedProfile {
  profile: string;
  remainingArgs: string[];
}

export interface RuntimeReasoningResolution {
  argsWithoutReasoningFlags: string[];
  reasoningOverride: string | number | undefined;
  reasoningSource: 'flag' | 'env' | undefined;
  sourceDisplay: string | undefined;
}

// ========== Constants ==========

export const CODEX_RUNTIME_REASONING_LEVELS = new Set([
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
]);

export const CODEX_NATIVE_PASSTHROUGH_FLAGS = new Set(['--help', '-h', '--version', '-v']);

export const NATIVE_CLAUDE_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export const NATIVE_CLAUDE_EFFORT_LEVEL_SET = new Set<string>(NATIVE_CLAUDE_EFFORT_LEVELS);

// ========== Profile Detection ==========

/**
 * Smart profile detection — first non-flag arg is the profile name.
 */
export function detectProfile(args: string[]): DetectedProfile {
  if (args.length === 0 || args[0].startsWith('-')) {
    // No args or first arg is a flag → use default profile
    return { profile: 'default', remainingArgs: args };
  } else {
    // First arg doesn't start with '-' → treat as profile name
    return { profile: args[0], remainingArgs: args.slice(1) };
  }
}

export function normalizeLegacyCursorArgs(args: string[]): string[] {
  if (args[0] === 'legacy' && args[1] === 'cursor') {
    return [LEGACY_CURSOR_PROFILE_NAME, ...args.slice(2)];
  }

  return args;
}

export function printCursorLegacySubcommandDeprecation(subcommand: string): void {
  console.error(
    warn(`\`ccs cursor ${subcommand}\` is deprecated for the legacy Cursor IDE bridge.`)
  );
  console.error(
    warn(
      `Use \`ccs legacy cursor ${subcommand}\` for the old bridge, or \`ccs cursor --auth|--accounts|--config\` for the CLIProxy provider.`
    )
  );
  console.error('');
}

// ========== Runtime Reasoning Flags ==========

export function resolveRuntimeReasoningFlags(
  args: string[],
  envThinkingValue: string | undefined
): RuntimeReasoningResolution {
  const runtime = resolveDroidReasoningRuntime(args, envThinkingValue);

  if (runtime.duplicateDisplays.length > 0) {
    console.error(
      warn(
        `[!] Multiple reasoning flags detected. Using first occurrence: ${runtime.sourceDisplay || '<first-flag>'}`
      )
    );
  }

  return {
    argsWithoutReasoningFlags: runtime.argsWithoutReasoningFlags,
    reasoningOverride: runtime.reasoningOverride,
    reasoningSource: runtime.sourceFlag
      ? 'flag'
      : runtime.reasoningOverride !== undefined
        ? 'env'
        : undefined,
    sourceDisplay: runtime.sourceDisplay,
  };
}

export function normalizeCodexRuntimeReasoningOverride(
  value: string | number | undefined
): string | undefined {
  return typeof value === 'string' && CODEX_RUNTIME_REASONING_LEVELS.has(value) ? value : undefined;
}

export function exitWithRuntimeReasoningFlagError(
  message: string,
  options: {
    codexAliasLevels: string;
    includeDroidExecExample?: boolean;
  }
): never {
  console.error(fail(message));
  console.error('    Examples: --thinking low, --thinking 8192, --thinking off');
  console.error(`    Codex alias: --effort ${options.codexAliasLevels}`);
  if (options.includeDroidExecExample) {
    console.error('    Droid exec: --reasoning-effort high');
  }
  process.exit(1);
}

// ========== Native Claude Effort Normalization ==========

export function normalizeNativeClaudeEffortArgs(args: string[]): string[] {
  const normalizedArgs: string[] = [];
  const allowedValues = NATIVE_CLAUDE_EFFORT_LEVELS.join(', ');

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--effort') {
      const rawValue = args[i + 1];
      if (!rawValue || rawValue.startsWith('-') || !rawValue.trim()) {
        throw new Error(`--effort requires a value: ${allowedValues}`);
      }
      const value = rawValue.toLowerCase();
      if (!NATIVE_CLAUDE_EFFORT_LEVEL_SET.has(value)) {
        throw new Error(`Invalid --effort value: ${rawValue}. Expected one of: ${allowedValues}.`);
      }
      normalizedArgs.push(arg, value);
      i++;
      continue;
    }

    if (arg.startsWith('--effort=')) {
      const rawValue = arg.slice('--effort='.length);
      if (!rawValue.trim()) {
        throw new Error(`--effort requires a value: ${allowedValues}`);
      }
      const value = rawValue.toLowerCase();
      if (!NATIVE_CLAUDE_EFFORT_LEVEL_SET.has(value)) {
        throw new Error(`Invalid --effort value: ${rawValue}. Expected one of: ${allowedValues}.`);
      }
      normalizedArgs.push(`--effort=${value}`);
      continue;
    }

    normalizedArgs.push(arg);
  }

  return normalizedArgs;
}

export function shouldNormalizeNativeClaudeEffort(
  profileType: ProfileDetectionResult['type']
): boolean {
  return profileType === 'default' || profileType === 'account' || profileType === 'settings';
}

// ========== Native Codex Passthrough ==========

export function shouldPassthroughNativeCodexFlagCommand(args: string[]): boolean {
  return getNativeCodexPassthroughArgs(args) !== null;
}

export function getNativeCodexPassthroughArgs(args: string[]): string[] | null {
  const targetArgs = stripTargetFlag(args);
  if (resolveTargetType(args) !== 'codex' || targetArgs.length === 0) {
    return null;
  }

  const firstArg = targetArgs[0] || '';
  if (CODEX_NATIVE_PASSTHROUGH_FLAGS.has(firstArg)) {
    return targetArgs;
  }

  const secondArg = targetArgs[1] || '';
  if (firstArg === 'codex' && CODEX_NATIVE_PASSTHROUGH_FLAGS.has(secondArg)) {
    return targetArgs.slice(1);
  }

  return null;
}
