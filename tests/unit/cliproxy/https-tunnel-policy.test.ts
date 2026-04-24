import { describe, expect, it } from 'bun:test';
import { shouldStartHttpsTunnel } from '../../../src/cliproxy/executor/https-tunnel-policy';

describe('HTTPS tunnel startup policy', () => {
  it('skips the tunnel for single-provider Codex remote HTTPS launches', () => {
    expect(
      shouldStartHttpsTunnel({
        provider: 'codex',
        useRemoteProxy: true,
        protocol: 'https',
        host: 'remote.example.test',
      })
    ).toBe(false);
  });

  it('keeps the tunnel for non-Codex remote HTTPS launches', () => {
    expect(
      shouldStartHttpsTunnel({
        provider: 'gemini',
        useRemoteProxy: true,
        protocol: 'https',
        host: 'remote.example.test',
      })
    ).toBe(true);
  });

  it('keeps the tunnel for composite HTTPS launches', () => {
    expect(
      shouldStartHttpsTunnel({
        provider: 'codex',
        useRemoteProxy: true,
        protocol: 'https',
        host: 'remote.example.test',
        isComposite: true,
      })
    ).toBe(true);
  });

  it('does not start a tunnel without a remote HTTPS target', () => {
    expect(
      shouldStartHttpsTunnel({
        provider: 'codex',
        useRemoteProxy: true,
        protocol: 'http',
        host: 'remote.example.test',
      })
    ).toBe(false);
    expect(
      shouldStartHttpsTunnel({
        provider: 'codex',
        useRemoteProxy: false,
        protocol: 'https',
        host: 'remote.example.test',
      })
    ).toBe(false);
  });
});
