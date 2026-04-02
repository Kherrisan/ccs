#!/usr/bin/env node

/**
 * Headless executor for Claude CLI delegation
 * Spawns claude with -p flag for single-turn execution
 */

import { spawn } from 'child_process';
import * as path from 'path';
import { killWithEscalation } from '../utils/process-utils';
import * as fs from 'fs';
import { SessionManager } from './session-manager';
import { SettingsParser } from './settings-parser';
import { ui, warn, info } from '../utils/ui';
import { type ExecutionOptions, type ExecutionResult, type StreamMessage } from './executor/types';
import { StreamBuffer, formatToolVerbose } from './executor/stream-parser';
import { buildExecutionResult } from './executor/result-aggregator';
import { getCcsDir, getModelDisplayName } from '../utils/config-manager';
import { getProfileLookupCandidates } from '../utils/profile-compat';
import { getClaudeLaunchEnvOverrides, stripClaudeCodeEnv } from '../utils/shell-executor';
import { resolveProfileContinuityInheritance } from '../auth/profile-continuity-inheritance';
import {
  appendThirdPartyWebSearchToolArgs,
  appendWebSearchTrace,
  createWebSearchTraceContext,
  ensureWebSearchMcpOrThrow,
  getWebSearchHookEnv,
  readWebSearchTraceRecords,
  syncWebSearchMcpToConfigDir,
} from '../utils/websearch-manager';

// Re-export types for consumers
export type { ExecutionOptions, ExecutionResult, StreamMessage } from './executor/types';

/**
 * Headless executor for Claude CLI delegation
 */
