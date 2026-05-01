/**
 * CLIProxy OAuth Authentication Operations
 *
 * Handles:
 * - ccs cliproxy list
 * - OAuth status display
 * - Built-in profile authentication status
 */

import { getAllAuthStatus, getOAuthConfig } from '../../cliproxy/auth/auth-handler';
import { listVariants } from '../../cliproxy/services';
import { initUI, header, subheader, color, dim, ok, warn, table } from '../../utils/ui';

export async function handleList(): Promise<void> {
  await initUI();
  console.log(header('CLIProxy Profiles'));
  console.log('');

  // Built-in profiles
  console.log(subheader('Built-in Profiles'));
  const authStatuses = getAllAuthStatus();
  for (const status of authStatuses) {
    const oauthConfig = getOAuthConfig(status.provider);
    const icon = status.authenticated ? ok('') : warn('');
    const authLabel = status.authenticated
      ? color('authenticated', 'success')
      : dim('not authenticated');
    const lastAuthStr = status.lastAuth ? dim(` (${status.lastAuth.toLocaleDateString()})`) : '';
    console.log(
      `  ${icon} ${color(status.provider, 'command').padEnd(18)} ${oauthConfig.displayName.padEnd(16)} ${authLabel}${lastAuthStr}`
    );
  }
  console.log('');
  console.log(dim('  To authenticate: ccs <provider> --auth'));
  console.log(dim('  To logout:       ccs <provider> --logout'));
  console.log('');

  // Custom variants
  const variants = listVariants();
  const variantNames = Object.keys(variants);

  if (variantNames.length > 0) {
    console.log(subheader('Custom Variants'));
    const rows = variantNames.map((name) => {
      const variant = variants[name];
      const providerDisplay = variant.type === 'composite' ? 'composite' : variant.provider;
      const portStr = variant.port ? String(variant.port) : '-';
      return [name, providerDisplay, variant.target || 'claude', portStr, variant.settings || '-'];
    });
    console.log(
      table(rows, {
        head: ['Variant', 'Provider', 'Target', 'Port', 'Settings'],
        colWidths: [15, 12, 10, 8, 24],
      })
    );
    console.log('');
    console.log(dim(`Total: ${variantNames.length} custom variant(s)`));
    console.log('');
  }

  console.log(dim('To create a custom variant:'));
  console.log(`  ${color('ccs cliproxy create', 'command')}`);
  console.log('');
}
