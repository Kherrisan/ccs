/**
 * Shared Data Routes (Phase 07)
 *
 * API routes for commands, skills, agents, and plugins from ~/.ccs/shared/
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { getClaudeConfigDir } from '../utils/claude-config-path';
import { requireLocalAccessWhenAuthDisabled } from './middleware/auth-middleware';
import { getCcsDir } from '../config/config-loader-facade';

export const sharedRoutes = Router();

sharedRoutes.use((req: Request, res: Response, next) => {
  if (
    requireLocalAccessWhenAuthDisabled(
      req,
      res,
      'Shared-content endpoints require localhost access when dashboard auth is disabled.'
    )
  ) {
    next();
  }
});

const MAX_DIRECTORY_TRAVERSAL_DEPTH = 10;
const MAX_DESCRIPTION_LENGTH = 140;
const MAX_MARKDOWN_FILE_BYTES = 1024 * 1024; // 1 MiB
const MAX_CONTENT_FILE_BYTES = 2 * 1024 * 1024; // 2 MiB
const SHARED_ITEMS_CACHE_TTL_MS = 1000;
const PLUGIN_REGISTRY_PATH_PREFIX = 'plugin-registry:';
const PLUGIN_INFRASTRUCTURE_DIRECTORIES = new Set(['cache', 'data', 'marketplaces']);

type SharedCollectionType = 'commands' | 'skills' | 'agents' | 'plugins';
type SharedContentType = SharedCollectionType | 'settings';

interface SharedItem {
  name: string;
  description: string;
  path: string;
  type: 'command' | 'skill' | 'agent' | 'plugin';
}

interface SharedItemsCacheEntry {
  items: SharedItem[];
  sharedDir: string;
  expiresAt: number;
}

interface InstalledPluginRegistry {
  version?: number;
  plugins: Record<string, unknown>;
}

const sharedItemsCache = new Map<SharedCollectionType, SharedItemsCacheEntry>();

/**
 * GET /api/shared/commands
 */
sharedRoutes.get('/commands', (_req: Request, res: Response) => {
  const items = getSharedItems('commands');
  res.json({ items });
});

/**
 * GET /api/shared/skills
 */
sharedRoutes.get('/skills', (_req: Request, res: Response) => {
  const items = getSharedItems('skills');
  res.json({ items });
});

/**
 * GET /api/shared/agents
 */
sharedRoutes.get('/agents', (_req: Request, res: Response) => {
  const items = getSharedItems('agents');
  res.json({ items });
});

/**
 * GET /api/shared/plugins
 */
sharedRoutes.get('/plugins', (_req: Request, res: Response) => {
  const items = getSharedItems('plugins');
  res.json({ items });
});

/**
 * GET /api/shared/content?type=commands|skills|agents|plugins|settings&path=<item-path>
 */
sharedRoutes.get('/content', (req: Request, res: Response) => {
  const typeParam = req.query.type;
  const itemPathParam = req.query.path;

  if (!isSharedContentType(typeParam)) {
    res.status(400).json({ error: 'Invalid or missing type parameter' });
    return;
  }
  if (typeof itemPathParam !== 'string' || itemPathParam.trim().length === 0) {
    res.status(400).json({ error: 'Invalid or missing path parameter' });
    return;
  }

  const ccsDir = getCcsDir();
  const sharedDir =
    typeParam === 'settings' ? path.join(ccsDir, 'shared') : path.join(ccsDir, 'shared', typeParam);
  if (!fs.existsSync(sharedDir)) {
    res.status(404).json({ error: 'Shared directory not found' });
    return;
  }

  const sharedDirRoot = safeRealPath(sharedDir) ?? path.resolve(sharedDir);
  const allowedRoots =
    typeParam === 'settings'
      ? resolveSettingsAllowedRoots(ccsDir, sharedDirRoot)
      : resolveAllowedRoots(typeParam, ccsDir, sharedDirRoot);
  const contentResult = getSharedItemContent(typeParam, itemPathParam, allowedRoots, sharedDirRoot);

  if (!contentResult) {
    res.status(404).json({ error: 'Shared content not found' });
    return;
  }

  res.json(contentResult);
});

