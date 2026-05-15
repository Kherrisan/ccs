import type { CLIProxyProvider } from '../types';

interface HttpsTunnelPolicyInput {
  provider: CLIProxyProvider;
  useRemoteProxy: boolean;
  protocol?: 'http' | 'https';
  host?: string;
  isComposite?: boolean;
}

/**
 * Claude only needs the HTTPS tunnel when it would otherwise talk directly to a
 * remote HTTPS CLIProxy. Single-provider Codex launches already route Claude
 * through local HTTP proxy layers, so those layers can connect upstream via
 * HTTPS without adding another local tunnel.
 */
export function shouldStartHttpsTunnel({
  provider,
  useRemoteProxy,
  protocol,
  host,
  isComposite,
}: HttpsTunnelPolicyInput): boolean {
  if (!useRemoteProxy || protocol !== 'https' || !host) {
    return false;
  }

  if (provider === 'codex' && !isComposite) {
    return false;
  }

  return true;
}
