import './utils/fetch-proxy-setup';

import { detectClaudeCli } from './utils/claude-detector';
import { getSettingsPath, loadSettings } from './utils/config-manager';
import { expandPath } from './utils/helpers';
import {
  validateGlmKey,
  validateMiniMaxKey,
  validateAnthropicKey,
} from './utils/api-key-validator';
import { ErrorManager } from './utils/error-manager';
import {
  execClaudeWithCLIProxy,
  CLIProxyProvider,
  ensureCliproxyService,
  isAuthenticated,
} from './cliproxy';
import { getEffectiveEnvVars, getCompositeEnvVars } from './cliproxy/config/env-builder';
import { CLIPROXY_DEFAULT_PORT } from './cliproxy/config/port-manager';
import {
  ensureWebSearchMcpOrThrow,
  displayWebSearchStatus,
  getWebSearchHookEnv,
  syncWebSearchMcpToConfigDir,
  appendThirdPartyWebSearchToolArgs,
  createWebSearchTraceContext,
} from './utils/websearch-manager';
import {
  ensureImageAnalysisMcpOrThrow,
  syncImageAnalysisMcpToConfigDir,
  appendThirdPartyImageAnalysisToolArgs,
} from './utils/image-analysis';
import {
  appendBrowserToolArgs,
  ensureBrowserMcpOrThrow,
  getBlockedBrowserOverrideWarning,
  getEffectiveClaudeBrowserAttachConfig,
  resolveBrowserExposure,
  resolveOptionalBrowserAttachRuntime,
  syncBrowserMcpToConfigDir,
} from './utils/browser';
import { getBrowserConfig, getGlobalEnvConfig } from './config/unified-config-loader';
import {
  ensureProfileHooks as ensureImageAnalyzerHooks,
  removeImageAnalysisProfileHook,
} from './utils/hooks/image-analyzer-profile-hook-injector';
import {
  applyImageAnalysisRuntimeOverrides,
  getImageAnalysisHookEnv,
  installImageAnalyzerHook,
  prepareImageAnalysisFallbackHook,
  resolveImageAnalysisRuntimeConnection,
  resolveImageAnalysisRuntimeStatus,
} from './utils/hooks';
import { fail, info, warn } from './utils/ui';
// Import centralized error handling
import { handleError, runCleanup } from './errors';

// Import extracted utility functions
import { execClaude, stripAnthropicRoutingEnv, stripBrowserEnv } from './utils/shell-executor';
import { isDeprecatedGlmtProfileName, normalizeDeprecatedGlmtEnv } from './utils/glmt-deprecation';
import { createOpenAICompatLaunchSettings } from './utils/openai-compat-launch-settings';
import { maybeWarnAboutResumeLaneMismatch } from './auth/resume-lane-warning';
import { createLogger, runWithRequestId } from './services/logging';
import type { ProfileDetectionResult } from './auth/profile-detector';

// Import target adapter system
import {
  registerTarget,
  getTarget,
  ClaudeAdapter,
  DroidAdapter,
  CodexAdapter,
  evaluateTargetRuntimeCompatibility,
  pruneOrphanedModels,
  resolveDroidProvider,
  type TargetCredentials,
} from './targets';
import { resolveTargetType, stripTargetFlag } from './targets/target-resolver';
import { DroidReasoningFlagError } from './targets/droid-reasoning-runtime';
import { DroidCommandRouterError, routeDroidCommandArgs } from './targets/droid-command-router';
import { resolveCliproxyBridgeMetadata } from './api/services/cliproxy-profile-bridge';
import {
  buildOpenAICompatProxyEnv,
  resolveOpenAICompatProfileConfig,
  startOpenAICompatProxy,
} from './proxy';

// Import extracted dispatcher modules
import {
  detectProfile,
  resolveRuntimeReasoningFlags,
  normalizeCodexRuntimeReasoningOverride,
  exitWithRuntimeReasoningFlagError,
  normalizeNativeClaudeEffortArgs,
  shouldNormalizeNativeClaudeEffort,
  bootstrapAndParseEarlyCli,
} from './dispatcher/cli-argument-parser';
import {
  resolveCodexRuntimeConfigOverrides,
  resolveNativeClaudeLaunchArgs,
} from './dispatcher/environment-builder';
import { type ProfileError } from './dispatcher/target-executor';
import { runPreDispatchHandlers } from './dispatcher/pre-dispatch';

// ========== Main Execution ==========

