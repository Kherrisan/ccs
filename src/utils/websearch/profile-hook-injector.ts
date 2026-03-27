/**
 * Profile Hook Injector
 *
 * Injects WebSearch hooks into per-profile settings files.
 * This replaces the global ~/.claude/settings.json approach.
 *
 * @module utils/websearch/profile-hook-injector
 */

import * as fs from 'fs';
import * as path from 'path';
import { info, warn } from '../ui';
import { getWebSearchHookConfig, getHookPath } from './hook-config';
import { getWebSearchConfig } from '../../config/unified-config-loader';
import { removeHookConfig } from './hook-config';
import { getCcsDir } from '../config-manager';
import { isCcsWebSearchHook, deduplicateCcsHooks } from './hook-utils';
import { installWebSearchHook } from './hook-installer';

// Valid profile name pattern (alphanumeric, dash, underscore only)
const VALID_PROFILE_NAME = /^[a-zA-Z0-9_-]+$/;

/**
 * Get migration marker path (respects CCS_HOME for test isolation)
 */
function getMigrationMarkerPath(): string {
  return path.join(getCcsDir(), '.hook-migrated');
}

/**
 * Check if CCS WebSearch hook exists in settings
 */
function hasCcsHook(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (!hooks?.PreToolUse) return false;

  return hooks.PreToolUse.some((h: unknown) => {
    return isCcsWebSearchHook(h as Record<string, unknown>);
  });
}

/**
 * Migrate CCS hook from global settings to profile settings (one-time)
 */
