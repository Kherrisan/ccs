/**
 * Install/Uninstall Command Handlers
 *
 * Handle --install and --uninstall commands for CCS.
 */

import { info, ok, color, box, initUI } from '../utils/ui';
import { uninstallWebSearchHook, uninstallWebSearchMcp } from '../utils/websearch';
import { ClaudeSymlinkManager } from '../utils/claude-symlink-manager';

/**
 * Handle install command
 */
export async function handleInstallCommand(): Promise<void> {
  await initUI();
  console.log('');
  console.log(info('Feature not available'));
  console.log('');
  console.log('The --install flag is currently under development.');
  console.log('.claude/ integration testing is not complete.');
  console.log('');
  console.log(`For updates: ${color('https://github.com/kaitranntt/ccs/issues', 'path')}`);
  console.log('');
  process.exit(0);
}

/**
 * Handle uninstall command
 */
export async function handleUninstallCommand(): Promise<void> {
  await initUI();
  console.log('');
  console.log(box('Uninstalling CCS', { borderColor: 'cyan' }));
  console.log('');

  let removed = 0;

  // 1. Remove WebSearch hook file + migration marker (does NOT touch global settings.json)
  const hookRemoved = uninstallWebSearchHook();
  if (hookRemoved) {
    console.log(ok('Removed WebSearch hook'));
    removed += 1; // Count as 1 item (the hook file)
  }

  // 2. Remove managed WebSearch MCP runtime/config
  const mcpRemoved = uninstallWebSearchMcp();
  if (mcpRemoved) {
    console.log(ok('Removed WebSearch MCP runtime'));
    removed += 1;
  }

  // 3. Remove symlinks from ~/.claude/
  const symlinkManager = new ClaudeSymlinkManager();
  const symlinksRemoved = symlinkManager.uninstall();
  removed += symlinksRemoved; // Add actual count of symlinks removed

  // 4. Summary
  console.log('');
  if (removed > 0) {
    console.log(ok('Uninstall complete!'));
    console.log('');
    console.log(info('~/.ccs/ directory preserved'));
    console.log(info('To reinstall: ccs --install'));
  } else {
    console.log(info('Nothing to uninstall'));
  }
  console.log('');

  process.exit(0);
}
