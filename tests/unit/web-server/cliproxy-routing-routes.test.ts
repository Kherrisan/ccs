import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import express from 'express';
import type { Server } from 'http';

describe('cliproxy routing routes', () => {
  let server: Server;
  let baseUrl = '';
  let readStateMock: ReturnType<typeof mock>;
  let applyStrategyMock: ReturnType<typeof mock>;

  beforeEach(async () => {
    readStateMock = mock(async () => ({
      strategy: 'round-robin',
      source: 'live',
      target: 'local',
      reachable: true,
    }));
    applyStrategyMock = mock(async () => ({
      strategy: 'fill-first',
      source: 'live',
      target: 'local',
      reachable: true,
      applied: 'live-and-config',
    }));

    mock.module('../../../src/cliproxy/routing-strategy', () => ({
      readCliproxyRoutingState: readStateMock,
      applyCliproxyRoutingStrategy: applyStrategyMock,
      normalizeCliproxyRoutingStrategy: (value: unknown) => {
        if (value === 'round-robin' || value === 'fill-first') {
          return value;
        }
        return null;
      },
    }));

    const { default: routingRoutes } = await import(
      `../../../src/web-server/routes/cliproxy-routing-routes?test=${Date.now()}-${Math.random()}`
    );

    const app = express();
    app.use(express.json());
    app.use('/api/cliproxy', routingRoutes);

    server = await new Promise<Server>((resolve, reject) => {
      const instance = app.listen(0, '127.0.0.1');
      instance.once('error', reject);
      instance.once('listening', () => resolve(instance));
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve test server port');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    mock.restore();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('returns the current routing state', async () => {
    const response = await fetch(`${baseUrl}/api/cliproxy/routing/strategy`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      strategy: 'round-robin',
      source: 'live',
      target: 'local',
      reachable: true,
    });
    expect(readStateMock).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid routing values', async () => {
    const response = await fetch(`${baseUrl}/api/cliproxy/routing/strategy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'auto' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid strategy. Use: round-robin or fill-first',
    });
    expect(applyStrategyMock).not.toHaveBeenCalled();
  });

  it('applies a valid routing strategy', async () => {
    const response = await fetch(`${baseUrl}/api/cliproxy/routing/strategy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'fill-first' }),
    });

    expect(response.status).toBe(200);
    expect(applyStrategyMock).toHaveBeenCalledWith('fill-first');
    expect(await response.json()).toEqual({
      strategy: 'fill-first',
      source: 'live',
      target: 'local',
      reachable: true,
      applied: 'live-and-config',
    });
  });
});
