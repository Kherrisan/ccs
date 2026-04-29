import { describe, expect, it } from 'bun:test';
import type { ProxyTarget } from '../../proxy/proxy-target-resolver';

async function loadRoutingHttpModule() {
  return import(
    `../routing-strategy-http?test=${Date.now()}-${Math.random()}`
  ) as Promise<typeof import('../routing-strategy-http')>;
}

describe('routing-strategy-http', () => {
  it('builds the local management URL for routing strategy reads', async () => {
    const { getCliproxyRoutingManagementUrl } = await loadRoutingHttpModule();
    const target: ProxyTarget = {
      host: '127.0.0.1',
      port: 8317,
      protocol: 'http',
      isRemote: false,
    };

    expect(getCliproxyRoutingManagementUrl(target)).toBe(
      'http://127.0.0.1:8317/v0/management/routing/strategy'
    );
  });

  it('builds the remote management URL for routing strategy writes', async () => {
    const { getCliproxyRoutingManagementUrl } = await loadRoutingHttpModule();
    const target: ProxyTarget = {
      host: 'proxy.example.com',
      port: 443,
      protocol: 'https',
      allowSelfSigned: true,
      isRemote: true,
    };

    expect(getCliproxyRoutingManagementUrl(target)).toBe(
      'https://proxy.example.com:443/v0/management/routing/strategy'
    );
  });
});
