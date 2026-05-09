/**
 * List Command Handler
 *
 * Lists all saved profiles from both legacy and unified config.
 */

import { ProfileMetadata } from '../../types';
import { initUI, header, color, dim, warn, table } from '../../utils/ui';
import { resolveAccountContextPolicy, formatAccountContextPolicy } from '../account-context';
import { resolveSharedResourcePolicy } from '../shared-resource-policy';
import { exitWithError } from '../../errors';
import { ExitCode } from '../../errors/exit-codes';
import {
  CommandContext,
  ListOutput,
  parseArgs,
  formatRelativeTime,
  rejectUnsupportedAuthOptions,
} from './types';

/**
 * Handle the list command
 */
export async function handleList(ctx: CommandContext, args: string[]): Promise<void> {
  await initUI();
  const parsed = parseArgs(args);
  const { verbose, json } = parsed;
  rejectUnsupportedAuthOptions(parsed, {
    usage: 'ccs auth list [--verbose] [--json]',
  });

  try {
    // Get profiles from both legacy (profiles.json) and unified config (config.yaml)
    const legacyProfiles = ctx.registry.getAllProfiles();
    const unifiedAccounts = ctx.registry.getAllAccountsUnified();

    // Merge profiles: unified config takes precedence
    const profiles: Record<string, ProfileMetadata> = { ...legacyProfiles };
    for (const [name, account] of Object.entries(unifiedAccounts)) {
      profiles[name] = {
        type: 'account',
        created: account.created,
        last_used: account.last_used,
        context_mode: account.context_mode,
        context_group: account.context_group,
        continuity_mode: account.continuity_mode,
        shared_resource_mode: account.shared_resource_mode,
        bare: account.bare,
      };
    }

    const defaultProfile = ctx.registry.getDefaultUnified() ?? ctx.registry.getDefaultProfile();
    const profileNames = Object.keys(profiles);

    // JSON output mode
    if (json) {
      const output: ListOutput = {
        version: ctx.version,
        profiles: profileNames.map((name) => {
          const profile = profiles[name];
          const contextPolicy = resolveAccountContextPolicy(profile);
          const resourcePolicy = resolveSharedResourcePolicy(profile);
          const isDefault = name === defaultProfile;
          const instancePath = ctx.instanceMgr.getInstancePath(name);

          return {
            name: name,
            type: profile.type || 'account',
            is_default: isDefault,
            created: profile.created,
            last_used: profile.last_used || null,
            context_mode: contextPolicy.mode,
            context_group: contextPolicy.group || null,
            continuity_mode: contextPolicy.mode === 'shared' ? contextPolicy.continuityMode : null,
            shared_resource_mode: resourcePolicy.mode,
            shared_resource_inferred: resourcePolicy.inferred,
            ...(resourcePolicy.profileLocal ? { bare: true } : {}),
            instance_path: instancePath,
          };
        }),
      };
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    // Human-readable output
    if (profileNames.length === 0) {
      console.log(warn('No account profiles found'));
      console.log('');
      console.log('To create your first profile:');
      console.log(`  ${color('ccs auth create <profile>', 'command')}`);
      console.log('');
      console.log('Example:');
      console.log(`  ${color('ccs auth create work', 'command')}`);
      console.log('');
      return;
    }

    console.log(header('Saved Account Profiles'));
    console.log('');

    // Sort by last_used (descending), then alphabetically
    const sorted = profileNames.sort((a, b) => {
      const aProfile = profiles[a];
      const bProfile = profiles[b];

      // Default first
      if (a === defaultProfile) return -1;
      if (b === defaultProfile) return 1;

      // Then by last_used
      if (aProfile.last_used && bProfile.last_used) {
        return new Date(bProfile.last_used).getTime() - new Date(aProfile.last_used).getTime();
      }
      if (aProfile.last_used) return -1;
      if (bProfile.last_used) return 1;

      // Then alphabetically
      return a.localeCompare(b);
    });

    // Build table rows
    const rows: string[][] = sorted.map((name) => {
      const profile = profiles[name];
      const isDefault = name === defaultProfile;
      const contextPolicy = resolveAccountContextPolicy(profile);
      const resourcePolicy = resolveSharedResourcePolicy(profile);

      // Status column
      const status = isDefault ? color('[OK] default', 'success') : color('[OK]', 'success');

      // Last used column
      let lastUsed = '-';
      if (profile.last_used) {
        lastUsed = formatRelativeTime(new Date(profile.last_used));
      }

      const row = [color(name, isDefault ? 'primary' : 'info'), profile.type || 'account', status];

      if (verbose) {
        row.push(lastUsed);
        row.push(formatAccountContextPolicy(contextPolicy));
        row.push(resourcePolicy.mode);
      }

      return row;
    });

    // Headers
    const headers = verbose
      ? ['Profile', 'Type', 'Status', 'Last Used', 'Context', 'Resources']
      : ['Profile', 'Type', 'Status'];

    // Print table
    console.log(
      table(rows, {
        head: headers,
        colWidths: verbose ? [15, 12, 15, 12, 34, 16] : [15, 12, 15],
      })
    );
    console.log('');
    console.log(dim(`Total: ${profileNames.length} profile(s)`));
    console.log('');
  } catch (error) {
    exitWithError(`Failed to list profiles: ${(error as Error).message}`, ExitCode.GENERAL_ERROR);
  }
}
