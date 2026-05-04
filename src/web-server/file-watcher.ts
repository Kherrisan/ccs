/**
 * File Watcher (Phase 04)
 *
 * Watches ~/.ccs/ directory for config file changes using chokidar.
 * Broadcasts changes to WebSocket clients for real-time sync.
 */

import chokidar, { FSWatcher } from 'chokidar';
import * as path from 'path';
import { getCcsDir } from '../config/config-loader-facade';

export interface FileChangeEvent {
  type: 'config-changed' | 'settings-changed' | 'profiles-changed' | 'proxy-status-changed';
  path: string;
  timestamp: number;
}

export type FileChangeCallback = (event: FileChangeEvent) => void;

export function createFileWatcher(onChange: FileChangeCallback): FSWatcher {
  const ccsDir = getCcsDir();

  const watcher = chokidar.watch(
    [
      path.join(ccsDir, 'config.json'), // Legacy config
      path.join(ccsDir, 'config.yaml'), // Unified config
      path.join(ccsDir, '*.settings.json'),
      path.join(ccsDir, 'profiles.json'),
      path.join(ccsDir, 'cliproxy', 'sessions.json'), // Proxy session tracking
    ],
    {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    }
  );

  watcher.on('change', (filePath) => {
    const basename = path.basename(filePath);
    let type: FileChangeEvent['type'];

    if (basename === 'config.json' || basename === 'config.yaml') {
      type = 'config-changed';
    } else if (basename === 'profiles.json') {
      type = 'profiles-changed';
    } else if (basename === 'sessions.json') {
      type = 'proxy-status-changed';
    } else {
      type = 'settings-changed';
    }

    onChange({
      type,
      path: filePath,
      timestamp: Date.now(),
    });
  });

  watcher.on('add', (filePath) => {
    onChange({
      type: 'config-changed',
      path: filePath,
      timestamp: Date.now(),
    });
  });

  watcher.on('unlink', (filePath) => {
    onChange({
      type: 'config-changed',
      path: filePath,
      timestamp: Date.now(),
    });
  });

  return watcher;
}