export class HeadlessExecutor {
  /**
   * Execute task via headless Claude CLI
   * @param profile - Profile name (glm, km, custom)
   * @param enhancedPrompt - Enhanced prompt with context
   * @param options - Execution options
   * @returns execution result
   */
  static async execute(
    profile: string,
    enhancedPrompt: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const {
      cwd = process.cwd(),
      timeout = 600000, // 10 minutes default
      permissionMode = 'acceptEdits',
      resumeSession = false,
      sessionId = null,
      maxTurns,
      fallbackModel,
      agents,
      betas,
      extraArgs = [],
    } = options;

    // Validate permission mode
    this._validatePermissionMode(permissionMode);

    // Initialize session manager
    const sessionMgr = new SessionManager();

    // Detect Claude CLI path
    const claudeCli = this._detectClaudeCli();
    if (!claudeCli) {
      throw new Error(
        'Claude CLI not found in PATH. Install from: https://docs.claude.com/en/docs/claude-code/installation'
      );
    }

    // Get settings path for profile (supports compatibility aliases like km -> kimi)
    const ccsDir = getCcsDir();
    const settingsCandidates = getProfileLookupCandidates(profile).map((candidate) =>
      path.join(ccsDir, `${candidate}.settings.json`)
    );
    const settingsPath = settingsCandidates.find((candidatePath) => fs.existsSync(candidatePath));
    const primarySettingsPath = path.join(ccsDir, `${profile}.settings.json`);

    // Validate settings file exists
    if (!settingsPath) {
      throw new Error(
        `Settings file not found: ${primarySettingsPath}\nProfile "${profile}" may not be configured.`
      );
    }

    const continuityInheritance = await resolveProfileContinuityInheritance({
      profileName: profile,
      profileType: 'settings',
      target: 'claude',
    });
    const inheritedClaudeConfigDir = continuityInheritance.claudeConfigDir;
    if (continuityInheritance.sourceAccount && process.env.CCS_DEBUG) {
      console.error(
        info(
          `Continuity inheritance active: profile "${profile}" -> account "${continuityInheritance.sourceAccount}"`
        )
      );
    }

    ensureWebSearchMcpOrThrow();
    syncWebSearchMcpToConfigDir(inheritedClaudeConfigDir);

    // Smart slash command detection and preservation
    const processedPrompt = this._processSlashCommand(enhancedPrompt);

    // Prepare arguments
    const args: string[] = ['-p', processedPrompt, '--settings', settingsPath];

    // Always use stream-json for real-time progress visibility
    args.push('--output-format', 'stream-json', '--verbose');

    // Add permission mode
    if (permissionMode && permissionMode !== 'default') {
      if (permissionMode === 'bypassPermissions') {
        args.push('--dangerously-skip-permissions');
        if (process.env.CCS_DEBUG) {
          console.warn(warn('WARNING: Using --dangerously-skip-permissions mode'));
        }
      } else {
        args.push('--permission-mode', permissionMode);
      }
    }

    // Add resume flag for multi-turn sessions
    if (resumeSession) {
      const lastSession = sessionMgr.getLastSession(profile);
      if (lastSession) {
        args.push('--resume', lastSession.sessionId);
        if (process.env.CCS_DEBUG) {
          const cost = lastSession.totalCost?.toFixed(4) || '0.0000';
          console.error(info(`Resuming session: ${lastSession.sessionId} ($${cost})`));
        }
      } else if (sessionId) {
        args.push('--resume', sessionId);
      } else {
        console.warn(warn('No previous session found, starting new session'));
      }
    } else if (sessionId) {
      args.push('--resume', sessionId);
    }

    // Add tool restrictions from settings
    const toolRestrictions = SettingsParser.parseToolRestrictions(cwd);
    if (toolRestrictions.allowedTools.length > 0) {
      args.push('--allowedTools', ...toolRestrictions.allowedTools);
    }
    if (toolRestrictions.disallowedTools.length > 0) {
      args.push('--disallowedTools', toolRestrictions.disallowedTools.join(','));
    }

    // Claude Code CLI passthrough flags (explicit, validated)
    // Use undefined checks (not truthy) to allow empty strings if ever valid
    if (maxTurns !== undefined && maxTurns > 0) {
      args.push('--max-turns', String(maxTurns));
    }
    if (fallbackModel !== undefined && fallbackModel) {
      args.push('--fallback-model', fallbackModel);
    }
    if (agents !== undefined && agents) {
      args.push('--agents', agents);
    }
    if (betas !== undefined && betas) {
      args.push('--betas', betas);
    }

    // Passthrough extra args (catch-all for new/unknown flags)
    // Filter out duplicates of explicitly handled flags
    if (extraArgs.length > 0) {
      const explicitFlags = new Set(['--max-turns', '--fallback-model', '--agents', '--betas']);
      const filteredExtras: string[] = [];
      for (let i = 0; i < extraArgs.length; i++) {
        if (explicitFlags.has(extraArgs[i])) {
          // Skip this flag and its value (next element)
          if (i + 1 < extraArgs.length && !extraArgs[i + 1].startsWith('-')) {
            i++; // Skip value too
          }
          continue;
        }
        filteredExtras.push(extraArgs[i]);
      }
      if (filteredExtras.length > 0) {
        args.push(...filteredExtras);
      }
    }

    const launchArgs = appendThirdPartyWebSearchToolArgs(args);
    const traceEnv = createWebSearchTraceContext({
      launcher: 'delegation.headless-executor',
      args: launchArgs,
      cwd,
      profile,
      profileType: 'settings',
      settingsPath,
      claudeConfigDir: inheritedClaudeConfigDir,
    });

    if (process.env.CCS_DEBUG) {
      console.error(info(`Claude CLI args: ${launchArgs.join(' ')}`));
    }

    // Initialize UI before spawning
    await ui.init();

    // Execute with spawn
    return this._spawnAndExecute(claudeCli, launchArgs, {
      cwd,
      profile,
      timeout,
      resumeSession,
      sessionId,
      sessionMgr,
      claudeConfigDir: inheritedClaudeConfigDir,
      traceEnv,
    });
  }

  /**
   * Spawn Claude CLI and handle execution
   */
  private static _spawnAndExecute(
    claudeCli: string,
    args: string[],
    ctx: {
      cwd: string;
      profile: string;
      timeout: number;
      resumeSession: boolean;
      sessionId: string | null;
      sessionMgr: SessionManager;
      claudeConfigDir?: string;
      traceEnv?: Record<string, string>;
    }
  ): Promise<ExecutionResult> {
    const {
      cwd,
      profile,
      timeout,
      resumeSession,
      sessionId,
      sessionMgr,
      claudeConfigDir,
      traceEnv = {},
    } = ctx;

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const showProgress = !process.env.CCS_QUIET;
      const streamBuffer = new StreamBuffer();

      if (showProgress) {
        const modelName = getModelDisplayName(profile);
        console.error(ui.info(`Delegating to ${modelName}...`));
      }

      // Strip Claude Code nested session guard env var to allow CCS delegation
      // (Claude Code v2.1.39+ sets CLAUDECODE to detect nested sessions)
      const cleanEnv = stripClaudeCodeEnv({
        ...process.env,
        ...getClaudeLaunchEnvOverrides(),
        ...getWebSearchHookEnv(),
        ...traceEnv,
        ...(claudeConfigDir ? { CLAUDE_CONFIG_DIR: claudeConfigDir } : {}),
        CCS_PROFILE_TYPE: 'settings',
      });

      const proc = spawn(claudeCli, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout,
        env: cleanEnv,
      });

