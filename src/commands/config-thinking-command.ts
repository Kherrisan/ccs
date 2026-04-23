/**
 * Config Thinking Command Handler
 *
 * Manages thinking section of config.yaml via CLI.
 * Usage: ccs config thinking [options]
 */

import { initUI, header, ok, info, warn, fail, subheader, color, dim } from '../utils/ui';
import {
  getThinkingConfig,
  updateUnifiedConfig,
  loadOrCreateUnifiedConfig,
} from '../config/unified-config-loader';
import { DEFAULT_THINKING_TIER_DEFAULTS } from '../config/unified-config-types';
import { VALID_THINKING_LEVELS } from '../cliproxy/thinking-validator';
import {
  clearProviderOverride,
  parseThinkingCommandArgs,
  parseThinkingOverrideInput,
} from './config-thinking-parser';

const VALID_THINKING_MODES = ['auto', 'off', 'manual'] as const;

const VALID_TIERS = ['opus', 'sonnet', 'haiku'] as const;
type ThinkingTier = (typeof VALID_TIERS)[number];
export { parseThinkingCommandArgs, parseThinkingOverrideInput } from './config-thinking-parser';

function showHelp(): void {
  console.log('');
  console.log(header('ccs config thinking'));
  console.log('');
  console.log('  Configure extended thinking/reasoning for CLIProxy providers.');
  console.log('');

  console.log(subheader('Usage:'));
  console.log(`  ${color('ccs config thinking', 'command')} [options]`);
  console.log('');

  console.log(subheader('Options:'));
  console.log(
    `  ${color('--mode <mode>', 'command')}                    Set mode (auto, off, manual)`
  );
  console.log(
    `  ${color('--override <level>', 'command')}               Set persistent override (manual mode)`
  );
  console.log(
    `  ${color('--clear-override', 'command')}                  Remove persistent override`
  );
  console.log(
    `  ${color('--tier <tier> <level>', 'command')}            Set tier default (opus/sonnet/haiku)`
  );
  console.log(
    `  ${color('--provider-override <p> <t> <l>', 'command')} Set provider-specific tier override`
  );
  console.log(
    `  ${color('--clear-provider-override <p> [t]', 'command')} Remove provider override (provider or tier)`
  );
  console.log(`  ${color('--help, -h', 'command')}                        Show this help`);
  console.log('');

  console.log(subheader('Levels:'));
  console.log(
    `  ${dim('minimal (512), low (1K), medium (8K), high (24K), xhigh (32K), max (adaptive ceiling), auto, off')}`
  );
  console.log('');

  console.log(subheader('Examples:'));
  console.log(
    `  $ ${color('ccs config thinking', 'command')}                            ${dim('# Show status')}`
  );
  console.log(
    `  $ ${color('ccs config thinking --mode auto', 'command')}                ${dim('# Auto mode')}`
  );
  console.log(
    `  $ ${color('ccs config thinking --mode manual --override high', 'command')} ${dim('# Persistent high')}`
  );
  console.log(
    `  $ ${color('ccs config thinking --tier opus xhigh', 'command')}          ${dim('# Opus -> xhigh')}`
  );
  console.log(
    `  $ ${color('ccs config thinking --provider-override codex opus xhigh', 'command')}`
  );
  console.log(
    `  $ ${color('ccs config thinking --clear-provider-override codex opus', 'command')}`
  );
  console.log('');

  console.log(subheader('Environment:'));
  console.log(
    `  ${color('CCS_THINKING', 'command')}  Override per-session via env var (priority: flag > env > config)`
  );
  console.log(`  ${dim('Example: CCS_THINKING=high ccs codex "debug this"')}`);
  console.log('');
}

function showStatus(): void {
  const config = getThinkingConfig();

  console.log('');
  console.log(header('Thinking Configuration'));
  console.log('');

  // Mode
  const modeText =
    config.mode === 'auto' ? ok('Auto') : config.mode === 'off' ? warn('Off') : info('Manual');
  console.log(`  Mode:      ${modeText}`);

  // Override
  if (config.override !== undefined) {
    console.log(`  Override:  ${color(String(config.override), 'command')}`);
  }

  // Warnings
  console.log(`  Warnings:  ${config.show_warnings !== false ? 'on' : 'off'}`);
  console.log('');

  // Tier defaults
  console.log(subheader('Tier Defaults:'));
  for (const tier of VALID_TIERS) {
    const level = config.tier_defaults?.[tier] ?? DEFAULT_THINKING_TIER_DEFAULTS[tier];
    const isDefault = level === DEFAULT_THINKING_TIER_DEFAULTS[tier];
    const suffix = isDefault ? dim(' (default)') : '';
    console.log(`  ${color(tier.padEnd(10), 'command')} ${level}${suffix}`);
  }
  console.log('');

  // Provider overrides
  const overrides = config.provider_overrides;
  if (overrides && Object.keys(overrides).length > 0) {
    console.log(subheader('Provider Overrides:'));
    for (const [provider, tierOverrides] of Object.entries(overrides)) {
      const parts = Object.entries(tierOverrides)
        .map(([t, l]) => `${t}=${l}`)
        .join(', ');
      console.log(`  ${color(provider.padEnd(10), 'command')} ${parts}`);
    }
    console.log('');
  }

  // Config location
  console.log(subheader('Configuration:'));
  console.log(`  File: ${color('~/.ccs/config.yaml', 'path')}`);
  console.log(`  Section: ${dim('thinking')}`);
  console.log('');

  // Env var hint
  if (process.env.CCS_THINKING) {
    console.log(info(`CCS_THINKING env var active: ${process.env.CCS_THINKING}`));
    console.log('');
  }
}

