/**
 * Port validation and management utilities
 * Handles port number validation and default port resolution
 */

import { loadOrCreateUnifiedConfig } from '../../config/unified-config-loader';
import type { UnifiedConfig } from '../../config/unified-config-types';

/** Default CLIProxy port */
export const CLIPROXY_DEFAULT_PORT = 8317;

/**
 * Validate port is a valid positive integer (1-65535).
 * Returns default port if invalid.
 *
 * @param port - Port number to validate
 * @returns Valid port or CLIPROXY_DEFAULT_PORT (8317) if invalid
 */
export function validatePort(port: number | undefined): number {
  if (port === undefined || port === null) {
    return CLIPROXY_DEFAULT_PORT;
  }
  if (!Number.isFinite(port) || port < 1 || port > 65535 || !Number.isInteger(port)) {
    return CLIPROXY_DEFAULT_PORT;
  }
  return port;
}

/**
 * Validate and sanitize port number for remote connections.
 * Returns undefined for invalid ports (letting caller use default).
 * Valid range: 1-65535, must be integer.
 */
export function validateRemotePort(port: number | undefined): number | undefined {
  if (port === undefined || port === null) return undefined;
  if (typeof port !== 'number' || !Number.isInteger(port)) return undefined;
  if (port <= 0 || port > 65535) return undefined;
  return port;
}

/**
 * Get default port for remote CLIProxyAPI based on protocol.
 * - HTTP: 8317 (CLIProxyAPI default)
 * - HTTPS: 443 (standard SSL port)
 */
export function getRemoteDefaultPort(protocol: 'http' | 'https'): number {
  return protocol === 'https' ? 443 : CLIPROXY_DEFAULT_PORT;
}

/**
 * Normalize protocol to lowercase and validate.
 * Handles runtime case sensitivity (e.g., 'HTTPS' → 'https').
 * Defaults to 'http' for invalid values.
 */
export function normalizeProtocol(protocol: string | undefined): 'http' | 'https' {
  if (!protocol) return 'http';
  const normalized = protocol.toLowerCase();
  if (normalized === 'https') return 'https';
  if (normalized === 'http') return 'http';
  // Invalid protocol (e.g., 'ftp') - default to http
  return 'http';
}

/**
 * Resolve the local CLIProxy lifecycle port from unified config.
 * Falls back to default port when unset, invalid, or unreadable.
 */
export function resolveLifecyclePort(
  config?: Pick<UnifiedConfig, 'cliproxy_server'>,
  loadConfig: () => Pick<UnifiedConfig, 'cliproxy_server'> = loadOrCreateUnifiedConfig
): number {
  if (config) {
    return validatePort(config.cliproxy_server?.local?.port ?? CLIPROXY_DEFAULT_PORT);
  }

  try {
    const loadedConfig = loadConfig();
    return validatePort(loadedConfig.cliproxy_server?.local?.port ?? CLIPROXY_DEFAULT_PORT);
  } catch {
    return CLIPROXY_DEFAULT_PORT;
  }
}
