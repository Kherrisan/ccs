/**
 * Image Analyzer Hook Installer
 *
 * Manages installation and uninstallation of the image analyzer hook.
 * This hook intercepts Read tool calls and analyzes image files via CLIProxy.
 *
 * @module utils/hooks/image-analyzer-hook-installer
 */

import * as fs from 'fs';
import * as path from 'path';
import { info, warn } from '../ui';
import { getImageAnalyzerHookPath } from './image-analyzer-hook-configuration';
import { getCcsHooksDir } from '../config-manager';
import { getImageAnalysisConfig } from '../../config/unified-config-loader';
import { removeMigrationMarker } from './image-analyzer-profile-hook-injector';
import { installImageAnalysisPrompts } from '../image-analysis/hook-installer';

// Re-export from hook-configuration for backward compatibility
export {
  getImageAnalyzerHookPath,
  getImageAnalyzerHookConfig,
} from './image-analyzer-hook-configuration';

// Hook file name
const IMAGE_ANALYZER_HOOK = 'image-analyzer-transformer.cjs';
const IMAGE_ANALYSIS_RUNTIME = 'image-analysis-runtime.cjs';

function getImageAnalysisRuntimeHookPath(): string {
  return path.join(getCcsHooksDir(), IMAGE_ANALYSIS_RUNTIME);
}

function getHookArtifacts(): Array<{ fileName: string; destinationPath: string }> {
  return [
    { fileName: IMAGE_ANALYZER_HOOK, destinationPath: getImageAnalyzerHookPath() },
    {
      fileName: IMAGE_ANALYSIS_RUNTIME,
      destinationPath: getImageAnalysisRuntimeHookPath(),
    },
  ];
}

function resolveHookSourceBasePath(
  artifacts: Array<{ fileName: string; destinationPath: string }>
): string | null {
  const possibleBasePaths = [
    path.join(__dirname, '..', '..', '..', 'lib', 'hooks'),
    path.join(__dirname, '..', '..', 'lib', 'hooks'),
    path.join(__dirname, '..', 'lib', 'hooks'),
  ];

  for (const basePath of possibleBasePaths) {
    if (artifacts.every(({ fileName }) => fs.existsSync(path.join(basePath, fileName)))) {
      return basePath;
    }
  }

  return null;
}

function artifactsMatch(sourcePath: string, destinationPath: string): boolean {
  try {
    return fs.readFileSync(sourcePath).equals(fs.readFileSync(destinationPath));
  } catch {
    return false;
  }
}

/**
 * Check if image analyzer hook is installed
 */
export function hasImageAnalyzerHook(): boolean {
  const artifacts = getHookArtifacts();
  if (!artifacts.every(({ destinationPath }) => fs.existsSync(destinationPath))) {
    return false;
  }

  const sourceBasePath = resolveHookSourceBasePath(artifacts);
  if (!sourceBasePath) {
    return true;
  }

  return artifacts.every(({ fileName, destinationPath }) =>
    artifactsMatch(path.join(sourceBasePath, fileName), destinationPath)
  );
}

/**
 * Install image analyzer hook to ~/.ccs/hooks/
 *
 * This hook intercepts Read calls and analyzes images via CLIProxy.
 *
 * @returns true if hook installed successfully
 */
export function installImageAnalyzerHook(): boolean {
  try {
    const imageConfig = getImageAnalysisConfig();

    // Skip if disabled
    if (!imageConfig.enabled) {
      if (process.env.CCS_DEBUG) {
        console.error(info('Image analysis disabled - skipping hook install'));
      }
      return false;
    }

    // Ensure hooks directory exists
    const hooksDir = getCcsHooksDir();
    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true, mode: 0o700 });
    }

    const artifacts = getHookArtifacts();
    const sourceBasePath = resolveHookSourceBasePath(artifacts);

    if (!sourceBasePath) {
      if (process.env.CCS_DEBUG) {
        console.error(warn(`Image analyzer hook source not found: ${IMAGE_ANALYZER_HOOK}`));
      }
      return false;
    }

    for (const { fileName, destinationPath } of artifacts) {
      fs.copyFileSync(path.join(sourceBasePath, fileName), destinationPath);
      fs.chmodSync(destinationPath, 0o755);
    }

    installImageAnalysisPrompts();

    if (process.env.CCS_DEBUG) {
      console.error(info(`Installed image analyzer hook runtime: ${hooksDir}`));
    }

    // Note: Hook registration is handled by ensureProfileHooks() in image-analyzer-profile-injector.ts
    // which writes to per-profile settings (~/.ccs/<profile>.settings.json)
    // Global settings (~/.claude/settings.json) are NOT modified here

    return true;
  } catch (error) {
    if (process.env.CCS_DEBUG) {
      console.error(warn(`Failed to install image analyzer hook: ${(error as Error).message}`));
    }
    return false;
  }
}

/**
 * Uninstall image analyzer hook from ~/.ccs/hooks/
 *
 * Note: Does NOT touch global ~/.claude/settings.json.
 * Profile-specific hooks are removed when ~/.ccs/ is deleted.
 *
 * @returns true if hook uninstalled successfully
 */
export function uninstallImageAnalyzerHook(): boolean {
  try {
    const artifactPaths = [getImageAnalyzerHookPath(), getImageAnalysisRuntimeHookPath()];

    for (const artifactPath of artifactPaths) {
      if (fs.existsSync(artifactPath)) {
        fs.unlinkSync(artifactPath);
        if (process.env.CCS_DEBUG) {
          console.error(info(`Uninstalled image analyzer artifact: ${artifactPath}`));
        }
      }
    }

    // Remove migration marker (so fresh install re-runs migration)
    removeMigrationMarker();

    // Note: Do NOT call removeHookConfig() - global settings should not be touched.
    // Per-profile hooks in ~/.ccs/*.settings.json are cleaned up when ~/.ccs/ is deleted.

    return true;
  } catch (error) {
    if (process.env.CCS_DEBUG) {
      console.error(warn(`Failed to uninstall image analyzer hook: ${(error as Error).message}`));
    }
    return false;
  }
}
