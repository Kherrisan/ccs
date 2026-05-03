/**
 * Image Analyzer Hook Configuration
 *
 * Manages hook configuration for image analysis in Claude settings.
 *
 * @module utils/hooks/image-analyzer-hook-config
 */

import * as path from 'path';

import { getCcsHooksDir } from '../config-manager';
import { getImageAnalysisConfig } from '../../config/config-loader-facade';

// Hook file name
const IMAGE_ANALYZER_HOOK = 'image-analyzer-transformer.cjs';

/**
 * Get path to image analyzer hook
 */
export function getImageAnalyzerHookPath(): string {
  return path.join(getCcsHooksDir(), IMAGE_ANALYZER_HOOK);
}

/**
 * Get hook config for settings.json injection
 * Timeout includes buffer for CLI overhead
 */
export function getImageAnalyzerHookConfig(): Record<string, unknown> {
  const hookPath = getImageAnalyzerHookPath();
  const imageConfig = getImageAnalysisConfig();

  // Add 5 second buffer to analysis timeout for hook execution overhead
  const hookTimeout = imageConfig.timeout * 1000 + 5000;

  return {
    PreToolUse: [
      {
        matcher: 'Read',
        hooks: [
          {
            type: 'command',
            command: `node "${hookPath}"`,
            timeout: hookTimeout,
          },
        ],
      },
    ],
  };
}