      let stdout = '';
      let stderr = '';
      let progressInterval: NodeJS.Timeout | undefined;
      const messages: StreamMessage[] = [];
      let timedOut = false;

      // Setup signal handlers for cleanup
      const cleanupHandler = () => {
        if (proc.exitCode === null) {
          killWithEscalation(proc, 2000);
        }
      };
      process.once('SIGINT', cleanupHandler);
      process.once('SIGTERM', cleanupHandler);
      const removeSignalHandlers = () => {
        process.removeListener('SIGINT', cleanupHandler);
        process.removeListener('SIGTERM', cleanupHandler);
      };
      proc.on('close', removeSignalHandlers);
      proc.on('error', removeSignalHandlers);

      // Progress indicator
      if (showProgress) {
        progressInterval = setInterval(() => {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          process.stderr.write(`${ui.info(`Still running... ${elapsed}s elapsed`)}\r`);
        }, 5000);
      }

      // Capture stdout (stream-json format)
      proc.stdout?.on('data', (data: Buffer) => {
        const dataStr = data.toString();
        stdout += dataStr;

        const parsedMessages = streamBuffer.parseChunk(dataStr);
        for (const msg of parsedMessages) {
          messages.push(msg);

          // Show real-time tool use
          if (showProgress && msg.type === 'assistant') {
            const toolUses = msg.message?.content?.filter((c) => c.type === 'tool_use') || [];
            for (const tool of toolUses) {
              process.stderr.write('\r\x1b[K');
              const toolInput = tool.input || {};
              const verboseMsg = formatToolVerbose(tool.name || 'Unknown', toolInput);
              process.stderr.write(`${verboseMsg}\n`);
            }
          }
        }
      });

      // Stream stderr in real-time
      proc.stderr?.on('data', (data: Buffer) => {
        const stderrText = data.toString();
        stderr += stderrText;
        if (showProgress) {
          if (progressInterval) process.stderr.write('\r\x1b[K');
          process.stderr.write(stderrText);
        }
      });

      // Handle completion
      proc.on('close', (exitCode: number | null) => {
        const duration = Date.now() - startTime;

        if (progressInterval) {
          clearInterval(progressInterval);
          process.stderr.write('\r\x1b[K');
        }

        if (showProgress) {
          const durationSec = (duration / 1000).toFixed(1);
          console.error(
            timedOut
              ? ui.warn(`Timed out after ${durationSec}s`)
              : ui.info(`Completed in ${durationSec}s`)
          );
          console.error('');
        }

        const result = buildExecutionResult({
          exitCode: exitCode || 0,
          stdout,
          stderr,
          cwd,
          profile,
          duration,
          timedOut,
          messages,
        });

        const launchId = traceEnv.CCS_WEBSEARCH_TRACE_LAUNCH_ID;
        if (launchId) {
          const launchTraceRecords = readWebSearchTraceRecords(launchId, {
            ...process.env,
            ...traceEnv,
            CCS_PROFILE_TYPE: 'settings',
          });
          const mcpSessionSummary = [...launchTraceRecords]
            .reverse()
            .find((record) => record.event === 'mcp_session_summary');
          const providerSuccess = [...launchTraceRecords]
            .reverse()
            .find((record) => record.event === 'websearch_provider_success');

          const exposed = mcpSessionSummary?.exposed === true;
          const calledWebSearch = result.toolUsageSummary?.calledWebSearch === true;
          const fallbackToolsUsed = result.toolUsageSummary?.fallbackToolsUsed || [];

          appendWebSearchTrace(
            'headless_websearch_summary',
            {
              profile,
              sessionId: result.sessionId || null,
              calledWebSearch,
              fallbackToolsUsed,
              providerUsed:
                typeof providerSuccess?.providerName === 'string'
                  ? providerSuccess.providerName
                  : null,
              exposed,
              likelyBypassed:
                exposed && !calledWebSearch
                  ? fallbackToolsUsed.length > 0
                    ? true
                    : 'unknown'
                  : false,
            },
            {
              ...process.env,
              ...traceEnv,
              CCS_PROFILE_TYPE: 'settings',
            }
          );
        }

        // Store session
        if (result.sessionId) {
          if (resumeSession || sessionId) {
            sessionMgr.updateSession(profile, result.sessionId, { totalCost: result.totalCost });
          } else {
            sessionMgr.storeSession(profile, {
              sessionId: result.sessionId,
              totalCost: result.totalCost,
              cwd,
            });
          }
          if (Math.random() < 0.1) sessionMgr.cleanupExpired();
        }

        resolve(result);
      });

