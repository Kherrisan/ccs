/**
 * Shared Routes — Markdown directory walker
 *
 * Iterative BFS/DFS over a shared directory collecting all .md files
 * within allowed roots and the configured traversal depth limit.
 */

import * as fs from 'fs';
import * as path from 'path';

import { safeRealPath, isPathWithinAny } from './shared-routes-path-guards';

const MAX_DIRECTORY_TRAVERSAL_DEPTH = 10;

export interface MarkdownFileEntry {
  displayPath: string;
  resolvedPath: string;
}

export function collectMarkdownFiles(
  sharedDir: string,
  allowedRoots: Set<string>
): MarkdownFileEntry[] {
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

    const normalizedDirPath =
      process.platform === 'win32'
        ? path.resolve(resolvedCurrentDir).toLowerCase()
        : path.resolve(resolvedCurrentDir);

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