/**
 * GET /api/shared/summary
 */
sharedRoutes.get('/summary', (_req: Request, res: Response) => {
  const commands = getSharedItems('commands').length;
  const skills = getSharedItems('skills').length;
  const agents = getSharedItems('agents').length;
  const plugins = getSharedItems('plugins').length;

  const ccsDir = getCcsDir();
  const settingsPath = path.join(ccsDir, 'shared', 'settings.json');
  const sharedDirRoot = safeRealPath(path.join(ccsDir, 'shared'));
  const resolvedSettingsPath = safeRealPath(settingsPath);
  const settingsAllowedRoots = sharedDirRoot
    ? resolveSettingsAllowedRoots(ccsDir, sharedDirRoot)
    : new Set<string>();
  const hasSettings =
    Boolean(sharedDirRoot) &&
    Boolean(resolvedSettingsPath) &&
    isPathWithinAny(resolvedSettingsPath as string, settingsAllowedRoots);

  res.json({
    commands,
    skills,
    agents,
    plugins,
    settings: hasSettings,
    total: commands + skills + agents + plugins + (hasSettings ? 1 : 0),
    symlinkStatus: checkSymlinkStatus(),
  });
});

function isSharedCollectionType(value: unknown): value is SharedCollectionType {
  return value === 'commands' || value === 'skills' || value === 'agents' || value === 'plugins';
}

function isSharedContentType(value: unknown): value is SharedContentType {
  return isSharedCollectionType(value) || value === 'settings';
}

function resolveAllowedRoots(
  type: SharedCollectionType,
  ccsDir: string,
  sharedDirRoot: string
): Set<string> {
  if (type === 'commands' || type === 'plugins') {
    return new Set<string>([sharedDirRoot]);
  }

  return new Set<string>([
    sharedDirRoot,
    ...[
      path.join(getClaudeConfigDir(), type),
      path.join(ccsDir, '.claude', type),
      path.join(ccsDir, 'shared', type),
    ]
      .map((dirPath) => safeRealPath(dirPath))
      .filter((dirPath): dirPath is string => typeof dirPath === 'string'),
  ]);
}

function resolveSettingsAllowedRoots(ccsDir: string, sharedDirRoot: string): Set<string> {
  const claudeConfigDir = getClaudeConfigDir();
  return new Set<string>(
    [
      sharedDirRoot,
      safeRealPath(path.join(claudeConfigDir, 'settings.json')),
      safeRealPath(path.join(ccsDir, '.claude', 'settings.json')),
    ].filter((dirPath): dirPath is string => typeof dirPath === 'string')
  );
}

function getSharedItems(type: SharedCollectionType): SharedItem[] {
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

  const items: SharedItem[] = [];
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
    // Directory read failed
  }

  const sortedItems = items.sort((a, b) => a.name.localeCompare(b.name));
  sharedItemsCache.set(type, {
    items: sortedItems,
    sharedDir,
    expiresAt: now + SHARED_ITEMS_CACHE_TTL_MS,
  });
  return sortedItems;
}

