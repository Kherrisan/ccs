/**
 * Configuration Health Checks
 *
 * Check config.json, config.yaml, settings files, and Claude settings.
 * Supports both legacy (config.json) and unified (config.yaml) modes.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getConfigPath } from '../../utils/config-manager';

import type { HealthCheck } from './types';
import { getCcsDir, hasUnifiedConfig, isUnifiedMode } from '../../config/config-loader-facade';

/**
 * Check config file (config.json or config.yaml based on mode)
 */
export function checkConfigFile(): HealthCheck {
  // In unified mode, check config.yaml
  if (isUnifiedMode() || hasUnifiedConfig()) {
    const ccsDir = getCcsDir();
    const yamlPath = path.join(ccsDir, 'config.yaml');

    if (!fs.existsSync(yamlPath)) {
      return {
        id: 'config-file',
        name: 'config.yaml',
        status: 'warning',
        message: 'Not found (unified mode)',
        details: yamlPath,
        fixable: true,
      };
    }

    try {
      fs.readFileSync(yamlPath, 'utf8');
      return {
        id: 'config-file',
        name: 'config.yaml',
        status: 'ok',
        message: 'Valid (unified mode)',
        details: yamlPath,
      };
    } catch {
      return {
        id: 'config-file',
        name: 'config.yaml',
        status: 'error',
        message: 'Cannot read file',
        details: yamlPath,
      };
    }
  }

  // Legacy mode: check config.json
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    return {
      id: 'config-file',
      name: 'config.json',
      status: 'warning',
      message: 'Not found',
      details: configPath,
      fixable: true,
    };
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    JSON.parse(content);
    return {
      id: 'config-file',
      name: 'config.json',
      status: 'ok',
      message: 'Valid',
      details: configPath,
    };
  } catch {
    return {
      id: 'config-file',
      name: 'config.json',
      status: 'error',
      message: 'Invalid JSON',
      details: configPath,
    };
  }
}

/**
 * Check settings files (glm, km with legacy kimi fallback)
 */
export function checkSettingsFiles(ccsDir: string): HealthCheck[] {
  const checks: HealthCheck[] = [];
  const profiles = ['glm', 'km'];

  const { DelegationValidator } = require('../../utils/delegation-validator');

  for (const profile of profiles) {
    const fileName = `${profile}.settings.json`;
    const filePath = path.join(ccsDir, fileName);
    const validation = DelegationValidator.validate(profile);

    if (!validation.valid && validation.error?.includes('Profile not found')) {
      checks.push({
        id: `settings-${profile}`,
        name: fileName,
        status: 'info',
        message: 'Not configured',
        details: filePath,
      });
      continue;
    }

    const resolvedPath = validation.settingsPath || filePath;
    const resolvedName = path.basename(resolvedPath);

    if (validation.valid) {
      checks.push({
        id: `settings-${profile}`,
        name: resolvedName,
        status: 'ok',
        message: 'Key configured',
        details: resolvedPath,
      });
      continue;
    }

    if (validation.error?.includes('placeholder')) {
      checks.push({
        id: `settings-${profile}`,
        name: resolvedName,
        status: 'warning',
        message: 'Placeholder key',
        details: resolvedPath,
      });
      continue;
    }

    if (validation.error?.includes('Failed to parse settings.json')) {
      checks.push({
        id: `settings-${profile}`,
        name: resolvedName,
        status: 'error',
        message: 'Invalid JSON',
        details: resolvedPath,
      });
      continue;
    }

    // Keep prior behavior for non-placeholder validation issues (e.g., missing key).
    checks.push({
      id: `settings-${profile}`,
      name: resolvedName,
      status: 'ok',
      message: 'Valid JSON',
      details: resolvedPath,
    });
  }

  return checks;
}

/**
 * Check Claude settings file
 */
export function checkClaudeSettings(claudeDir: string): HealthCheck {
  const settingsPath = path.join(claudeDir, 'settings.json');

  if (!fs.existsSync(settingsPath)) {
    return {
      id: 'claude-settings',
      name: '~/.claude/settings.json',
      status: 'warning',
      message: 'Not found',
      fix: 'Run: claude /login',
    };
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf8');
    JSON.parse(content);
    return {
      id: 'claude-settings',
      name: '~/.claude/settings.json',
      status: 'ok',
      message: 'Valid',
    };
  } catch {
    return {
      id: 'claude-settings',
      name: '~/.claude/settings.json',
      status: 'warning',
      message: 'Invalid JSON',
      fix: 'Run: claude /login',
    };
  }
}
