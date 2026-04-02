/**
 * Image Analysis Utilities
 *
 * Exports hook installer functions for prompt management
 */

export { getPromptsDir, installImageAnalysisPrompts } from './hook-installer';
export {
  getImageAnalysisMcpServerName,
  getImageAnalysisMcpServerPath,
  getImageAnalysisMcpRuntimePath,
  hasImageAnalysisMcpServerInstalled,
  hasImageAnalysisMcpConfig,
  hasImageAnalysisMcpReady,
  installImageAnalysisMcpServer,
  ensureImageAnalysisMcpConfig,
  ensureImageAnalysisMcp,
  uninstallImageAnalysisMcpServer,
  removeImageAnalysisMcpConfig,
  uninstallImageAnalysisMcp,
  syncImageAnalysisMcpToConfigDir,
  ensureImageAnalysisMcpOrThrow,
} from './mcp-installer';
export {
  appendThirdPartyImageAnalysisToolArgs,
  getImageAnalysisSteeringPrompt,
} from './claude-tool-args';

export const IMAGE_ANALYSIS_PROMPT_TEMPLATES = ['default', 'screenshot', 'document'] as const;
export type ImageAnalysisPromptTemplate = (typeof IMAGE_ANALYSIS_PROMPT_TEMPLATES)[number];