function getPluginItems(sharedDir: string, allowedRoots: Set<string>): SharedItem[] {
  const registryItems = getPluginRegistryItems(sharedDir, allowedRoots);
  const legacyDirectoryItems = getLegacyPluginDirectoryItems(sharedDir, allowedRoots);
  const itemsByPath = new Map<string, SharedItem>();

  for (const item of [...registryItems, ...legacyDirectoryItems]) {
    itemsByPath.set(item.path, item);
  }

  return [...itemsByPath.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function getPluginRegistryItems(sharedDir: string, allowedRoots: Set<string>): SharedItem[] {
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

function getLegacyPluginDirectoryItems(sharedDir: string, allowedRoots: Set<string>): SharedItem[] {
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

    items.push({
      name: entry.name,
      description,
      path: entryPath,
      type: 'plugin',
    });
  }

  return items;
}

function getCommandItems(sharedDir: string, allowedRoots: Set<string>): SharedItem[] {
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

function getSkillOrAgentItem(
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

    return {
      name: entry.name,
      description,
      path: entryPath,
      type: 'skill',
    };
  }

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

    return {
      name: entry.name,
      description,
      path: entryPath,
      type: 'agent',
    };
  }

  if (!stats.isFile() || !entry.name.toLowerCase().endsWith('.md')) {
    return null;
  }

  const description = readMarkdownDescription(resolvedEntryPath, allowedRoots);
  if (!description) {
    return null;
  }

  return {
    name: entry.name.replace(/\.md$/i, ''),
    description,
    path: entryPath,
    type: 'agent',
  };
}

interface MarkdownFileEntry {
  displayPath: string;
  resolvedPath: string;
}

function collectMarkdownFiles(sharedDir: string, allowedRoots: Set<string>): MarkdownFileEntry[] {
  const directoriesToVisit: Array<{ path: string; depth: number }> = [
    { path: sharedDir, depth: 0 },
  ];
  const visitedDirectories = new Set<string>();
  const markdownFiles: MarkdownFileEntry[] = [];

  while (directoriesToVisit.length > 0) {
    const current = directoriesToVisit.pop();
    if (!current) {
      continue;
    }

    const currentDir = current.path;
    const resolvedCurrentDir = safeRealPath(currentDir);
    if (!resolvedCurrentDir || !isPathWithinAny(resolvedCurrentDir, allowedRoots)) {
      continue;
    }

    const normalizedDirPath = normalizeForPathComparison(resolvedCurrentDir);
    if (visitedDirectories.has(normalizedDirPath)) {
      continue;
    }
    visitedDirectories.add(normalizedDirPath);

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      const resolvedEntryPath = safeRealPath(entryPath);
      if (!resolvedEntryPath || !isPathWithinAny(resolvedEntryPath, allowedRoots)) {
        continue;
      }

      let stats: fs.Stats;
      try {
        stats = fs.statSync(resolvedEntryPath);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        if (current.depth < MAX_DIRECTORY_TRAVERSAL_DEPTH) {
          directoriesToVisit.push({ path: entryPath, depth: current.depth + 1 });
        }
        continue;
      }

      if (stats.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        markdownFiles.push({
          displayPath: entryPath,
          resolvedPath: resolvedEntryPath,
        });
      }
    }
  }

  return markdownFiles;
}

function extractDescription(content: string): string {
  const frontmatterDescription = extractFrontmatterDescription(content);
  if (frontmatterDescription) {
    return trimDescription(frontmatterDescription);
  }

  // Extract first non-empty, non-heading line from the markdown body.
  const lines = stripFrontmatter(content).split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (isDescriptionBodyLine(trimmed)) {
      return trimDescription(trimmed);
    }
  }

  return 'No description';
}

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

