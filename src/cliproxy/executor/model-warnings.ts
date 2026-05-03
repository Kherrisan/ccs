/**
 * Model Warnings — Concern G
 *
 * Emits console warnings when the active model (or any tier model in composite
 * variants) is flagged as broken in the model catalog.
 */

import { warn } from '../../utils/ui';
import { getCurrentModel } from '../config/model-config';
import {
  isModelBroken,
  getModelIssueUrl,
  findModel,
  getSuggestedReplacementModel,
} from '../model-catalog';
import { CLIProxyProvider, ExecutorConfig } from '../types';

export interface ModelWarningsContext {
  provider: CLIProxyProvider;
  cfg: ExecutorConfig;
  compositeProviders: CLIProxyProvider[];
  skipLocalAuth: boolean;
  customSettingsPath?: string;
}

/**
 * Check all active models for known issues and emit warnings.
 *
 * For composite variants, checks every tier model.
 * For simple providers, checks the currently configured model.
 */
export function warnBrokenModels(context: ModelWarningsContext): void {
  const { provider, cfg, skipLocalAuth } = context;

  if (cfg.isComposite && cfg.compositeTiers) {
    // Check all tier models in composite variant
    const tiers: Array<'opus' | 'sonnet' | 'haiku'> = ['opus', 'sonnet', 'haiku'];
    for (const tier of tiers) {
      const tierConfig = cfg.compositeTiers[tier];
      if (tierConfig && isModelBroken(tierConfig.provider, tierConfig.model)) {
        const modelEntry = findModel(tierConfig.provider, tierConfig.model);
        const issueUrl = getModelIssueUrl(tierConfig.provider, tierConfig.model);
        console.error('');
        console.error(
          warn(
            `${tier} tier: ${modelEntry?.name || tierConfig.model} has known issues with Claude Code`
          )
        );
        console.error('    Tool calls will fail. Consider changing the model in config.yaml.');
        if (issueUrl) {
          console.error(`    Tracking: ${issueUrl}`);
        }
        console.error('');
      }
    }
  } else {
    const currentModel = getCurrentModel(provider, cfg.customSettingsPath);
    if (currentModel && isModelBroken(provider, currentModel)) {
      const modelEntry = findModel(provider, currentModel);
      const issueUrl = getModelIssueUrl(provider, currentModel);
      const replacementModel = getSuggestedReplacementModel(provider, currentModel);
      console.error('');
      console.error(warn(`${modelEntry?.name || currentModel} has known issues with Claude Code`));
      if (replacementModel) {
        console.error(`    Tool calls will fail. Use "${replacementModel}" instead.`);
      } else {
        console.error('    Tool calls will fail. Consider changing the model in config.yaml.');
      }
      if (issueUrl) {
        console.error(`    Tracking: ${issueUrl}`);
      }
      if (skipLocalAuth) {
        console.error('    Note: Model may be overridden by remote proxy configuration.');
      } else {
        console.error(`    Run "ccs ${provider} --config" to change model.`);
      }
      console.error('');
    }
  }
}
