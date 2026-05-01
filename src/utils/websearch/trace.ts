/**
 * Best-effort WebSearch trace helpers.
 *
 * Writes opt-in JSONL trace records to ~/.ccs/logs/websearch-trace.jsonl so
 * CCS can explain launch intent, MCP exposure, provider selection, and likely
 * bypass scenarios without polluting Claude/MCP stdout.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getCcsDir } from '../config-manager';
import { createLogger } from '../../services/logging';
import { hasManagedPromptFileArg, PROMPT_FLAG_INLINE } from '../prompt-injection-strategy';
import { THIRD_PARTY_WEBSEARCH_STEERING_PROMPT } from './claude-tool-args';

const TRACE_FILE_NAME = 'websearch-trace.jsonl';
const NATIVE_WEBSEARCH_TOOL = 'WebSearch';
const DISALLOWED_TOOLS_FLAG = '--disallowedTools';
const logger = createLogger('websearch');

function parseToolValue(rawValue: string): string[] {
  return rawValue
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function getImmediateFlagValue(args: string[], index: number): string | null {
  const value = args[index + 1];
  if (value === undefined || value === '--' || value.startsWith('--')) {
    return null;
  }
  return value;
}

function hasToolInFlag(args: string[], flag: string, toolName: string): boolean {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === flag) {
      const value = getImmediateFlagValue(args, index);
      if (value && parseToolValue(value).includes(toolName)) {
        return true;
      }
      continue;
    }

    if (arg.startsWith(`${flag}=`)) {
      const rawValue = arg.slice(flag.length + 1);
      if (parseToolValue(rawValue).includes(toolName)) {
        return true;
      }
    }
  }

  return false;
}

function hasExactFlagValue(params: {
  args: string[];
  flag: string;
  expectedValue: string;
}): boolean {
  const { args, flag, expectedValue } = params;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === flag) {
      const immediateFlagValue = getImmediateFlagValue(args, index);

      if (immediateFlagValue === expectedValue) {
        return true;
      }

      continue;
    }

    if (arg === `${flag}=${expectedValue}`) {
      return true;
    }
  }

  return false;
}

function normalizeSafePrefix(inputPath: string): string {
  return `${path.resolve(inputPath)}${path.sep}`;
}

function getSafeTracePrefixes(): string[] {
  return [
    normalizeSafePrefix(path.join(getCcsDir(), 'logs')),
    normalizeSafePrefix(os.tmpdir()),
    normalizeSafePrefix('/var/log'),
  ];
}

export function resolveAllowedWebSearchTraceFile(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const configured = env.CCS_WEBSEARCH_TRACE_FILE?.trim();
  if (!configured) {
    return null;
  }

  const resolved = path.resolve(configured);
  if (getSafeTracePrefixes().some((prefix) => resolved.startsWith(prefix))) {
    return resolved;
  }

  return null;
}

function getTraceFilePath(env: NodeJS.ProcessEnv): string {
  return resolveAllowedWebSearchTraceFile(env) ?? path.join(getCcsDir(), 'logs', TRACE_FILE_NAME);
}

export function isWebSearchTraceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CCS_WEBSEARCH_TRACE === '1' || env.CCS_DEBUG === '1';
}

export function appendWebSearchTrace(
  event: string,
  payload: Record<string, unknown> = {},
  env: NodeJS.ProcessEnv = process.env
): void {
  if (!isWebSearchTraceEnabled(env)) {
    return;
  }

  try {
    logger.info('trace.append', 'WebSearch trace event recorded', {
      event,
      launchId: env.CCS_WEBSEARCH_TRACE_LAUNCH_ID || null,
      payload,
    });
    const traceFilePath = getTraceFilePath(env);
    fs.mkdirSync(path.dirname(traceFilePath), { recursive: true });
    fs.appendFileSync(
      traceFilePath,
      JSON.stringify({
        at: new Date().toISOString(),
        event,
        launchId: env.CCS_WEBSEARCH_TRACE_LAUNCH_ID || null,
        launcher: env.CCS_WEBSEARCH_TRACE_LAUNCHER || null,
        profileType: env.CCS_PROFILE_TYPE || null,
        pid: process.pid,
        ...payload,
      }) + '\n',
      'utf8'
    );
  } catch {
    // Tracing must never affect launch behavior.
  }
}

export function readWebSearchTraceRecords(
  launchId: string,
  env: NodeJS.ProcessEnv = process.env
): Array<Record<string, unknown>> {
  if (!launchId) {
    return [];
  }

  try {
    const traceFilePath = getTraceFilePath(env);
    if (!fs.existsSync(traceFilePath)) {
      return [];
    }

    return fs
      .readFileSync(traceFilePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((record) => record.launchId === launchId);
  } catch {
    return [];
  }
}

function buildLaunchId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `websearch-${Date.now()}-${process.pid}-${random}`;
}

function hasSteeringPromptInArgs(args: string[]): boolean {
  if (
    hasExactFlagValue({
      args,
      flag: PROMPT_FLAG_INLINE,
      expectedValue: THIRD_PARTY_WEBSEARCH_STEERING_PROMPT.content,
    })
  ) {
    return true;
  }

  if (hasManagedPromptFileArg({ args, promptName: THIRD_PARTY_WEBSEARCH_STEERING_PROMPT.name })) {
    return true;
  }

  return false;
}

function summarizeLaunchArgs(args: string[]): Record<string, unknown> {
  return {
    argCount: args.length,
    hasSettingsFlag: args.includes('--settings'),
    nativeWebSearchDisallowed: hasToolInFlag(args, DISALLOWED_TOOLS_FLAG, NATIVE_WEBSEARCH_TOOL),
    steeringPromptApplied: hasSteeringPromptInArgs(args),
  };
}

export function createWebSearchTraceContext(params: {
  launcher: string;
  args: string[];
  cwd?: string;
  profile?: string;
  profileType?: string;
  settingsPath?: string;
  claudeConfigDir?: string;
  env?: NodeJS.ProcessEnv;
}): Record<string, string> {
  const env = params.env ?? process.env;
  if (!isWebSearchTraceEnabled(env)) {
    return {};
  }

  const launchId = buildLaunchId();
  const traceEnv: Record<string, string> = {
    CCS_WEBSEARCH_TRACE: '1',
    CCS_WEBSEARCH_TRACE_LAUNCH_ID: launchId,
    CCS_WEBSEARCH_TRACE_LAUNCHER: params.launcher,
  };

  const traceFileOverride = resolveAllowedWebSearchTraceFile(env);
  if (traceFileOverride) {
    traceEnv.CCS_WEBSEARCH_TRACE_FILE = traceFileOverride;
  }

  appendWebSearchTrace(
    'ccs_websearch_launch',
    {
      launcher: params.launcher,
      profile: params.profile || null,
      profileType: params.profileType || null,
      cwd: params.cwd || null,
      settingsPath: params.settingsPath || null,
      claudeConfigDir: params.claudeConfigDir || null,
      ...summarizeLaunchArgs(params.args),
    },
    {
      ...env,
      ...traceEnv,
      CCS_PROFILE_TYPE: params.profileType || env.CCS_PROFILE_TYPE || '',
    }
  );

  return traceEnv;
}
