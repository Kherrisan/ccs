import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';
import type { Server } from 'http';
import profileRoutes from '../../../src/web-server/routes/profile-routes';

describe('profile-routes local runtime readiness', () => {
  let server: Server;
  let baseUrl = '';
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/profiles', profileRoutes);

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1');
      const onError = (error: Error) => reject(error);
      server.once('error', onError);
      server.once('listening', () => {
        server.off('error', onError);
        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve test server port');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith(baseUrl)) {
        return originalFetch(input);
      }

      if (url.includes('11434/api/tags')) {
        return new Response(
          JSON.stringify({
            models: [{ name: 'gemma4:e4b' }, { name: 'qwen3-coder:latest' }],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (url.includes('8080/v1/models')) {
        return new Response(
          JSON.stringify({
            data: [{ id: 'Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf' }],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('reports local runtimes as ready when their endpoints respond with models', async () => {
    const response = await fetch(`${baseUrl}/api/profiles/local-runtime-readiness`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      runtimes: Array<{
        id: string;
        status: string;
        recommendedModelInstalled: boolean;
      }>;
    };

    expect(body.runtimes).toHaveLength(2);
    expect(body.runtimes).toContainEqual(
      expect.objectContaining({
        id: 'ollama',
        status: 'ready',
        recommendedModelInstalled: true,
      })
    );
    expect(body.runtimes).toContainEqual(
      expect.objectContaining({
        id: 'llamacpp',
        status: 'ready',
      })
    );
  });

  it('reports setup guidance when local endpoints are unavailable', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) {
        return originalFetch(input);
      }
      throw new Error('connect ECONNREFUSED');
    }) as typeof fetch;

    const response = await fetch(`${baseUrl}/api/profiles/local-runtime-readiness`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      runtimes: Array<{
        id: string;
        status: string;
        commandHint: string;
      }>;
    };

    expect(body.runtimes).toContainEqual(
      expect.objectContaining({
        id: 'ollama',
        status: 'offline',
        commandHint: 'ollama serve',
      })
    );
    expect(body.runtimes).toContainEqual(
      expect.objectContaining({
        id: 'llamacpp',
        status: 'offline',
        commandHint: './server --host 0.0.0.0 --port 8080 -m model.gguf',
      })
    );
  });
});