function migrateGlobalHook(): void {
  const markerPath = getMigrationMarkerPath();
  if (fs.existsSync(markerPath)) {
    return; // Already migrated
  }

  try {
    const removed = removeHookConfig();
    if (removed && process.env.CCS_DEBUG) {
      console.error(info('Migrated WebSearch hook from global settings'));
    }
    // Ensure CCS dir exists before creating marker
    const ccsDir = getCcsDir();
    if (!fs.existsSync(ccsDir)) {
      fs.mkdirSync(ccsDir, { recursive: true, mode: 0o700 });
    }
    // Create marker file atomically (wx = fail if exists, prevents race condition)
    fs.writeFileSync(markerPath, new Date().toISOString(), { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (process.env.CCS_DEBUG) {
      console.error(warn(`Migration failed: ${(error as Error).message}`));
    }
  }
}

/**
 * Ensure WebSearch hook is configured in profile's settings file
 *
 * @param profileName - Name of the profile (e.g., 'agy', 'gemini', 'glm')
 * @returns true if hook is configured (existing or newly added)
 */
export function ensureProfileHooks(profileName: string): boolean {
  try {
    // Validate profile name to prevent path traversal
    if (!VALID_PROFILE_NAME.test(profileName)) {
      if (process.env.CCS_DEBUG) {
        console.error(warn(`Invalid profile name: ${profileName}`));
      }
      return false;
    }

    const wsConfig = getWebSearchConfig();

    // Skip if WebSearch is disabled
    if (!wsConfig.enabled) {
      return false;
    }

    // One-time migration from global settings
    migrateGlobalHook();

    // Get CCS directory (respects CCS_HOME for test isolation)
    const ccsDir = getCcsDir();

    // Ensure CCS dir exists
    if (!fs.existsSync(ccsDir)) {
      fs.mkdirSync(ccsDir, { recursive: true, mode: 0o700 });
    }

    // Keep the injected command target valid for all profile types, not just CLIProxy.
    if (!installWebSearchHook() && !fs.existsSync(getHookPath())) {
      if (process.env.CCS_DEBUG) {
        console.error(warn('WebSearch hook binary is missing and could not be installed'));
      }
      return false;
    }

    const settingsPath = path.join(ccsDir, `${profileName}.settings.json`);

    // Read existing settings or create empty
    let settings: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      try {
        const content = fs.readFileSync(settingsPath, 'utf8');
        settings = JSON.parse(content);
      } catch (parseError) {
        if (process.env.CCS_DEBUG) {
          console.error(
            warn(`Malformed ${profileName}.settings.json: ${(parseError as Error).message}`)
          );
        }
        // Never overwrite malformed settings files; avoid destructive data loss.
        return false;
      }
    }

    // Check if CCS hook already present
    if (hasCcsHook(settings)) {
      // Clean up any duplicates that may have accumulated (Windows path bug fix)
      const hadDuplicates = deduplicateCcsHooks(settings);
      if (hadDuplicates) {
        // Re-read file to compare with modified settings (deduplicateCcsHooks mutates in-place)
        const newContent = JSON.stringify(settings, null, 2);
        const existingContent = fs.readFileSync(settingsPath, 'utf8');
        // Only write if content actually changed
        if (newContent !== existingContent) {
          fs.writeFileSync(settingsPath, newContent, 'utf8');
          if (process.env.CCS_DEBUG) {
            console.error(
              info(`Removed duplicate WebSearch hooks from ${profileName}.settings.json`)
            );
          }
        }
      }
      // Update timeout if needed
      return updateHookTimeoutIfNeeded(settings, settingsPath);
    }

    // Get hook config
    const hookConfig = getWebSearchHookConfig();

    // Ensure hooks structure exists
    if (!settings.hooks) {
      settings.hooks = {};
    }

    const settingsHooks = settings.hooks as Record<string, unknown[]>;
    if (!settingsHooks.PreToolUse) {
      settingsHooks.PreToolUse = [];
    }

    // Add CCS hook
    const preToolUseHooks = hookConfig.PreToolUse as unknown[];
    settingsHooks.PreToolUse.push(...preToolUseHooks);

    // Write updated settings
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

    if (process.env.CCS_DEBUG) {
      console.error(info(`Added WebSearch hook to ${profileName}.settings.json`));
    }

    return true;
  } catch (error) {
    if (process.env.CCS_DEBUG) {
      console.error(warn(`Failed to inject hook: ${(error as Error).message}`));
    }
    return false;
  }
}

/**
 * Update hook timeout if it differs from current config
 */
function updateHookTimeoutIfNeeded(
  settings: Record<string, unknown>,
  settingsPath: string
): boolean {
  try {
    const hooks = settings.hooks as Record<string, unknown[]>;
    const hookConfig = getWebSearchHookConfig();
    const expectedHookPath = getHookPath();
    const expectedCommand = `node "${expectedHookPath}"`;
    const expectedHooks = (hookConfig.PreToolUse as Array<Record<string, unknown>>)[0]
      .hooks as Array<Record<string, unknown>>;
    const expectedTimeout = expectedHooks[0].timeout as number;

    let needsUpdate = false;

    for (const h of hooks.PreToolUse) {
      const hook = h as Record<string, unknown>;
      if (hook.matcher !== 'WebSearch') continue;

      const hookArray = hook.hooks as Array<Record<string, unknown>>;
      if (!hookArray?.[0]?.command) continue;

      const command = hookArray[0].command;
      if (typeof command !== 'string') continue;
      // Normalize path separators for cross-platform matching (Windows uses backslashes)
      const normalizedCommand = command
        .replace(/\\/g, '/') // Windows backslashes
        .replace(/\/+/g, '/'); // Collapse multiple slashes
      if (!normalizedCommand.includes('.ccs/hooks/websearch-transformer')) continue;

      // Found CCS hook - check if needs update
      if (hookArray[0].command !== expectedCommand) {
        hookArray[0].command = expectedCommand;
        needsUpdate = true;
      }

      if (hookArray[0].timeout !== expectedTimeout) {
        hookArray[0].timeout = expectedTimeout;
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
      if (process.env.CCS_DEBUG) {
        console.error(info('Updated WebSearch hook timeout in profile settings'));
      }
    }

    return true;
  } catch (error) {
    if (process.env.CCS_DEBUG) {
      console.error(warn(`updateHookTimeoutIfNeeded failed: ${(error as Error).message}`));
    }
    return false;
  }
}

/**
 * Remove migration marker (called during uninstall)
 */
export function removeMigrationMarker(): void {
  try {
    const markerPath = getMigrationMarkerPath();
    if (fs.existsSync(markerPath)) {
      fs.unlinkSync(markerPath);
    }
  } catch (error) {
    if (process.env.CCS_DEBUG) {
      console.error(warn(`removeMigrationMarker failed: ${(error as Error).message}`));
    }
  }
}
