import { describe, expect, it } from 'bun:test';
import { resolveImageAnalysisRuntimeConnection } from '../../../../src/utils/hooks';

describe('resolveImageAnalysisRuntimeConnection', () => {
  it('returns a direct local runtime connection for local CLIProxy targets', () => {
    const connection = resolveImageAnalysisRuntimeConnection({
      proxyTarget: {
        host: '127.0.0.1',
        port: 8317,
        protocol: 'http',
        isRemote: false,
      },
    });

    expect(connection.baseUrl).toBe('http://127.0.0.1:8317');
    expect(connection.allowSelfSigned).toBe(false);
    expect(connection.proxyTarget.isRemote).toBe(false);
  });

  it('returns the remote runtime base URL and TLS flag for self-signed targets', () => {
    const connection = resolveImageAnalysisRuntimeConnection({
      proxyTarget: {
        host: 'remote.example.com',
        port: 9443,
        protocol: 'https',
        authToken: 'remote-token',
        allowSelfSigned: true,
        isRemote: true,
      },
    });

    expect(connection.baseUrl).toBe('https://remote.example.com:9443');
    expect(connection.apiKey).toBe('remote-token');
    expect(connection.allowSelfSigned).toBe(true);
    expect(connection.proxyTarget.isRemote).toBe(true);
  });

  it('prefers the local tunnel when one is active for a remote target', () => {
    const connection = resolveImageAnalysisRuntimeConnection({
      proxyTarget: {
        host: 'remote.example.com',
        port: 9443,
        protocol: 'https',
        authToken: 'remote-token',
        allowSelfSigned: true,
        isRemote: true,
      },
      tunnelPort: 9911,
    });

    expect(connection.baseUrl).toBe('http://127.0.0.1:9911');
    expect(connection.apiKey).toBe('remote-token');
    expect(connection.allowSelfSigned).toBe(false);
    expect(connection.proxyTarget).toMatchObject({
      host: '127.0.0.1',
      port: 9911,
      protocol: 'http',
      isRemote: false,
    });
  });
});