      // Handle errors
      proc.on('error', (error: Error) => {
        if (progressInterval) clearInterval(progressInterval);
        reject(new Error(`Failed to execute Claude CLI: ${error.message}`));
      });

      // Handle timeout
      if (timeout > 0) {
        const timeoutHandle = setTimeout(() => {
          if (proc.exitCode === null) {
            timedOut = true;
            if (progressInterval) {
              clearInterval(progressInterval);
              process.stderr.write('\r\x1b[K');
            }
            // Longer grace period for timeout (vs 2s for SIGINT) since delegated sessions may need time to flush output
            killWithEscalation(proc, 10000);
          }
        }, timeout);
        proc.on('close', () => clearTimeout(timeoutHandle));
      }
    });
  }

  /** Validate permission mode */
  private static _validatePermissionMode(mode: string): void {
    const VALID_MODES = ['default', 'plan', 'acceptEdits', 'bypassPermissions'];
    if (!VALID_MODES.includes(mode)) {
      throw new Error(`Invalid permission mode: "${mode}". Valid modes: ${VALID_MODES.join(', ')}`);
    }
  }

  /** Detect Claude CLI executable */
  private static _detectClaudeCli(): string | null {
    if (process.env.CCS_CLAUDE_PATH) return process.env.CCS_CLAUDE_PATH;
    const { execSync } = require('child_process');
    try {
      return execSync('command -v claude', { encoding: 'utf8' }).trim();
    } catch {
      return null;
    }
  }

  /** Execute with retry logic */
  static async executeWithRetry(
    profile: string,
    enhancedPrompt: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const { maxRetries = 2, ...execOptions } = options;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.execute(profile, enhancedPrompt, execOptions);
        if (result.success) return result;
        if (attempt < maxRetries) {
          console.error(warn(`Attempt ${attempt + 1} failed, retrying...`));
          await this._sleep(1000 * (attempt + 1));
          continue;
        }
        return result;
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries) {
          console.error(warn(`Attempt ${attempt + 1} errored, retrying...`));
          await this._sleep(1000 * (attempt + 1));
        }
      }
    }
    throw lastError || new Error('Execution failed after all retry attempts');
  }

  /** Sleep utility for retry backoff */
  private static _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Process prompt to detect and preserve slash commands */
  private static _processSlashCommand(prompt: string): string {
    const trimmed = prompt.trim();

    // Case 1: Already starts with slash command
    if (trimmed.match(/^\/[\w:-]+(\s|$)/)) return prompt;

    // Case 2: Find slash command embedded in text
    const embeddedSlash = trimmed.match(/(?:^|[^\w/])(\/[\w:-]+)(\s+[\s\S]*)?$/);
    if (embeddedSlash) {
      const command = embeddedSlash[1];
      const args = (embeddedSlash[2] || '').trim();
      const matchIndex = embeddedSlash.index || 0;
      const matchStart = matchIndex + (embeddedSlash[0][0] === '/' ? 0 : 1);
      const beforeCommand = trimmed.substring(0, matchStart).trim();

      if (beforeCommand && args) return `${command} ${args}\n\nContext: ${beforeCommand}`;
      if (beforeCommand) return `${command}\n\nContext: ${beforeCommand}`;
      return args ? `${command} ${args}` : command;
    }

    return prompt;
  }

  /** Test if profile is executable */
  static async testProfile(profile: string): Promise<boolean> {
    try {
      const result = await this.execute(profile, 'Say "test successful"', { timeout: 10000 });
      return result.success;
    } catch {
      return false;
    }
  }
}