async function main(): Promise<void> {
  // Register target adapters (singleton wiring — stays in main)
  registerTarget(new ClaudeAdapter());
  registerTarget(new DroidAdapter());
  registerTarget(new CodexAdapter());
  const cliLogger = createLogger('cli');

  // Phase A: bootstrap + early arg pre-parse
  const bootstrap = await bootstrapAndParseEarlyCli(process.argv.slice(2));
  if (bootstrap.exitNow) {
    return;
  }

  const args = bootstrap.args;
  const browserLaunchOverride = bootstrap.browserLaunchOverride;

  cliLogger.info('command.start', 'CLI invocation started', {
    command: args[0] || 'default',
    argCount: args.length,
    flags: args.filter((arg) => arg.startsWith('-')).slice(0, 20),
  });

  // Phase B: pre-dispatch side-effects (update check, migrate, recovery, root commands, routing)
  const preDispatchConsumed = await runPreDispatchHandlers({ args, cliLogger });
  if (preDispatchConsumed) {
    return;
  }

  // Use ProfileDetector to determine profile type
  const ProfileDetectorModule = await import('./auth/profile-detector');
  const ProfileDetector = ProfileDetectorModule.default;
  const InstanceManagerModule = await import('./management/instance-manager');
  const InstanceManager = InstanceManagerModule.default;
  const ProfileRegistryModule = await import('./auth/profile-registry');
  const ProfileRegistry = ProfileRegistryModule.default;
  const AccountContextModule = await import('./auth/account-context');
  const { resolveAccountContextPolicy, isAccountContextMetadata } = AccountContextModule;
  const ProfileContinuityModule = await import('./auth/profile-continuity-inheritance');
  const { resolveProfileContinuityInheritance } = ProfileContinuityModule;

  const detector = new ProfileDetector();

  try {
    // Detect profile (strip --target flags before profile detection)
    const cleanArgs = stripTargetFlag(args);
    const { profile, remainingArgs } = detectProfile(cleanArgs);
    const profileInfo: ProfileDetectionResult = detector.detectProfileType(profile);
    let resolvedTarget: ReturnType<typeof resolveTargetType>;
    try {
      resolvedTarget = resolveTargetType(
        args,
        profileInfo.target ? { target: profileInfo.target } : undefined
      );
    } catch (error) {
      console.error(fail((error as Error).message));
      process.exit(1);
      return;
    }

    // Detect Claude CLI (needed for claude target and all CLIProxy-derived flows)
    const claudeCliRaw = detectClaudeCli();
    if (resolvedTarget === 'claude' && !claudeCliRaw) {
      await ErrorManager.showClaudeNotFound();
      process.exit(1);
    }
    const claudeCli = claudeCliRaw || '';

    // Resolve non-claude target adapter once.
    const targetAdapter = resolvedTarget !== 'claude' ? getTarget(resolvedTarget) : null;
    let resolvedSettingsPath: string | undefined;
    let resolvedSettings: ReturnType<typeof loadSettings> | undefined;
    let resolvedCliproxyBridge: ReturnType<typeof resolveCliproxyBridgeMetadata> | undefined;

    // Preflight unsupported profile/target combinations BEFORE binary detection,
    // so users get the most actionable error even when the target CLI is not installed.
    if (resolvedTarget !== 'claude') {
      if (!targetAdapter) {
        console.error(fail(`Target adapter not found for "${resolvedTarget}"`));
        process.exit(1);
      }

      if (profileInfo.type === 'settings') {
        resolvedSettingsPath = profileInfo.settingsPath
          ? expandPath(profileInfo.settingsPath)
          : getSettingsPath(profileInfo.name);
        resolvedSettings = loadSettings(resolvedSettingsPath);
        resolvedCliproxyBridge = resolveCliproxyBridgeMetadata(resolvedSettings);
        const compatibility = evaluateTargetRuntimeCompatibility({
          target: resolvedTarget,
          profileType: profileInfo.type,
          cliproxyBridgeProvider: resolvedCliproxyBridge?.provider ?? null,
        });
        if (!compatibility.supported) {
          console.error(
            fail(
              compatibility.reason || `${targetAdapter.displayName} does not support this profile.`
            )
          );
          if (compatibility.suggestion) {
            console.error(info(compatibility.suggestion));
          }
          process.exit(1);
        }
      } else {
        const compatibility = evaluateTargetRuntimeCompatibility({
          target: resolvedTarget,
          profileType: profileInfo.type,
          cliproxyProvider: profileInfo.type === 'cliproxy' ? profileInfo.provider : undefined,
          isComposite:
            profileInfo.type === 'cliproxy' ? Boolean(profileInfo.isComposite) : undefined,
        });
        if (!compatibility.supported) {
          console.error(
            fail(
              compatibility.reason || `${targetAdapter.displayName} does not support this profile.`
            )
          );
          if (compatibility.suggestion) {
            console.error(info(compatibility.suggestion));
          }
          process.exit(1);
        }
      }

      if (profileInfo.type === 'default') {
        if (!targetAdapter.supportsProfileType('default')) {
          console.error(fail(`${targetAdapter.displayName} does not support default profile mode`));
          process.exit(1);
        }

        // For default mode, Droid requires explicit credentials from environment.
        if (resolvedTarget === 'droid') {
          const baseUrl = process.env['ANTHROPIC_BASE_URL'] || '';
          const apiKey = process.env['ANTHROPIC_AUTH_TOKEN'] || '';
          if (!baseUrl.trim() || !apiKey.trim()) {
            console.error(
              fail(
                `${targetAdapter.displayName} default mode requires ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN`
              )
            );
            console.error(info('Use a settings-based profile instead: ccs glm --target droid'));
            process.exit(1);
          }
        }
      }
    }

    // For non-claude targets, verify target binary exists once and pass it through.
    const targetBinaryInfo = targetAdapter?.detectBinary() ?? null;
    const browserConfig = getBrowserConfig();
    const claudeAttachConfig =
      resolvedTarget === 'claude'
        ? getEffectiveClaudeBrowserAttachConfig(browserConfig)
        : undefined;
    const codexRuntimeConfigOverrides = resolveCodexRuntimeConfigOverrides(
      resolvedTarget,
      browserLaunchOverride
    );
    const claudeBrowserExposure =
      resolvedTarget === 'claude'
        ? resolveBrowserExposure(
            {
              enabled: claudeAttachConfig?.enabled ?? browserConfig.claude.enabled,
              policy: browserConfig.claude.policy,
            },
            browserLaunchOverride
          )
        : undefined;
    const codexBrowserExposure =
      resolvedTarget === 'codex'
        ? resolveBrowserExposure(browserConfig.codex, browserLaunchOverride)
        : undefined;
    const blockedBrowserOverrideWarning =
      resolvedTarget === 'claude' && claudeBrowserExposure
        ? getBlockedBrowserOverrideWarning('Claude Browser Attach', claudeBrowserExposure)
        : resolvedTarget === 'codex' && codexBrowserExposure
          ? getBlockedBrowserOverrideWarning('Codex Browser Tools', codexBrowserExposure)
          : undefined;
    if (blockedBrowserOverrideWarning) {
      console.error(warn(blockedBrowserOverrideWarning));
    }
    if (resolvedTarget !== 'claude' && !targetBinaryInfo) {
      const displayName = targetAdapter?.displayName || resolvedTarget;
      console.error(fail(`${displayName} CLI not found.`));
      if (resolvedTarget === 'droid') {
        console.error(info('Install: npm i -g @factory/cli'));
      } else if (resolvedTarget === 'codex') {
        console.error(info('Install a recent @openai/codex build, then retry.'));
      }
      process.exit(1);
    }

    // Best-effort: prune stale Droid model entries at runtime so settings.json stays clean.
    if (resolvedTarget === 'droid') {
      try {
        const allProfiles = detector.getAllProfiles();
        const activeProfiles = allProfiles.settings.filter((name) =>
          /^[a-zA-Z0-9._-]+$/.test(name)
        );
        await pruneOrphanedModels(activeProfiles);
      } catch (error) {
        console.error(warn(`[!] Droid prune skipped: ${(error as Error).message}`));
      }
    }

    let targetRemainingArgs = remainingArgs;
    let runtimeReasoningOverride: string | number | undefined;
    let nativeClaudeRemainingArgs = remainingArgs;
    if (resolvedTarget === 'droid') {
      try {
        const droidRoute = routeDroidCommandArgs(remainingArgs);
        targetRemainingArgs = droidRoute.argsForDroid;

        if (droidRoute.mode === 'interactive') {
          const runtime = resolveRuntimeReasoningFlags(remainingArgs, process.env.CCS_THINKING);
          targetRemainingArgs = runtime.argsWithoutReasoningFlags;
          runtimeReasoningOverride = runtime.reasoningOverride;
        } else {
          if (droidRoute.duplicateReasoningDisplays.length > 0) {
            console.error(
              warn(
                `[!] Multiple reasoning flags detected. Using first occurrence: ${droidRoute.reasoningSourceDisplay || '<first-flag>'}`
              )
            );
          }
          if (droidRoute.autoPrependedExec && process.stdout.isTTY) {
            console.error(
              info('Detected Droid exec-only flags. Routing as: droid exec <flags> [prompt]')
            );
          }
        }
      } catch (error) {
        if (error instanceof DroidReasoningFlagError || error instanceof DroidCommandRouterError) {
          exitWithRuntimeReasoningFlagError(error.message, {
            codexAliasLevels: 'minimal|low|medium|high|xhigh',
            includeDroidExecExample: true,
          });
        }
        throw error;
      }
    } else if (resolvedTarget === 'codex') {
      try {
        const runtime = resolveRuntimeReasoningFlags(remainingArgs, process.env.CCS_THINKING);
        targetRemainingArgs = runtime.argsWithoutReasoningFlags;
        const normalizedReasoning = normalizeCodexRuntimeReasoningOverride(
          runtime.reasoningOverride
        );
        if (runtime.reasoningOverride !== undefined && !normalizedReasoning) {
          if (runtime.reasoningSource === 'flag') {
            throw new DroidReasoningFlagError(
              'Codex target supports reasoning levels only: minimal, low, medium, high, xhigh.',
              '--effort'
            );
          }
          runtimeReasoningOverride = undefined;
        } else {
          runtimeReasoningOverride = normalizedReasoning;
        }
      } catch (error) {
        if (error instanceof DroidReasoningFlagError) {
          exitWithRuntimeReasoningFlagError(error.message, {
            codexAliasLevels: 'minimal|low|medium|high|xhigh',
          });
        }
        throw error;
      }
    } else if (resolvedTarget === 'claude' && shouldNormalizeNativeClaudeEffort(profileInfo.type)) {
      nativeClaudeRemainingArgs = normalizeNativeClaudeEffortArgs(remainingArgs);
    }

    // Special case: headless delegation (-p/--prompt)
    // Keep existing behavior for Claude targets only; non-claude targets must continue
    // through normal adapter dispatch logic.
    if (args.includes('-p') || args.includes('--prompt')) {
      const shouldUseDelegation = resolvedTarget === 'claude' && profileInfo.type === 'settings';
      if (shouldUseDelegation) {
        const { DelegationHandler } = await import('./delegation/delegation-handler');
        const handler = new DelegationHandler();
        await handler.route([profile, ...nativeClaudeRemainingArgs]);
        return;
      }
    }

    if (profileInfo.type === 'cliproxy') {
      // CLIPROXY FLOW: OAuth-based profiles (gemini, codex, agy, qwen) or user-defined variants
      const imageAnalysisMcpReady =
        resolvedTarget === 'claude' ? ensureImageAnalysisMcpOrThrow() : true;
      if (resolvedTarget === 'claude') {
        ensureWebSearchMcpOrThrow();
      }
      const provider = profileInfo.provider || (profileInfo.name as CLIProxyProvider);
      const expandedCliproxySettingsPath = profileInfo.settingsPath
        ? expandPath(profileInfo.settingsPath)
        : undefined;
      if (resolvedTarget === 'claude') {
        if (imageAnalysisMcpReady) {
          removeImageAnalysisProfileHook(profileInfo.name, expandedCliproxySettingsPath);
        } else {
          const imageAnalysisFallbackHookReady = prepareImageAnalysisFallbackHook();
          ensureImageAnalyzerHooks({
            profileName: profileInfo.name,
            profileType: profileInfo.type,
            cliproxyProvider: provider,
            isComposite: profileInfo.isComposite,
            settingsPath: expandedCliproxySettingsPath,
            sharedHookInstalled: imageAnalysisFallbackHookReady,
          });
        }
      }
      const customSettingsPath = profileInfo.settingsPath; // undefined for hardcoded profiles
      const variantPort = profileInfo.port; // variant-specific port for isolation
      const cliproxyPort = variantPort || CLIPROXY_DEFAULT_PORT;

      if (resolvedTarget !== 'claude') {
        const adapter = targetAdapter;
        if (!adapter) {
          console.error(fail(`Target adapter not found for "${resolvedTarget}"`));
          process.exitCode = 1;
          return;
        }
        if (!adapter.supportsProfileType('cliproxy')) {
          console.error(fail(`${adapter.displayName} does not support CLIProxy profiles`));
          process.exitCode = 1;
          return;
        }

        // Keep CLIProxy management/auth flags on Claude flow only.
        const unsupportedCliproxyFlags = [
          '--auth',
          '--logout',
          '--accounts',
          '--add',
          '--use',
          '--config',
          '--headless',
          '--paste-callback',
          '--port-forward',
          '--nickname',
          '--kiro-auth-method',
          '--kiro-idc-start-url',
          '--kiro-idc-region',
          '--kiro-idc-flow',
          '--backend',
          '--proxy-host',
          '--proxy-port',
          '--proxy-protocol',
          '--proxy-auth-token',
          '--proxy-timeout',
          '--local-proxy',
          '--remote-only',
          '--no-fallback',
          '--allow-self-signed',
          '--1m',
          '--no-1m',
        ];
        const providedUnsupportedFlag = unsupportedCliproxyFlags.find(
          (flag) =>
            targetRemainingArgs.includes(flag) ||
            targetRemainingArgs.some((arg) => arg.startsWith(`${flag}=`))
        );
        if (providedUnsupportedFlag) {
          console.error(
            fail(
              `${providedUnsupportedFlag} is only supported when running CLIProxy profiles on Claude target`
            )
          );
          console.error(
            info(`Run with Claude target: ccs ${profileInfo.name} --target claude ...`)
          );
          process.exitCode = 1;
          return;
        }

        // For Droid execution path, require existing OAuth auth and running local proxy.
        if (profileInfo.isComposite && profileInfo.compositeTiers) {
          const compositeProviders = [
            ...new Set(Object.values(profileInfo.compositeTiers).map((tier) => tier.provider)),
          ] as CLIProxyProvider[];
          const missingProvider = compositeProviders.find((p) => !isAuthenticated(p));
          if (missingProvider) {
            console.error(
              fail(`Missing OAuth auth for composite tier provider: ${missingProvider}`)
            );
            console.error(info(`Authenticate first: ccs ${missingProvider} --auth`));
            process.exitCode = 1;
            return;
          }
        } else if (!isAuthenticated(provider)) {
          console.error(fail(`No OAuth authentication found for provider: ${provider}`));
          console.error(info(`Authenticate first: ccs ${provider} --auth`));
          process.exitCode = 1;
          return;
        }

        const ensureServiceResult = await ensureCliproxyService(
          cliproxyPort,
          targetRemainingArgs.includes('--verbose') || targetRemainingArgs.includes('-v')
        );
        if (!ensureServiceResult.started) {
          console.error(
            fail(ensureServiceResult.error || 'Failed to start local CLIProxy service')
          );
          process.exitCode = 1;
          return;
        }

        const envVars =
          profileInfo.isComposite && profileInfo.compositeTiers && profileInfo.compositeDefaultTier
            ? getCompositeEnvVars(
                profileInfo.compositeTiers,
                profileInfo.compositeDefaultTier,
                cliproxyPort,
                customSettingsPath
              )
            : getEffectiveEnvVars(provider, cliproxyPort, customSettingsPath);

        const creds: TargetCredentials = {
          profile: profileInfo.name,
          baseUrl: envVars['ANTHROPIC_BASE_URL'] || '',
          apiKey: envVars['ANTHROPIC_AUTH_TOKEN'] || '',
          model: envVars['ANTHROPIC_MODEL'] || undefined,
          provider: resolveDroidProvider({
            provider: envVars['CCS_DROID_PROVIDER'] || envVars['DROID_PROVIDER'],
            baseUrl: envVars['ANTHROPIC_BASE_URL'],
            model: envVars['ANTHROPIC_MODEL'],
          }),
          reasoningOverride: runtimeReasoningOverride,
          runtimeConfigOverrides: codexRuntimeConfigOverrides,
          envVars,
        };

        if (!creds.baseUrl || !creds.apiKey) {
          console.error(
            fail(
              `Missing CLIProxy runtime credentials for ${profileInfo.name} (ANTHROPIC_BASE_URL/AUTH_TOKEN)`
            )
          );
          console.error(
            info('Reconfigure with: ccs config > CLIProxy, or run ccs <provider> --config')
          );
          process.exitCode = 1;
          return;
        }

        await adapter.prepareCredentials(creds);
        const targetArgs = adapter.buildArgs(profileInfo.name, targetRemainingArgs, {
          creds,
          profileType: profileInfo.type,
          binaryInfo: targetBinaryInfo || undefined,
        });
        const targetEnv = adapter.buildEnv(creds, profileInfo.type);
        adapter.exec(targetArgs, targetEnv, { binaryInfo: targetBinaryInfo || undefined });
        return;
      }

      await execClaudeWithCLIProxy(claudeCli, provider, remainingArgs, {
        customSettingsPath,
        port: cliproxyPort,
        isComposite: profileInfo.isComposite,
        compositeTiers: profileInfo.compositeTiers,
        compositeDefaultTier: profileInfo.compositeDefaultTier,
        profileName: profileInfo.name,
      });
    } else if (profileInfo.type === 'copilot') {
      // COPILOT FLOW: GitHub Copilot subscription via copilot-api proxy
      ensureWebSearchMcpOrThrow();
      const imageAnalysisMcpReady = ensureImageAnalysisMcpOrThrow();
      if (resolvedTarget === 'claude') {
        if (imageAnalysisMcpReady) {
          removeImageAnalysisProfileHook(profileInfo.name);
        } else {
          const imageAnalysisFallbackHookReady = prepareImageAnalysisFallbackHook();
          ensureImageAnalyzerHooks({
            profileName: profileInfo.name,
            profileType: profileInfo.type,
            sharedHookInstalled: imageAnalysisFallbackHookReady,
          });
        }
      }

      const { executeCopilotProfile } = await import('./copilot');
      const copilotConfig = profileInfo.copilotConfig;
      if (!copilotConfig) {
        console.error(fail('Copilot configuration not found'));
        process.exit(1);
      }
      const continuityInheritance = await resolveProfileContinuityInheritance({
        profileName: profileInfo.name,
        profileType: profileInfo.type,
        target: resolvedTarget,
      });
      if (continuityInheritance.sourceAccount && process.env.CCS_DEBUG) {
        console.error(
          info(
            `Continuity inheritance active: profile "${profileInfo.name}" -> account "${continuityInheritance.sourceAccount}"`
          )
        );
      }
      const exitCode = await executeCopilotProfile(
        copilotConfig,
        remainingArgs,
        continuityInheritance.claudeConfigDir,
        claudeCli
      );
      process.exit(exitCode);
    } else if (profileInfo.type === 'cursor') {
      // CURSOR FLOW: local Cursor daemon profile
      ensureWebSearchMcpOrThrow();
      installImageAnalyzerHook();
      ensureImageAnalyzerHooks({
        profileName: profileInfo.name,
        profileType: profileInfo.type,
      });

      const { executeCursorProfile } = await import('./cursor');
      const cursorConfig = profileInfo.cursorConfig;
      if (!cursorConfig) {
        console.error(fail('Cursor configuration not found'));
        process.exit(1);
      }
      const continuityInheritance = await resolveProfileContinuityInheritance({
        profileName: profileInfo.name,
        profileType: profileInfo.type,
        target: resolvedTarget,
      });
      if (continuityInheritance.sourceAccount && process.env.CCS_DEBUG) {
        console.error(
          info(
            `Continuity inheritance active: profile "${profileInfo.name}" -> account "${continuityInheritance.sourceAccount}"`
          )
        );
      }
      const exitCode = await executeCursorProfile(
        cursorConfig,
        remainingArgs,
        continuityInheritance.claudeConfigDir,
        claudeCli
      );
      process.exit(exitCode);
    } else if (profileInfo.type === 'settings') {
      // Settings-based profiles (glm, glmt) are third-party providers
      const imageAnalysisMcpReady =
        resolvedTarget === 'claude' ? ensureImageAnalysisMcpOrThrow() : true;
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
        ensureWebSearchMcpOrThrow();
        if (browserRuntimeEnv) {
          ensureBrowserMcpOrThrow();
        }
      }

      // Display WebSearch status (single line, equilibrium UX)
      displayWebSearchStatus();

      const continuityInheritance =
        resolvedTarget === 'claude'
          ? await resolveProfileContinuityInheritance({
              profileName: profileInfo.name,
              profileType: profileInfo.type,
              target: resolvedTarget,
            })
          : {};
      if (continuityInheritance.sourceAccount && process.env.CCS_DEBUG) {
        console.error(
          info(
            `Continuity inheritance active: profile "${profileInfo.name}" -> account "${continuityInheritance.sourceAccount}"`
          )
        );
      }
      const inheritedClaudeConfigDir = continuityInheritance.claudeConfigDir;
      syncWebSearchMcpToConfigDir(inheritedClaudeConfigDir);
      syncImageAnalysisMcpToConfigDir(inheritedClaudeConfigDir);
      if (
        browserRuntimeEnv &&
        inheritedClaudeConfigDir &&
        !syncBrowserMcpToConfigDir(inheritedClaudeConfigDir)
      ) {
        throw new Error(
          'Browser MCP is enabled, but CCS could not sync the browser MCP config into the inherited Claude instance.'
        );
      }
      const expandedSettingsPath =
        resolvedSettingsPath ??
        (profileInfo.settingsPath
          ? expandPath(profileInfo.settingsPath)
          : getSettingsPath(profileInfo.name));
      const settings = resolvedSettings ?? loadSettings(expandedSettingsPath);
      const cliproxyBridge = resolvedCliproxyBridge ?? resolveCliproxyBridgeMetadata(settings);

      let imageAnalysisFallbackHookReady: boolean | undefined;
      if (resolvedTarget === 'claude') {
        if (imageAnalysisMcpReady) {
          removeImageAnalysisProfileHook(profileInfo.name, expandedSettingsPath);
        } else {
          imageAnalysisFallbackHookReady = prepareImageAnalysisFallbackHook();
          ensureImageAnalyzerHooks({
            profileName: profileInfo.name,
            profileType: profileInfo.type,
            settingsPath: expandedSettingsPath,
            settings,
            cliproxyBridge,
            sharedHookInstalled: imageAnalysisFallbackHookReady,
          });
        }
      }
      if (resolvedTarget !== 'claude') {
        const compatibility = evaluateTargetRuntimeCompatibility({
          target: resolvedTarget,
          profileType: profileInfo.type,
          cliproxyBridgeProvider: cliproxyBridge?.provider ?? null,
        });
        if (!compatibility.supported) {
          console.error(
            fail(
              compatibility.reason ||
                `${targetAdapter?.displayName || resolvedTarget} does not support this profile.`
            )
          );
          if (compatibility.suggestion) {
            console.error(info(compatibility.suggestion));
          }
          process.exit(1);
        }
      }
      const rawSettingsEnv = profileInfo.env ?? settings.env ?? {};
      const isDeprecatedGlmtProfile = isDeprecatedGlmtProfileName(profileInfo.name);
      const glmtNormalization = isDeprecatedGlmtProfile
        ? normalizeDeprecatedGlmtEnv(rawSettingsEnv)
        : null;
      const settingsEnv = glmtNormalization?.env ?? rawSettingsEnv;

      if (glmtNormalization) {
        for (const message of glmtNormalization.warnings) {
          console.error(warn(message));
        }
      }

      // Pre-flight validation for Z.AI-compatible profiles.
      if (profileInfo.name === 'glm' || isDeprecatedGlmtProfile) {
        const apiKey = settingsEnv['ANTHROPIC_AUTH_TOKEN'];

        if (apiKey) {
          const validation = await validateGlmKey(apiKey, settingsEnv['ANTHROPIC_BASE_URL']);

          if (!validation.valid) {
            console.error('');
            console.error(fail(validation.error || 'API key validation failed'));
            if (validation.suggestion) {
              console.error('');
              console.error(validation.suggestion);
            }
            console.error('');
            console.error(info('To skip validation: CCS_SKIP_PREFLIGHT=1 ccs glm "prompt"'));
            process.exit(1);
          }
        }
      }

      if (profileInfo.name === 'mm') {
        const apiKey = settingsEnv['ANTHROPIC_AUTH_TOKEN'];

        if (apiKey) {
          const validation = await validateMiniMaxKey(apiKey, settingsEnv['ANTHROPIC_BASE_URL']);

          if (!validation.valid) {
            console.error('');
            console.error(fail(validation.error || 'API key validation failed'));
            if (validation.suggestion) {
              console.error('');
              console.error(validation.suggestion);
            }
            console.error('');
            console.error(info('To skip validation: CCS_SKIP_PREFLIGHT=1 ccs mm "prompt"'));
            process.exit(1);
          }
        }
      }

      // Pre-flight validation for Anthropic direct profiles (ANTHROPIC_API_KEY + no BASE_URL)
      {
        const anthropicApiKey = settingsEnv['ANTHROPIC_API_KEY'];
        const hasBaseUrl = !!settingsEnv['ANTHROPIC_BASE_URL'];
        if (anthropicApiKey && !hasBaseUrl) {
          const validation = await validateAnthropicKey(anthropicApiKey);
          if (!validation.valid) {
            console.error('');
            console.error(fail(validation.error || 'API key validation failed'));
            if (validation.suggestion) {
              console.error('');
              console.error(validation.suggestion);
            }
            console.error('');
            console.error(
              info(`To skip validation: CCS_SKIP_PREFLIGHT=1 ccs ${profileInfo.name} "prompt"`)
            );
            process.exit(1);
          }
        }
      }

      const webSearchEnv = getWebSearchHookEnv();
      const imageAnalysisStatus = await resolveImageAnalysisRuntimeStatus({
        profileName: profileInfo.name,
        profileType: profileInfo.type,
        settings,
        cliproxyBridge,
        sharedHookInstalled: imageAnalysisFallbackHookReady,
      });
      const runtimeConnection = resolveImageAnalysisRuntimeConnection();
      let imageAnalysisEnv = getImageAnalysisHookEnv({
        profileName: profileInfo.name,
        profileType: profileInfo.type,
        settings,
        cliproxyBridge,
      });
      imageAnalysisEnv = applyImageAnalysisRuntimeOverrides(imageAnalysisEnv, {
        backendId: imageAnalysisStatus.backendId,
        model: imageAnalysisStatus.model,
        runtimePath: imageAnalysisStatus.runtimePath,
        baseUrl: runtimeConnection.baseUrl,
        apiKey: runtimeConnection.apiKey,
        allowSelfSigned: runtimeConnection.allowSelfSigned,
      });
      imageAnalysisEnv = {
        ...imageAnalysisEnv,
        CCS_IMAGE_ANALYSIS_SKIP_HOOK:
          resolvedTarget === 'claude' && imageAnalysisMcpReady ? '1' : '0',
      };

      const imageAnalysisProvider = imageAnalysisEnv['CCS_CURRENT_PROVIDER'];
      if (
        resolvedTarget === 'claude' &&
        imageAnalysisEnv['CCS_IMAGE_ANALYSIS_SKIP'] !== '1' &&
        imageAnalysisProvider
      ) {
        const verboseProxyLaunch =
          remainingArgs.includes('--verbose') ||
          remainingArgs.includes('-v') ||
          targetRemainingArgs.includes('--verbose') ||
          targetRemainingArgs.includes('-v');

        if (imageAnalysisStatus.effectiveRuntimeMode === 'native-read') {
          console.error(
            info(
              `${imageAnalysisStatus.effectiveRuntimeReason || `Image analysis via ${imageAnalysisProvider} is unavailable.`} This session will use native Read.`
            )
          );
          imageAnalysisEnv = {
            ...imageAnalysisEnv,
            CCS_CURRENT_PROVIDER: '',
            CCS_IMAGE_ANALYSIS_SKIP: '1',
            CCS_IMAGE_ANALYSIS_RUNTIME_PATH: '',
            CCS_IMAGE_ANALYSIS_RUNTIME_BASE_URL: '',
            CCS_IMAGE_ANALYSIS_RUNTIME_API_KEY: '',
            CCS_IMAGE_ANALYSIS_RUNTIME_ALLOW_SELF_SIGNED: '0',
          };
        } else if (imageAnalysisStatus.proxyReadiness === 'stopped') {
          const ensureServiceResult = await ensureCliproxyService(
            CLIPROXY_DEFAULT_PORT,
            verboseProxyLaunch
          );
          if (!ensureServiceResult.started) {
            console.error(
              warn(
                `Image analysis via ${imageAnalysisProvider} is unavailable because CCS could not start the local CLIProxy service. This session will use native Read.`
              )
            );
            imageAnalysisEnv = {
              ...imageAnalysisEnv,
              CCS_CURRENT_PROVIDER: '',
              CCS_IMAGE_ANALYSIS_SKIP: '1',
            };
          }
        }
      }
      // Get global env vars (DISABLE_TELEMETRY, etc.) for third-party profiles
      const globalEnvConfig = getGlobalEnvConfig();
      const globalEnv = globalEnvConfig.enabled ? globalEnvConfig.env : {};

      // Log global env injection for visibility (debug mode only)
      if (globalEnvConfig.enabled && Object.keys(globalEnv).length > 0 && process.env.CCS_DEBUG) {
        const envNames = Object.keys(globalEnv).join(', ');
        console.error(info(`Global env: ${envNames}`));
      }

      // For Claude target launches that already pass `--settings`, keep runtime
      // env free of ANTHROPIC routing/auth while preserving non-routing profile
      // env so nested Team/subagent sessions can still inherit model intent and
      // other profile-scoped runtime flags.
      const settingsRuntimeEnv = stripBrowserEnv({ ...globalEnv, ...settingsEnv });
      const claudeRuntimeEnvVars: NodeJS.ProcessEnv = {
        ...stripAnthropicRoutingEnv(settingsRuntimeEnv),
        ...(inheritedClaudeConfigDir ? { CLAUDE_CONFIG_DIR: inheritedClaudeConfigDir } : {}),
        ...webSearchEnv,
        ...imageAnalysisEnv,
        ...(browserRuntimeEnv || {}),
        CCS_PROFILE_TYPE: 'settings',
        CCS_STRIP_INHERITED_ANTHROPIC_ENV: '1',
      };

      // Non-Claude targets still need effective credentials injected directly.
      const envVars: NodeJS.ProcessEnv = {
        ...settingsRuntimeEnv,
        ...(inheritedClaudeConfigDir ? { CLAUDE_CONFIG_DIR: inheritedClaudeConfigDir } : {}),
        ...webSearchEnv,
        ...imageAnalysisEnv,
        ...(browserRuntimeEnv || {}),
        CCS_PROFILE_TYPE: 'settings',
      };

      // Dispatch through target adapter for non-claude targets
      if (resolvedTarget !== 'claude') {
        const adapter = targetAdapter;
        if (!adapter) {
          console.error(fail(`Target adapter not found for "${resolvedTarget}"`));
          process.exit(1);
        }
        const directAnthropicBaseUrl =
          settingsEnv['ANTHROPIC_BASE_URL'] ||
          (settingsEnv['ANTHROPIC_API_KEY'] ? 'https://api.anthropic.com' : '');
        const creds: TargetCredentials = {
          profile: profileInfo.name,
          baseUrl: directAnthropicBaseUrl,
          apiKey: settingsEnv['ANTHROPIC_AUTH_TOKEN'] || settingsEnv['ANTHROPIC_API_KEY'] || '',
          model: settingsEnv['ANTHROPIC_MODEL'],
          provider: resolveDroidProvider({
            provider: settingsEnv['CCS_DROID_PROVIDER'] || settingsEnv['DROID_PROVIDER'],
            baseUrl: directAnthropicBaseUrl,
            model: settingsEnv['ANTHROPIC_MODEL'],
          }),
          reasoningOverride: runtimeReasoningOverride,
          runtimeConfigOverrides: codexRuntimeConfigOverrides,
          envVars,
        };
        await adapter.prepareCredentials(creds);
        const targetArgs = adapter.buildArgs(profileInfo.name, targetRemainingArgs, {
          creds,
          profileType: profileInfo.type,
          binaryInfo: targetBinaryInfo || undefined,
        });
        const targetEnv = adapter.buildEnv(creds, profileInfo.type);
        adapter.exec(targetArgs, targetEnv, { binaryInfo: targetBinaryInfo || undefined });
        return;
      }

      const imageAnalysisArgs = imageAnalysisMcpReady
        ? appendThirdPartyImageAnalysisToolArgs(nativeClaudeRemainingArgs)
        : nativeClaudeRemainingArgs;
      const browserArgs = browserRuntimeEnv
        ? appendBrowserToolArgs(imageAnalysisArgs)
        : imageAnalysisArgs;
      const openAICompatProfile = resolveOpenAICompatProfileConfig(
        profileInfo.name,
        expandedSettingsPath,
        settingsEnv
      );
      if (openAICompatProfile) {
        const proxyStart = await startOpenAICompatProxy(openAICompatProfile, {
          insecure: openAICompatProfile.insecure,
        });
        if (!proxyStart.success) {
          console.error(fail(proxyStart.error || 'Failed to start local OpenAI-compatible proxy'));
          process.exit(1);
        }

        console.error(
          info(
            `Using local OpenAI-compatible proxy for "${profileInfo.name}" on port ${proxyStart.port}`
          )
        );

        const proxyEnv = {
          ...envVars,
          ...buildOpenAICompatProxyEnv(
            openAICompatProfile,
            proxyStart.port,
            proxyStart.authToken || '',
            inheritedClaudeConfigDir
          ),
        };
        delete proxyEnv.ANTHROPIC_API_KEY;
        const launchSettings = createOpenAICompatLaunchSettings(expandedSettingsPath, settings);

        const launchArgs = [
          '--settings',
          launchSettings.settingsPath,
          ...appendThirdPartyWebSearchToolArgs(browserArgs),
        ];
        const traceEnv = createWebSearchTraceContext({
          launcher: 'ccs.settings-profile.proxy',
          args: launchArgs,
          profile: profileInfo.name,
          profileType: profileInfo.type,
          settingsPath: expandedSettingsPath,
        });

        execClaude(claudeCli, launchArgs, { ...proxyEnv, ...traceEnv }, launchSettings.cleanup);
        return;
      }
      const launchArgs = [
        '--settings',
        expandedSettingsPath,
        ...appendThirdPartyWebSearchToolArgs(browserArgs),
      ];
      const traceEnv = createWebSearchTraceContext({
        launcher: 'ccs.settings-profile',
        args: launchArgs,
        profile: profileInfo.name,
        profileType: profileInfo.type,
        settingsPath: expandedSettingsPath,
      });

      execClaude(claudeCli, launchArgs, { ...claudeRuntimeEnvVars, ...traceEnv });
    } else if (profileInfo.type === 'account') {
      // NEW FLOW: Account-based profile (work, personal)
      // All platforms: Use instance isolation with CLAUDE_CONFIG_DIR
      const registry = new ProfileRegistry();
      const instanceMgr = new InstanceManager();
      const accountMetadata = isAccountContextMetadata(profileInfo.profile)
        ? profileInfo.profile
        : undefined;
      const isBareProfile =
        typeof profileInfo.profile === 'object' &&
        profileInfo.profile !== null &&
        (profileInfo.profile as { bare?: unknown }).bare === true;
      const contextPolicy = resolveAccountContextPolicy(accountMetadata);

      // Ensure instance exists (lazy init if needed)
      const instancePath = await instanceMgr.ensureInstance(profileInfo.name, contextPolicy, {
        bare: isBareProfile,
      });

      // Update last_used timestamp (check unified config first, fallback to legacy)
      if (registry.hasAccountUnified(profileInfo.name)) {
        registry.touchAccountUnified(profileInfo.name);
      } else {
        registry.touchProfile(profileInfo.name);
      }

      // Execute Claude with instance isolation
      // Skip WebSearch hook - account profiles use native server-side WebSearch
      // Skip Image Analyzer hook - account profiles have native vision support
      const envVars: NodeJS.ProcessEnv = {
        CLAUDE_CONFIG_DIR: instancePath,
        CCS_PROFILE_TYPE: 'account',
        CCS_WEBSEARCH_SKIP: '1',
        CCS_IMAGE_ANALYSIS_SKIP: '1',
      };
      await maybeWarnAboutResumeLaneMismatch(
        profileInfo.name,
        instancePath,
        nativeClaudeRemainingArgs
      );
      const launchArgs = resolveNativeClaudeLaunchArgs(
        nativeClaudeRemainingArgs,
        'account',
        instancePath
      );
      execClaude(claudeCli, launchArgs, envVars);
    } else {
      // DEFAULT: No profile configured, use Claude's own defaults
      // Skip WebSearch hook - native Claude has server-side WebSearch
      // Skip Image Analyzer hook - native Claude has native vision support
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
  } catch (error) {
    const err = error as ProfileError;
    // Check if this is a profile not found error with suggestions
    if (err.profileName && err.availableProfiles !== undefined) {
      const allProfiles = err.availableProfiles.split('\n');
      await ErrorManager.showProfileNotFound(err.profileName, allProfiles, err.suggestions);
    } else {
      console.error(fail(err.message));
    }
    process.exit(1);
  }
}