export async function handleConfigThinkingCommand(args: string[]): Promise<void> {
  await initUI();

  const { options, error } = parseThinkingCommandArgs(args);
  if (error) {
    console.error(fail(error));
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    showHelp();
    return;
  }

  let hasChanges = false;
  const config = loadOrCreateUnifiedConfig();
  const thinkingConfig = config.thinking ?? {
    mode: 'auto' as const,
    tier_defaults: { ...DEFAULT_THINKING_TIER_DEFAULTS },
    show_warnings: true,
  };

  // Validate and apply --mode
  if (options.mode !== undefined) {
    const normalizedMode = options.mode.trim().toLowerCase();
    if (!(VALID_THINKING_MODES as readonly string[]).includes(normalizedMode)) {
      console.error(fail(`Invalid mode: ${options.mode}`));
      console.error(info(`Valid modes: ${VALID_THINKING_MODES.join(', ')}`));
      process.exitCode = 1;
      return;
    }
    thinkingConfig.mode = normalizedMode as 'auto' | 'off' | 'manual';
    hasChanges = true;
  }

  // Validate and apply --override
  if (options.override !== undefined) {
    const parsedOverride = parseThinkingOverrideInput(options.override);
    if (parsedOverride.error) {
      console.error(fail(parsedOverride.error));
      console.error(info(`Valid levels: ${VALID_THINKING_LEVELS.join(', ')}, or a number`));
      process.exitCode = 1;
      return;
    }
    thinkingConfig.override = parsedOverride.value;
    hasChanges = true;
  }

  // Apply --clear-override
  if (options.clearOverride) {
    thinkingConfig.override = undefined;
    hasChanges = true;
  }

  // Validate and apply --tier
  if (options.tier) {
    const tier = options.tier.tier.toLowerCase().trim();
    const level = options.tier.level.toLowerCase().trim();
    if (!(VALID_TIERS as readonly string[]).includes(tier)) {
      console.error(fail(`Invalid tier: ${options.tier.tier}`));
      console.error(info(`Valid tiers: ${VALID_TIERS.join(', ')}`));
      process.exitCode = 1;
      return;
    }
    if (!(VALID_THINKING_LEVELS as readonly string[]).includes(level)) {
      console.error(fail(`Invalid level for ${tier}: ${options.tier.level}`));
      console.error(info(`Valid levels: ${VALID_THINKING_LEVELS.join(', ')}`));
      process.exitCode = 1;
      return;
    }
    thinkingConfig.tier_defaults = {
      ...DEFAULT_THINKING_TIER_DEFAULTS,
      ...thinkingConfig.tier_defaults,
      [tier]: level,
    };
    hasChanges = true;
  }

  // Validate and apply --provider-override
  if (options.providerOverride) {
    const provider = options.providerOverride.provider.trim().toLowerCase();
    const tier = options.providerOverride.tier.trim().toLowerCase();
    const level = options.providerOverride.level.trim().toLowerCase();
    if (!provider) {
      console.error(fail('Provider name cannot be empty'));
      process.exitCode = 1;
      return;
    }
    if (!(VALID_TIERS as readonly string[]).includes(tier)) {
      console.error(fail(`Invalid tier: ${options.providerOverride.tier}`));
      process.exitCode = 1;
      return;
    }
    if (!(VALID_THINKING_LEVELS as readonly string[]).includes(level)) {
      console.error(fail(`Invalid level: ${options.providerOverride.level}`));
      process.exitCode = 1;
      return;
    }
    const normalizedTier = tier as ThinkingTier;
    thinkingConfig.provider_overrides = {
      ...thinkingConfig.provider_overrides,
      [provider]: {
        ...thinkingConfig.provider_overrides?.[provider],
        [normalizedTier]: level,
      },
    };
    hasChanges = true;
  }

  // Validate and apply --clear-provider-override
  if (options.clearProviderOverride) {
    const provider = options.clearProviderOverride.provider.trim().toLowerCase();
    const tier = options.clearProviderOverride.tier?.trim().toLowerCase();
    if (!provider) {
      console.error(fail('Provider name cannot be empty'));
      process.exitCode = 1;
      return;
    }
    if (tier && !(VALID_TIERS as readonly string[]).includes(tier)) {
      console.error(fail(`Invalid tier: ${options.clearProviderOverride.tier}`));
      console.error(info(`Valid tiers: ${VALID_TIERS.join(', ')}`));
      process.exitCode = 1;
      return;
    }
    const normalizedTier = tier as ThinkingTier | undefined;
    const clearResult = clearProviderOverride(
      thinkingConfig.provider_overrides,
      provider,
      normalizedTier
    );
    thinkingConfig.provider_overrides = clearResult.nextOverrides;
    if (clearResult.changed) {
      hasChanges = true;
    } else {
      console.log(
        info(`No provider override found for '${provider}'${tier ? ` tier '${tier}'` : ''}`)
      );
      console.log('');
    }
  }

  if (hasChanges) {
    updateUnifiedConfig({ thinking: thinkingConfig });
    console.log(ok('Configuration updated'));
    console.log('');
  }

  // Always show current status
  showStatus();
}
