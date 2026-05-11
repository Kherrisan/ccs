/**
 * Shared Routes — Plugin collection and registry helpers
 *
 * Handles installed_plugins.json registry reads, legacy plugin directory
 * scanning, and plugin path encode/decode.
 *
 * Registry content rendering is in shared-routes-plugin-registry-content.ts.
 */

import * as fs from 'fs';
import * as path from 'path';

import { safeRealPath, isPathWithin, isPathWithinAny } from './shared-routes-path-guards';
import { readFirstMarkdownDescription, MAX_CONTENT_FILE_BYTES } from './shared-routes-markdown';
import type { SharedItem, InstalledPluginRegistry } from './shared-routes-types';

const PLUGIN_REGISTRY_PATH_PREFIX = 'plugin-registry:';
const PLUGIN_INFRASTRUCTURE_DIRECTORIES = new Set(['cache', 'data', 'marketplaces']);

// ---------------------------------------------------------------------------
// Path encode / decode
// ---------------------------------------------------------------------------

export function encodePluginRegistryPath(pluginName: string): string {
  return `${PLUGIN_REGISTRY_PATH_PREFIX}${encodeURIComponent(pluginName)}`;
}

export function decodePluginRegistryPath(itemPath: string): string | null {
  if (!itemPath.startsWith(PLUGIN_REGISTRY_PATH_PREFIX)) {
    return null;
  }
  try {
    const encodedName = itemPath.slice(PLUGIN_REGISTRY_PATH_PREFIX.length);
    const pluginName = decodeURIComponent(encodedName);
    return pluginName.length > 0 ? pluginName : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

export function readJsonObject(
  filePath: string,
  allowedRoots: Set<string>
): Record<string, unknown> | null {
  const resolvedPath = safeRealPath(filePath);
  if (!resolvedPath || !isPathWithinAny(resolvedPath, allowedRoots)) {
    return null;
  }
  try {
    const stats = fs.statSync(resolvedPath);
    if (!stats.isFile() || stats.size > MAX_CONTENT_FILE_BYTES) {
      return null;
    }
    const parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function readPluginInstalledRegistry(
  sharedDir: string,
  allowedRoots: Set<string>
): InstalledPluginRegistry | null {
  const parsed = readJsonObject(path.join(sharedDir, 'installed_plugins.json'), allowedRoots);
  if (
    !parsed ||
    !parsed.plugins ||
    typeof parsed.plugins !== 'object' ||
    Array.isArray(parsed.plugins)
  ) {
    return null;
  }
  return {
    version: typeof parsed.version === 'number' ? parsed.version : undefined,
    plugins: parsed.plugins as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Description helpers
// ---------------------------------------------------------------------------

export function extractMarketplaceFromPluginName(pluginName: string): string | null {
  const atIndex = pluginName.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === pluginName.length - 1) {
    return null;
  }
  return pluginName.slice(atIndex + 1);
}

export function describeInstalledPlugin(pluginName: string, metadata: unknown): string {
  const recordCount = Array.isArray(metadata) ? metadata.length : 1;
  const marketplace = extractMarketplaceFromPluginName(pluginName);
  const recordLabel = `${recordCount} ${recordCount === 1 ? 'record' : 'records'}`;
  return marketplace
    ? `Installed from ${marketplace}; ${recordLabel} in shared registry`
    : `Installed plugin; ${recordLabel} in shared registry`;
}

// ---------------------------------------------------------------------------
// Infrastructure path guard
// ---------------------------------------------------------------------------

export function isPluginInfrastructurePath(candidatePath: string, sharedDir: string): boolean {
  for (const directoryName of PLUGIN_INFRASTRUCTURE_DIRECTORIES) {
    const resolvedInfrastructurePath = safeRealPath(path.join(sharedDir, directoryName));
    if (resolvedInfrastructurePath && isPathWithin(candidatePath, resolvedInfrastructurePath)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// JSON serialization
// ---------------------------------------------------------------------------

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'null';
}

// ---------------------------------------------------------------------------
// Item list builders
// ---------------------------------------------------------------------------

export function getPluginRegistryItems(sharedDir: string, allowedRoots: Set<string>): SharedItem[] {
  const registry = readPluginInstalledRegistry(sharedDir, allowedRoots);
  if (!registry) {
    return [];
  }
  return Object.entries(registry.plugins).map(([pluginName, metadata]) => ({
    name: pluginName,
    description: describeInstalledPlugin(pluginName, metadata),
    path: encodePluginRegistryPath(pluginName),
    type: 'plugin' as const,
  }));
}

export function getLegacyPluginDirectoryItems(
  sharedDir: string,
  allowedRoots: Set<string>
): SharedItem[] {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(sharedDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const items: SharedItem[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || PLUGIN_INFRASTRUCTURE_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(sharedDir, entry.name);
    const resolvedEntryPath = safeRealPath(entryPath);
    if (!resolvedEntryPath || !isPathWithinAny(resolvedEntryPath, allowedRoots)) {
      continue;
    }

    const description = readFirstMarkdownDescription(
      [
        path.join(resolvedEntryPath, 'README.md'),
        path.join(resolvedEntryPath, 'readme.md'),
        path.join(resolvedEntryPath, 'PLUGIN.md'),
      ],
      allowedRoots
    );

    if (!description) {
      continue;
    }

    items.push({ name: entry.name, description, path: entryPath, type: 'plugin' });
  }

  return items;
}

export function getPluginItems(sharedDir: string, allowedRoots: Set<string>): SharedItem[] {
  const registryItems = getPluginRegistryItems(sharedDir, allowedRoots);
  const legacyDirectoryItems = getLegacyPluginDirectoryItems(sharedDir, allowedRoots);
  const itemsByPath = new Map<string, SharedItem>();

  for (const item of [...registryItems, ...legacyDirectoryItems]) {
    itemsByPath.set(item.path, item);
  }

  return [...itemsByPath.values()].sort((a, b) => a.name.localeCompare(b.name));
}