function readFirstMarkdownDescription(
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

function readMarkdownDescription(markdownPath: string, allowedRoots: Set<string>): string | null {
  try {
    const resolvedMarkdownPath = safeRealPath(markdownPath);
    if (!resolvedMarkdownPath || !isPathWithinAny(resolvedMarkdownPath, allowedRoots)) {
      return null;
    }

    const stats = fs.statSync(resolvedMarkdownPath);
    if (!stats.isFile()) {
      return null;
    }
    if (stats.size > MAX_MARKDOWN_FILE_BYTES) {
      return null;
    }
    const content = fs.readFileSync(resolvedMarkdownPath, 'utf8');
    return extractDescription(content);
  } catch {
    return null;
  }
}

function readMarkdownContent(markdownPath: string, allowedRoots: Set<string>): string | null {
  try {
    const resolvedMarkdownPath = safeRealPath(markdownPath);
    if (!resolvedMarkdownPath || !isPathWithinAny(resolvedMarkdownPath, allowedRoots)) {
      return null;
    }

    const stats = fs.statSync(resolvedMarkdownPath);
    if (!stats.isFile()) {
      return null;
    }
    if (stats.size > MAX_CONTENT_FILE_BYTES) {
      return null;
    }

    return fs.readFileSync(resolvedMarkdownPath, 'utf8');
  } catch {
    return null;
  }
}

function encodePluginRegistryPath(pluginName: string): string {
  return `${PLUGIN_REGISTRY_PATH_PREFIX}${encodeURIComponent(pluginName)}`;
}

function decodePluginRegistryPath(itemPath: string): string | null {
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

function readJsonObject(
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

function readPluginInstalledRegistry(
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

function describeInstalledPlugin(pluginName: string, metadata: unknown): string {
  const recordCount = Array.isArray(metadata) ? metadata.length : 1;
  const marketplace = extractMarketplaceFromPluginName(pluginName);
  const recordLabel = `${recordCount} ${recordCount === 1 ? 'record' : 'records'}`;

  return marketplace
    ? `Installed from ${marketplace}; ${recordLabel} in shared registry`
    : `Installed plugin; ${recordLabel} in shared registry`;
}

function extractMarketplaceFromPluginName(pluginName: string): string | null {
  const atIndex = pluginName.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === pluginName.length - 1) {
    return null;
  }

  return pluginName.slice(atIndex + 1);
}

function resolveReadableMarkdownPath(
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

function getSharedItemContent(
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

  return {
    content,
    contentPath: markdownPath,
  };
}

function isPluginInfrastructurePath(candidatePath: string, sharedDir: string): boolean {
  for (const directoryName of PLUGIN_INFRASTRUCTURE_DIRECTORIES) {
    const resolvedInfrastructurePath = safeRealPath(path.join(sharedDir, directoryName));
    if (resolvedInfrastructurePath && isPathWithin(candidatePath, resolvedInfrastructurePath)) {
      return true;
    }
  }

  return false;
}

function getPluginRegistryContent(
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

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'null';
}

function safeRealPath(targetPath: string): string | null {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return null;
  }
}

function getSharedSettingsContent(
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
    return content
      ? {
          content,
          contentPath: resolvedSettingsPath,
        }
      : null;
  }
}

function isPathWithin(candidatePath: string, basePath: string): boolean {
  const normalizedCandidate = normalizeForPathComparison(candidatePath);
  const normalizedBase = normalizeForPathComparison(basePath);
  const relative = path.relative(normalizedBase, normalizedCandidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isPathWithinAny(candidatePath: string, basePaths: Set<string>): boolean {
  for (const basePath of basePaths) {
    if (isPathWithin(candidatePath, basePath)) {
      return true;
    }
  }
  return false;
}

function normalizeForPathComparison(targetPath: string): string {
  const normalized = path.resolve(targetPath);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function checkSymlinkStatus(): { valid: boolean; message: string } {
  const ccsDir = getCcsDir();
  const sharedDir = path.join(ccsDir, 'shared');

  if (!fs.existsSync(sharedDir)) {
    return { valid: false, message: 'Shared directory not found' };
  }

  // Check all three symlinks: commands, skills, agents
  const linkTypes = ['commands', 'skills', 'agents'];
  let validLinks = 0;

  for (const linkType of linkTypes) {
    const linkPath = path.join(sharedDir, linkType);

    try {
      if (fs.existsSync(linkPath)) {
        const stats = fs.lstatSync(linkPath);
        if (stats.isSymbolicLink()) {
          const target = fs.readlinkSync(linkPath);
          // Check if it points to Claude config dir.
          const expectedTarget = path.join(getClaudeConfigDir(), linkType);
          if (path.resolve(path.dirname(linkPath), target) === path.resolve(expectedTarget)) {
            validLinks++;
          }
        }
      }
    } catch {
      // Not a symlink or read error
    }
  }

  if (validLinks === linkTypes.length) {
    return { valid: true, message: 'Symlinks active' };
  } else if (validLinks > 0) {
    return {
      valid: false,
      message: `Symlinks partially configured (${validLinks}/${linkTypes.length})`,
    };
  }

  return { valid: false, message: 'Symlinks not configured' };
}
