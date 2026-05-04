/**
 * Default dispatch flow — no profile configured, use Claude's own defaults.
 *
 * Extracted from src/ccs.ts main() else branch (profileInfo.type === 'default').
 * Skip WebSearch hook — native Claude has server-side WebSearch.
 * Skip Image Analyzer hook — native Claude has native vision support.
 */

import { fail, info, warn } from '../../utils/ui';
import {
  appendBrowserToolArgs,
  ensureBrowserMcpOrThrow,
  resolveOptionalBrowserAttachRuntime,
  syncBrowserMcpToConfigDir,
} from '../../utils/browser';
import { execClaude } from '../../utils/shell-executor';
import { resolveDroidProvider, type TargetCredentials } from '../../targets';
import { resolveNativeClaudeLaunchArgs } from '../environment-builder';
import type { ProfileDispatchContext } from '../dispatcher-context';

export async function runDefaultFlow(ctx: ProfileDispatchContext): Promise<void> {
  const {
    profileInfo,
    resolvedTarget,
    claudeCli,
    targetAdapter,
    targetBinaryInfo,
    targetRemainingArgs,
    nativeClaudeRemainingArgs,
    runtimeReasoningOverride,
    codexRuntimeConfigOverrides,
    claudeBrowserExposure,
    claudeAttachConfig,
    resolveProfileContinuityInheritance,
  } = ctx;

  const envVars: NodeJS.ProcessEnv = {
    CCS_PROFILE_TYPE: 'default',
    CCS_WEBSEARCH_SKIP: '1',
    CCS_IMAGE_ANALYSIS_SKIP: '1',
  };
  const browserAttachRuntime =
    resolvedTarget === 'claude' &&
    claudeBrowserExposure?.exposeForLaunch &&
    claudeAttachConfig?.enabled
      ? await resolveOptionalBrowserAttachRuntime(claudeAttachConfig)
      : undefined;
  const browserRuntimeEnv = browserAttachRuntime?.runtimeEnv;
  if (browserAttachRuntime?.warning) {
    process.stderr.write(`${warn(browserAttachRuntime.warning)}\n`);
  }

  if (resolvedTarget === 'claude') {
    if (browserRuntimeEnv) {
      ensureBrowserMcpOrThrow();
      Object.assign(envVars, browserRuntimeEnv);
    }
    const defaultContinuityInheritance = await resolveProfileContinuityInheritance({
      profileName: profileInfo.name,
      profileType: profileInfo.type,
      target: resolvedTarget,
    });
    if (defaultContinuityInheritance.sourceAccount && process.env.CCS_DEBUG) {
      console.error(
        info(
          `Continuity inheritance active: profile "${profileInfo.name}" -> account "${defaultContinuityInheritance.sourceAccount}"`
        )
      );
    }
    if (defaultContinuityInheritance.claudeConfigDir) {
      envVars.CLAUDE_CONFIG_DIR = defaultContinuityInheritance.claudeConfigDir;
      if (
        browserRuntimeEnv &&
        !syncBrowserMcpToConfigDir(defaultContinuityInheritance.claudeConfigDir)
      ) {
        throw new Error(
          'Browser MCP is enabled, but CCS could not sync the browser MCP config into the inherited Claude instance.'
        );
      }
    }
  }

  // Dispatch through target adapter for non-claude targets
  if (resolvedTarget !== 'claude') {
    const adapter = targetAdapter;
    if (!adapter) {
      console.error(fail(`Target adapter not found for "${resolvedTarget}"`));
      process.exit(1);
    }
    if (!adapter.supportsProfileType('default')) {
      console.error(fail(`${adapter.displayName} does not support default profile mode`));
      process.exit(1);
    }
    const creds: TargetCredentials = {
      profile: 'default',
      baseUrl: process.env['ANTHROPIC_BASE_URL'] || '',
      apiKey: process.env['ANTHROPIC_AUTH_TOKEN'] || '',
      model: process.env['ANTHROPIC_MODEL'],
      provider: resolveDroidProvider({
        provider: process.env['CCS_DROID_PROVIDER'] || process.env['DROID_PROVIDER'],
        baseUrl: process.env['ANTHROPIC_BASE_URL'],
        model: process.env['ANTHROPIC_MODEL'],
      }),
      reasoningOverride: runtimeReasoningOverride,
      runtimeConfigOverrides: codexRuntimeConfigOverrides,
      browserRuntimeEnv,
    };
    if (resolvedTarget === 'droid' && (!creds.baseUrl || !creds.apiKey)) {
      console.error(
        fail(
          `${adapter.displayName} default mode requires ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN`
        )
      );
      console.error(info('Use a settings-based profile instead: ccs glm --target droid'));
      process.exit(1);
    }
    await adapter.prepareCredentials(creds);
    const targetArgs = adapter.buildArgs('default', targetRemainingArgs, {
      creds,
      profileType: 'default',
      binaryInfo: targetBinaryInfo || undefined,
    });
    const targetEnv = adapter.buildEnv(creds, 'default');
    adapter.exec(targetArgs, targetEnv, { binaryInfo: targetBinaryInfo || undefined });
    return;
  }

  const launchArgs = resolveNativeClaudeLaunchArgs(
    browserRuntimeEnv
      ? appendBrowserToolArgs(nativeClaudeRemainingArgs)
      : nativeClaudeRemainingArgs,
    'default',
    envVars.CLAUDE_CONFIG_DIR
  );
  execClaude(claudeCli, launchArgs, envVars);
}
