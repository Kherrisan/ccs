/**
 * Migrate Command
 *
 * CLI command to migrate from v1 (JSON) to v2 (YAML) config format.
 *
 * Usage:
 *   ccs migrate           - Run migration
 *   ccs migrate --dry-run - Preview migration without changes
 *   ccs migrate --rollback <path> - Restore from backup
 *   ccs migrate --list-backups    - List available backups
 */

import {
  migrate,
  rollback,
  needsMigration,
  getBackupDirectories,
} from '../config/migration-manager';

import { initUI, ok, fail, info, warn, infoBox, dim } from '../utils/ui';
import { hasUnifiedConfig } from '../config/config-loader-facade';

export async function handleMigrateCommand(args: string[]): Promise<void> {
  await initUI();

  // Handle --list-backups
  if (args.includes('--list-backups')) {
    listBackups();
    return;
  }

  // Handle --rollback
  if (args.includes('--rollback')) {
    const rollbackIndex = args.indexOf('--rollback');
    const backupPath = args[rollbackIndex + 1];

    if (!backupPath) {
      console.error(fail('Error: --rollback requires backup path'));
      console.log(info('Usage: ccs migrate --rollback <backup-path>'));
      console.log(info('Use --list-backups to see available backups'));
      process.exit(1);
    }

    await handleRollback(backupPath);
    return;
  }

  // Check if already migrated
  if (hasUnifiedConfig() && !needsMigration()) {
    console.log(info('Already using unified config format (config.yaml)'));
    return;
  }

  // Check if migration is needed
  if (!needsMigration()) {
    console.log(info('No migration needed - no legacy config found'));
    return;
  }

  // Handle --dry-run
  const dryRun = args.includes('--dry-run');

  if (dryRun) {
    console.log(info('Dry run - no changes will be made'));
    console.log('');
  }

  const result = await migrate(dryRun);

  if (result.success) {
    console.log('');
    if (dryRun) {
      console.log(infoBox('Dry run - migration preview (no changes made)'));
    } else {
      console.log(infoBox('Migrated to unified config (config.yaml)', 'SUCCESS'));
    }

    if (result.backupPath && !dryRun) {
      console.log(`  Backup: ${result.backupPath}`);
    }
    console.log(`  Items:  ${result.migratedFiles.length} migrated`);

    if (result.warnings.length > 0) {
      for (const warning of result.warnings) {
        console.log(warn(warning));
      }
    }

    if (dryRun) {
      console.log(dim('  Run without --dry-run to apply changes'));
    } else {
      console.log(`  Rollback: ccs migrate --rollback ${result.backupPath}`);
    }
    console.log('');
  } else {
    console.error(fail(`Migration failed: ${result.error}`));

    if (result.migratedFiles.length > 0) {
      console.log('');
      console.log('    Partially migrated:');
      result.migratedFiles.forEach((f) => console.log(`      - ${f}`));
    }

    process.exit(1);
  }
}

async function handleRollback(backupPath: string): Promise<void> {
  console.log(info(`Rolling back from: ${backupPath}`));
  console.log('');

  const success = await rollback(backupPath);

  if (success) {
    console.log(ok('Rollback complete'));
    console.log(info('Legacy config restored'));
  } else {
    console.error(fail('Rollback failed'));
    process.exit(1);
  }
}

function listBackups(): void {
  const backups = getBackupDirectories();

  if (backups.length === 0) {
    console.log(info('No backup directories found'));
    return;
  }

  console.log(info('Available backups (most recent first):'));
  console.log('');
  backups.forEach((backup, index) => {
    console.log(`    ${index + 1}. ${backup}`);
  });
  console.log('');
  console.log(info('To rollback: ccs migrate --rollback <backup-path>'));
}

/**
 * Print help for migrate command.
 */
export function printMigrateHelp(): void {
  console.log('Usage: ccs migrate [options]');
  console.log('');
  console.log('Migrate from legacy JSON config to unified YAML format.');
  console.log('');
  console.log('Options:');
  console.log('  --dry-run        Preview migration without making changes');
  console.log('  --rollback PATH  Restore from backup directory');
  console.log('  --list-backups   List available backup directories');
  console.log('  --help           Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  ccs migrate                      # Run migration');
  console.log('  ccs migrate --dry-run            # Preview changes');
  console.log('  ccs migrate --list-backups       # List backups');
  console.log('  ccs migrate --rollback ~/.ccs/backup-v1-2025-01-15');
}
