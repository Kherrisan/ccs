/**
 * Shared Routes — Plugin registry content renderer
 *
 * Renders the markdown content for an installed plugin entry,
 * pulling from installed_plugins.json, known_marketplaces.json,
 * and blocklist.json within the allowed roots.
 */

import * as path from 'path';

import { safeRealPath, isPathWithinAny } from './shared-routes-path-guards';
import {
  readJsonObject,
  readPluginInstalledRegistry,
  decodePluginRegistryPath,
  extractMarketplaceFromPluginName,
  stringifyJson,
} from './shared-routes-plugins';

function findPluginBlocklistEntry(
  sharedDir: string,
  allowedRoots: Set<string>,
  pluginName: string
): unknown | null {
  const blocklist = readJsonObject(path.join(sharedDir, 'blocklist.json'), allowedRoots);
  const plugins = blocklist?.plugins;
  if (!Array.isArray(plugins)) {
    return null;
  }
  return (
    plugins.find(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        'plugin' in entry &&
        (entry as { plugin?: unknown }).plugin === pluginName
    ) ?? null
  );
}

export function getPluginRegistryContent(
  itemPath: string,
  sharedDir: string,
  allowedRoots: Set<string>
): { content: string; contentPath: string } | null {
  const pluginName = decodePluginRegistryPath(itemPath);
  if (!pluginName) {
    return null;
  }

  const registryPath = path.join(sharedDir, 'installed_plugins.json');
  const resolvedRegistryPath = safeRealPath(registryPath);
  if (!resolvedRegistryPath || !isPathWithinAny(resolvedRegistryPath, allowedRoots)) {
    return null;
  }

  const registry = readPluginInstalledRegistry(sharedDir, allowedRoots);
  if (!registry || !Object.prototype.hasOwnProperty.call(registry.plugins, pluginName)) {
    return null;
  }

  const metadata = registry.plugins[pluginName];
  const marketplace = extractMarketplaceFromPluginName(pluginName);
  const marketplaceEntry = marketplace
    ? readJsonObject(path.join(sharedDir, 'known_marketplaces.json'), allowedRoots)?.[marketplace]
    : null;
  const blocklistEntry = findPluginBlocklistEntry(sharedDir, allowedRoots, pluginName);

  const lines = [
    `# ${pluginName}`,
    '',
    `Registry: \`${resolvedRegistryPath}\``,
    '',
    '## Installed Plugin',
    '',
    `- Source: shared \`installed_plugins.json\` registry`,
    `- Registry version: ${registry.version ?? 'unknown'}`,
    `- Marketplace: ${marketplace ?? 'not recorded in plugin name'}`,
    `- Install records: ${Array.isArray(metadata) ? metadata.length : 1}`,
  ];

  if (marketplaceEntry) {
    lines.push(
      '',
      '## Marketplace Registry Entry',
      '',
      '```json',
      stringifyJson(marketplaceEntry),
      '```'
    );
  }

  if (blocklistEntry) {
    lines.push('', '## Blocklist Notice', '', '```json', stringifyJson(blocklistEntry), '```');
  }

  lines.push('', '## Plugin Registry Entry', '', '```json', stringifyJson(metadata), '```');

  return {
    content: lines.join('\n'),
    contentPath: resolvedRegistryPath,
  };
}
