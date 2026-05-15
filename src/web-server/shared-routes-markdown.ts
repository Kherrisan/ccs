/**
 * Shared Routes — Markdown file reading and description extraction
 *
 * Handles YAML frontmatter parsing, body-line extraction, and safe
 * bounded reads for both description snippets and full content.
 *
 * Directory walking is in shared-routes-markdown-walker.ts.
 */

import * as fs from 'fs';
import * as yaml from 'js-yaml';

import { safeRealPath, isPathWithinAny } from './shared-routes-path-guards';

const MAX_DESCRIPTION_LENGTH = 140;
const MAX_MARKDOWN_FILE_BYTES = 1024 * 1024; // 1 MiB

/** Exported for content module which uses a larger limit. */
export const MAX_CONTENT_FILE_BYTES = 2 * 1024 * 1024; // 2 MiB

// Re-export walker types so callers only need one import for markdown concerns.
export type { MarkdownFileEntry } from './shared-routes-markdown-walker';
export { collectMarkdownFiles } from './shared-routes-markdown-walker';

// ---------------------------------------------------------------------------
// Description extraction helpers
// ---------------------------------------------------------------------------

function isDescriptionBodyLine(line: string): boolean {
  if (!line) {
    return false;
  }
  if (line === '---' || line === '...') {
    return false;
  }
  return !line.startsWith('#') && !line.startsWith('<!--');
}

function extractFrontmatterDescription(content: string): string | null {
  const frontmatterMatch = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|$)/);
  if (!frontmatterMatch) {
    return null;
  }

  try {
    const parsed = yaml.load(frontmatterMatch[1]) as Record<string, unknown> | null;
    const description = parsed?.description;
    if (typeof description !== 'string') {
      return null;
    }
    const trimmed = description.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/, '');
}

function trimDescription(description: string): string {
  if (description.length <= MAX_DESCRIPTION_LENGTH) {
    return description;
  }
  return `${description.slice(0, MAX_DESCRIPTION_LENGTH - 3).trimEnd()}...`;
}

export function extractDescription(content: string): string {
  const frontmatterDescription = extractFrontmatterDescription(content);
  if (frontmatterDescription) {
    return trimDescription(frontmatterDescription);
  }

  // Fall back to first non-empty, non-heading body line.
  const lines = stripFrontmatter(content).split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (isDescriptionBodyLine(trimmed)) {
      return trimDescription(trimmed);
    }
  }

  return 'No description';
}

// ---------------------------------------------------------------------------
// File readers
// ---------------------------------------------------------------------------

export function readMarkdownDescription(
  markdownPath: string,
  allowedRoots: Set<string>
): string | null {
  try {
    const resolvedMarkdownPath = safeRealPath(markdownPath);
    if (!resolvedMarkdownPath || !isPathWithinAny(resolvedMarkdownPath, allowedRoots)) {
      return null;
    }
    const stats = fs.statSync(resolvedMarkdownPath);
    if (!stats.isFile() || stats.size > MAX_MARKDOWN_FILE_BYTES) {
      return null;
    }
    const content = fs.readFileSync(resolvedMarkdownPath, 'utf8');
    return extractDescription(content);
  } catch {
    return null;
  }
}

export function readFirstMarkdownDescription(
  markdownPaths: string[],
  allowedRoots: Set<string>
): string | null {
  for (const markdownPath of markdownPaths) {
    const description = readMarkdownDescription(markdownPath, allowedRoots);
    if (description) {
      return description;
    }
  }
  return null;
}

export function readMarkdownContent(
  markdownPath: string,
  allowedRoots: Set<string>
): string | null {
  try {
    const resolvedMarkdownPath = safeRealPath(markdownPath);
    if (!resolvedMarkdownPath || !isPathWithinAny(resolvedMarkdownPath, allowedRoots)) {
      return null;
    }
    const stats = fs.statSync(resolvedMarkdownPath);
    if (!stats.isFile() || stats.size > MAX_CONTENT_FILE_BYTES) {
      return null;
    }
    return fs.readFileSync(resolvedMarkdownPath, 'utf8');
  } catch {
    return null;
  }
}

export function resolveReadableMarkdownPath(
  markdownPaths: string[],
  allowedRoots: Set<string>
): string | null {
  for (const markdownPath of markdownPaths) {
    const resolvedMarkdownPath = safeRealPath(markdownPath);
    if (!resolvedMarkdownPath || !isPathWithinAny(resolvedMarkdownPath, allowedRoots)) {
      continue;
    }
    try {
      const stats = fs.statSync(resolvedMarkdownPath);
      if (!stats.isFile() || stats.size > MAX_CONTENT_FILE_BYTES) {
        continue;
      }
      return resolvedMarkdownPath;
    } catch {
      continue;
    }
  }
  return null;
}
