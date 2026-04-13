/**
 * Claude launch argument helpers for first-class Image Analysis.
 */

import {
  hasExactFlagValue as hasExactClaudeFlagValue,
  splitArgsAtTerminator as splitClaudeArgsAtTerminator,
} from '../claude-tool-args';

const APPEND_SYSTEM_PROMPT_FLAG = '--append-system-prompt';
const IMAGE_ANALYSIS_STEERING_PROMPT =
  'For local image or PDF files, prefer the CCS MCP tool ImageAnalysis instead of Read. Use Read for text, code, and other plain files. If the user asks a specific question about the visual, pass that question as the focus field when useful. If ImageAnalysis is unavailable or fails, you may fall back to Read.';

function ensureImageAnalysisSteeringPrompt(args: string[]): string[] {
  const { optionArgs, trailingArgs } = splitClaudeArgsAtTerminator(args);

  if (
    hasExactClaudeFlagValue(optionArgs, APPEND_SYSTEM_PROMPT_FLAG, IMAGE_ANALYSIS_STEERING_PROMPT)
  ) {
    return args;
  }

  return [
    ...optionArgs,
    APPEND_SYSTEM_PROMPT_FLAG,
    IMAGE_ANALYSIS_STEERING_PROMPT,
    ...trailingArgs,
  ];
}

export function appendThirdPartyImageAnalysisToolArgs(args: string[]): string[] {
  return ensureImageAnalysisSteeringPrompt(args);
}

export function getImageAnalysisSteeringPrompt(): string {
  return IMAGE_ANALYSIS_STEERING_PROMPT;
}
