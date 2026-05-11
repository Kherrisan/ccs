/**
 * Shared Routes — Item content readers
 *
 * Resolves the full markdown content for a given shared item path,
 * routing by collection type and enforcing allowed-root checks.
 */

import * as fs from 'fs';
import * as path from 'path';

import { safeRealPath, isPathWithinAny } from './shared-routes-path-guards';
import {
  readMarkdownContent,
  resolveReadableMarkdownPath,
  MAX_CONTENT_FILE_BYTES,
} from './shared-routes-markdown';
import { isPluginInfrastructurePath } from './shared-routes-plugins';
import { getPluginRegistryContent } from './shared-routes-plugin-registry-content';
import type { SharedContentType } from './shared-routes-types';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function getSharedSettingsContent(
  itemPath: string,
  allowedRoots: Set<string>
): { content: string; contentPath: string } | null {
  if (path.basename(itemPath) !== 'settings.json') {
    return null;
  }

  const sharedRoot = Array.from(allowedRoots)[0];
  if (!sharedRoot) {
    return null;
  }

  const settingsPath = path.join(sharedRoot, 'settings.json');
  const resolvedSettingsPath = safeRealPath(settingsPath);
  if (!resolvedSettingsPath || !isPathWithinAny(resolvedSettingsPath, allowedRoots)) {
    return null;
  }

  let stats: fs.Stats;
  try {
    stats = fs.statSync(resolvedSettingsPath);
  } catch {
    return null;
  }

  if (!stats.isFile() || stats.size > MAX_CONTENT_FILE_BYTES) {
    return null;
  }

  try {
    const rawContent = fs.readFileSync(resolvedSettingsPath, 'utf8');
    const parsed = JSON.parse(rawContent) as unknown;
    return {
      content: JSON.stringify(parsed, null, 2),
      contentPath: resolvedSettingsPath,
    };
  } catch {
    const content = readMarkdownContent(resolvedSettingsPath, allowedRoots);
    return content ? { content, contentPath: resolvedSettingsPath } : null;
  }
}

// ---------------------------------------------------------------------------
// Generic item content
// ---------------------------------------------------------------------------

export function getSharedItemContent(
  type: SharedContentType,
  itemPath: string,
  allowedRoots: Set<string>,
  sharedDir: string
): { content: string; contentPath: string } | null {
  if (type === 'settings') {
    return getSharedSettingsContent(itemPath, allowedRoots);
  }

  if (type === 'plugins') {
    const pluginRegistryContent = getPluginRegistryContent(itemPath, sharedDir, allowedRoots);
    if (pluginRegistryContent) {
      return pluginRegistryContent;
    }
  }

  const resolvedItemPath = safeRealPath(itemPath);
  if (!resolvedItemPath || !isPathWithinAny(resolvedItemPath, allowedRoots)) {
    return null;
  }

  let itemStats: fs.Stats;
  try {
    itemStats = fs.statSync(resolvedItemPath);
  } catch {
    return null;
  }

  let markdownPath: string | null = null;

  if (type === 'commands') {
    if (!itemStats.isFile() || !itemPath.toLowerCase().endsWith('.md')) {
      return null;
    }
    markdownPath = resolvedItemPath;
  } else if (type === 'skills') {
    if (!itemStats.isDirectory()) {
      return null;
    }
    markdownPath = resolveReadableMarkdownPath(
      [path.join(resolvedItemPath, 'SKILL.md')],
      allowedRoots
    );
  } else if (type === 'plugins') {
    if (!itemStats.isDirectory() || isPluginInfrastructurePath(resolvedItemPath, sharedDir)) {
      return null;
    }
    markdownPath = resolveReadableMarkdownPath(
      [
        path.join(resolvedItemPath, 'README.md'),
        path.join(resolvedItemPath, 'readme.md'),
        path.join(resolvedItemPath, 'PLUGIN.md'),
      ],
      allowedRoots
    );
    if (!markdownPath) {
      return null;
    }
  } else {
    // agents
    if (itemStats.isDirectory()) {
      markdownPath = resolveReadableMarkdownPath(
        [
          path.join(resolvedItemPath, 'prompt.md'),
          path.join(resolvedItemPath, 'AGENT.md'),
          path.join(resolvedItemPath, 'agent.md'),
        ],
        allowedRoots
      );
    } else if (itemStats.isFile() && itemPath.toLowerCase().endsWith('.md')) {
      markdownPath = resolvedItemPath;
    }
  }

  if (!markdownPath) {
    return null;
  }

  const content = readMarkdownContent(markdownPath, allowedRoots);
  if (!content) {
    return null;
  }

  return { content, contentPath: markdownPath };
}
