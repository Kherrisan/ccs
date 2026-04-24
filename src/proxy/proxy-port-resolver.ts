import { loadOrCreateUnifiedConfig } from '../config/unified-config-loader';
import {
  OPENAI_COMPAT_PROXY_ADAPTIVE_PORT_END,
  OPENAI_COMPAT_PROXY_ADAPTIVE_PORT_START,
  OPENAI_COMPAT_PROXY_LEGACY_DEFAULT_PORT,
} from './proxy-daemon-paths';

export interface OpenAICompatProxyPortPreference {
  port: number;
  source: 'adaptive' | 'profile' | 'shared';
}

const ADAPTIVE_PORT_RANGE_SIZE =
  OPENAI_COMPAT_PROXY_ADAPTIVE_PORT_END - OPENAI_COMPAT_PROXY_ADAPTIVE_PORT_START + 1;

function hashProfileName(profileName: string): number {
  let hash = 0;
  for (const char of profileName.trim()) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export function resolveOpenAICompatProxyAdaptivePort(profileName: string): number {
  return (
    OPENAI_COMPAT_PROXY_ADAPTIVE_PORT_START +
    (hashProfileName(profileName) % ADAPTIVE_PORT_RANGE_SIZE)
  );
}

export function listOpenAICompatProxyCandidatePorts(
  profileName: string,
  preferredPort: number,
  excludedPorts: ReadonlySet<number> = new Set()
): number[] {
  const candidates = new Set<number>();
  if (!excludedPorts.has(preferredPort)) {
    candidates.add(preferredPort);
  }

  const adaptiveStart = resolveOpenAICompatProxyAdaptivePort(profileName);
  for (let offset = 0; offset < ADAPTIVE_PORT_RANGE_SIZE; offset += 1) {
    const candidate =
      OPENAI_COMPAT_PROXY_ADAPTIVE_PORT_START +
      ((adaptiveStart - OPENAI_COMPAT_PROXY_ADAPTIVE_PORT_START + offset) %
        ADAPTIVE_PORT_RANGE_SIZE);
    if (!excludedPorts.has(candidate)) {
      candidates.add(candidate);
    }
  }

  return [...candidates];
}

export function resolveOpenAICompatProxyPortPreference(
  profileName: string
): OpenAICompatProxyPortPreference {
  const config = loadOrCreateUnifiedConfig();
  const profilePort = config.proxy?.profile_ports?.[profileName];
  if (typeof profilePort === 'number') {
    return { port: profilePort, source: 'profile' };
  }
  const sharedPort = config.proxy?.port;
  if (typeof sharedPort === 'number') {
    if (sharedPort === OPENAI_COMPAT_PROXY_LEGACY_DEFAULT_PORT) {
      return {
        port: resolveOpenAICompatProxyAdaptivePort(profileName),
        source: 'adaptive',
      };
    }
    return { port: sharedPort, source: 'shared' };
  }
  return {
    port: resolveOpenAICompatProxyAdaptivePort(profileName),
    source: 'adaptive',
  };
}

export function resolveOpenAICompatProxyPreferredPort(profileName: string): number {
  return resolveOpenAICompatProxyPortPreference(profileName).port;
}
