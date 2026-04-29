/**
 * Tool Name Sanitizer
 *
 * Sanitizes MCP tool names to comply with Gemini API constraints:
 * - Max 64 characters
 * - Must start with letter or underscore
 * - Only a-z A-Z 0-9 _ . : - / allowed
 *
 * Strategies:
 * 1. Remove duplicate segments (e.g., gitmcp__foo__foo → gitmcp__foo)
 * 2. Smart truncate with hash suffix if still >64 chars
 *
 * Note: Hash collision risk is ~1 in 16M with 6-char MD5 prefix.
 * Acceptable for typical MCP tool counts (<1000 tools).
 */

import { createHash } from 'crypto';

/** Maximum tool name length allowed by Gemini API */
export const GEMINI_MAX_TOOL_NAME_LENGTH = 64;

/** Valid characters pattern for Gemini tool names */
const VALID_CHARS_REGEX = /^[a-zA-Z_][a-zA-Z0-9_.:/-]*$/;

/** Result of sanitization operation */
export interface SanitizeResult {
  /** The sanitized tool name */
  sanitized: string;
  /** Whether the name was changed */
  changed: boolean;
}

/**
 * Check if a tool name is valid for Gemini API.
 *
 * Requirements:
 * - Length <= 64 characters
 * - Starts with letter or underscore
 * - Contains only valid characters: a-z A-Z 0-9 _ . : -
 */
export function isValidToolName(name: string): boolean {
  if (!name || name.length === 0) {
    return false;
  }
  if (name.length > GEMINI_MAX_TOOL_NAME_LENGTH) {
    return false;
  }
  return VALID_CHARS_REGEX.test(name);
}

/**
 * Remove consecutive duplicate segments separated by '__'.
 *
 * Examples:
 * - 'gitmcp__foo__foo' → 'gitmcp__foo'
 * - 'a__b__c__b__c' → 'a__b__c'
 * - 'no_dupes' → 'no_dupes'
 */
export function removeDuplicateSegments(name: string): string {
  const segments = name.split('__');
  const deduped: string[] = [];

  for (const segment of segments) {
    // Only add if different from previous segment
    if (deduped.length === 0 || deduped[deduped.length - 1] !== segment) {
      deduped.push(segment);
    }
  }

  return deduped.join('__');
}

/**
 * Generate a short hash from a string for truncation suffix.
 * Uses first 6 characters of MD5 hash (16M combinations).
 */
function generateShortHash(input: string): string {
  return createHash('md5').update(input).digest('hex').slice(0, 6);
}

/**
 * Smart truncate a name to fit within maxLen.
 * Preserves start of name and appends hash suffix for uniqueness.
 *
 * Format: <prefix>_<6-char-hash>
 *
 * @param name The name to truncate
 * @param maxLen Maximum allowed length (default: 64)
 */
export function smartTruncate(name: string, maxLen: number = GEMINI_MAX_TOOL_NAME_LENGTH): string {
  if (name.length <= maxLen) {
    return name;
  }

  // Format: prefix + '_' + 6-char hash = 7 chars for suffix
  const hash = generateShortHash(name);
  const prefixLen = maxLen - 7; // 7 = '_' (1) + hash (6)
  const prefix = name.slice(0, prefixLen);

  return `${prefix}_${hash}`;
}

/**
 * Sanitize a tool name to comply with Gemini API constraints.
 *
 * Process:
 * 1. Remove duplicate segments (always, as duplicates are likely unintentional)
 * 2. Truncate with hash if >64 chars
 * 3. Return result with changed flag
 *
 * @param name The original tool name
 * @returns Sanitization result with sanitized name and changed flag
 */
export function sanitizeToolName(name: string): SanitizeResult {
  // Step 1: Always try to remove duplicate segments
  // Duplicates like gitmcp__foo__foo are likely unintentional from MCP naming
  let sanitized = removeDuplicateSegments(name);

  // Step 2: Truncate if still too long
  if (sanitized.length > GEMINI_MAX_TOOL_NAME_LENGTH) {
    sanitized = smartTruncate(sanitized);
  }

  // Step 3: If still invalid after sanitization, apply truncation to original
  if (!isValidToolName(sanitized)) {
    sanitized = smartTruncate(name);
  }

  return {
    sanitized,
    changed: sanitized !== name,
  };
}
