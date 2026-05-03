import { CLIPROXY_DEFAULT_PORT, validatePort } from '../../cliproxy/config/port-manager';

import type { UnifiedConfig } from '../../config/unified-config-types';
import { loadOrCreateUnifiedConfig } from '../../config/config-loader-facade';

type LifecyclePortConfig = Pick<UnifiedConfig, 'cliproxy_server'>;

/**
 * Resolve the local CLIProxy lifecycle port from unified config.
 * Falls back to default port when unset/invalid.
 */
export function resolveLifecyclePort(
  config: LifecyclePortConfig = loadOrCreateUnifiedConfig()
): number {
  return validatePort(config.cliproxy_server?.local?.port ?? CLIPROXY_DEFAULT_PORT);
}