// ========== Global Error Handlers ==========

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  handleError(error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown) => {
  handleError(reason);
});

// Handle process termination signals for cleanup
process.on('SIGTERM', () => {
  try {
    runCleanup();
  } catch {
    // Cleanup failure should not block termination.
  }
  // If a target exec path registered additional signal listeners, let those
  // listeners forward/coordinate child shutdown and final exit codes.
  if (process.listenerCount('SIGTERM') <= 1) {
    process.exit(143); // 128 + SIGTERM(15)
  }
});

process.on('SIGINT', () => {
  try {
    runCleanup();
  } catch {
    // Cleanup failure should not block termination.
  }
  // Same coordination rule as SIGTERM.
  if (process.listenerCount('SIGINT') <= 1) {
    process.exit(130); // 128 + SIGINT(2)
  }
});

// Run main inside a per-invocation request context so all backend logging
// emitted during this CLI run shares a single requestId. CLI text output
// (stdout/stderr) is unaffected — the requestId lives in logs only.
const cliEntryStartedAt = Date.now();
const cliEntryLogger = createLogger('cli:entry');
runWithRequestId(() => {
  cliEntryLogger.stage('intake', 'cli.command.start', 'CLI invocation started', {
    argv: process.argv.slice(2),
  });
  return main()
    .then(() => {
      cliEntryLogger.stage(
        'respond',
        'cli.command.complete',
        'CLI invocation completed',
        { exitCode: process.exitCode ?? 0 },
        { latencyMs: Date.now() - cliEntryStartedAt }
      );
    })
    .catch((err) => {
      const error =
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : { name: 'Error', message: String(err) };
      cliEntryLogger.stage('cleanup', 'cli.command.failed', 'CLI invocation failed', undefined, {
        level: 'error',
        latencyMs: Date.now() - cliEntryStartedAt,
        error,
      });
      handleError(err);
    });
});
