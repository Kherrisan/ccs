/**
 * Shared Routes — Collection item list builders
 *
 * Builds SharedItem arrays for commands, skills, and agents with
 * a short-lived in-memory cache keyed by collection type.
 */

import * as fs from 'fs';
import * as path from 'path';

import { getCcsDir } from '../config/config-loader-facade';
import { safeRealPath, isPathWithinAny, resolveAllowedRoots } from './shared-routes-path-guards';
import {
  readMarkdownDescription,
  readFirstMarkdownDescription,
  collectMarkdownFiles,
} from './shared-routes-markdown';
import { getPluginItems } from './shared-routes-plugins';
import type {
  SharedItem,
  SharedItemsCacheEntry,
  SharedCollectionType,
} from './shared-routes-types';

const SHARED_ITEMS_CACHE_TTL_MS = 1000;

const sharedItemsCache = new Map<SharedCollectionType, SharedItemsCacheEntry>();

// ---------------------------------------------------------------------------
// Per-type item builders
// ---------------------------------------------------------------------------

export function getCommandItems(sharedDir: string, allowedRoots: Set<string>): SharedItem[] {
  const markdownFiles = collectMarkdownFiles(sharedDir, allowedRoots);
  const items: SharedItem[] = [];

  for (const markdownFile of markdownFiles) {
    const description = readMarkdownDescription(markdownFile.resolvedPath, allowedRoots);
    if (!description) {
      continue;
    }

    const relativePath = path.relative(sharedDir, markdownFile.displayPath);
    const normalizedName = relativePath.split(path.sep).join('/').replace(/\.md$/i, '');
    if (!normalizedName) {
      continue;
    }

    items.push({
      name: normalizedName,
      description,
      path: markdownFile.displayPath,
      type: 'command',
    });
  }

  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export function getSkillOrAgentItem(
  type: 'skills' | 'agents',
  entry: fs.Dirent,
  entryPath: string,
  resolvedEntryPath: string,
  allowedRoots: Set<string>,
  stats: fs.Stats
): SharedItem | null {
  if (type === 'skills') {
    if (!stats.isDirectory()) {
      return null;
    }
    const description = readMarkdownDescription(
      path.join(resolvedEntryPath, 'SKILL.md'),
      allowedRoots
    );
    if (!description) {
      return null;
    }
    return { name: entry.name, description, path: entryPath, type: 'skill' };
  }

  // agents
  if (stats.isDirectory()) {
    const description = readFirstMarkdownDescription(
      [
        path.join(resolvedEntryPath, 'prompt.md'),
        path.join(resolvedEntryPath, 'AGENT.md'),
        path.join(resolvedEntryPath, 'agent.md'),
      ],
      allowedRoots
    );
    if (!description) {
      return null;
    }
    return { name: entry.name, description, path: entryPath, type: 'agent' };
  }

  if (!stats.isFile() || !entry.name.toLowerCase().endsWith('.md')) {
    return null;
  }

  const description = readMarkdownDescription(resolvedEntryPath, allowedRoots);
  if (!description) {
    return null;
  }
  return { name: entry.name.replace(/\.md$/i, ''), description, path: entryPath, type: 'agent' };
}

// ---------------------------------------------------------------------------
// Public cache-backed entry point
// ---------------------------------------------------------------------------

export function getSharedItems(type: SharedCollectionType): SharedItem[] {
  const ccsDir = getCcsDir();
  const sharedDir = path.join(ccsDir, 'shared', type);
  const now = Date.now();

  if (!fs.existsSync(sharedDir)) {
    sharedItemsCache.delete(type);
    return [];
  }

  const cached = sharedItemsCache.get(type);
  if (cached && cached.sharedDir === sharedDir && cached.expiresAt > now) {
    return cached.items;
  }

  const sharedDirRoot = safeRealPath(sharedDir) ?? path.resolve(sharedDir);
  const allowedRoots = resolveAllowedRoots(type, ccsDir, sharedDirRoot);

  if (type === 'commands') {
    const commandItems = getCommandItems(sharedDir, allowedRoots);
    sharedItemsCache.set(type, {
      items: commandItems,
      sharedDir,
      expiresAt: now + SHARED_ITEMS_CACHE_TTL_MS,
    });
    return commandItems;
  }

  if (type === 'plugins') {
    const pluginItems = getPluginItems(sharedDir, allowedRoots);
    sharedItemsCache.set(type, {
      items: pluginItems,
      sharedDir,
      expiresAt: now + SHARED_ITEMS_CACHE_TTL_MS,
    });
    return pluginItems;
  }

  // skills | agents
  const items: SharedItem[] = [];
  try {
    const entries = fs.readdirSync(sharedDir, { withFileTypes: true });

    for (const entry of entries) {
      try {
        const entryPath = path.join(sharedDir, entry.name);
        const resolvedEntryPath = safeRealPath(entryPath);
        if (!resolvedEntryPath || !isPathWithinAny(resolvedEntryPath, allowedRoots)) {
          continue;
        }

        const stats = fs.statSync(resolvedEntryPath);
        const item = getSkillOrAgentItem(
          type,
          entry,
          entryPath,
          resolvedEntryPath,
          allowedRoots,
          stats
        );
        if (!item) {
          continue;
        }
        items.push(item);
      } catch {
        // Fail soft per entry so one bad item does not hide valid results.
      }
    }
  } catch {
    // Directory read failed — return empty list
  }

  const sortedItems = items.sort((a, b) => a.name.localeCompare(b.name));
  sharedItemsCache.set(type, {
    items: sortedItems,
    sharedDir,
    expiresAt: now + SHARED_ITEMS_CACHE_TTL_MS,
  });
  return sortedItems;
}
