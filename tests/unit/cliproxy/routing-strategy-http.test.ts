import { afterEach, describe, expect, it, mock } from 'bun:test';
import { fetchCliproxyRoutingResponse } from '../../../src/cliproxy/routing-strategy-http';
import type { ProxyTarget } from '../../../src/cliproxy/proxy-target-resolver';

describe('routing-strategy-http', () => {
  const target: ProxyTarget = {
    host: '127.0.0.1',
    port: 8317,
    protocol: 'http',
    isRemote: false,
  };

  afterEach(() => {
    mock.restore();
  });

  it('reads the routing strategy from the management endpoint', async () => {
    const originalFetch = global.fetch;
    const fetchMock = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ strategy: 'round-robin' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    global.fetch = fetchMock as typeof global.fetch;

    await fetchCliproxyRoutingResponse(target, 'GET');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8317/v0/management/routing/strategy',
      expect.objectContaining({
        method: 'GET',
      })
    );

    global.fetch = originalFetch;
  });

  it('writes the routing strategy to the management endpoint', async () => {
    const originalFetch = global.fetch;
    const fetchMock = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    global.fetch = fetchMock as typeof global.fetch;

    await fetchCliproxyRoutingResponse(target, 'PUT', { value: 'fill-first' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8317/v0/management/routing/strategy',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ value: 'fill-first' }),
      })
    );

    global.fetch = originalFetch;
  });
});
