import { regenerateConfig } from '../config/generator';
import { getAuthDir, getConfigPathForPort } from '../config/path-resolver';
import {
  fetchCliproxyRoutingResponse,
  getCliproxyRoutingTarget,
  getRoutingErrorMessage,
} from './routing-strategy-http';
import type { CliproxyRoutingStrategy } from '../types';
import { loadOrCreateUnifiedConfig, mutateConfig } from '../../config/config-loader-facade';

export const DEFAULT_CLIPROXY_ROUTING_STRATEGY: CliproxyRoutingStrategy = 'round-robin';
export const DEFAULT_CLIPROXY_SESSION_AFFINITY_ENABLED = false;
export const DEFAULT_CLIPROXY_SESSION_AFFINITY_TTL = '1h';

const GO_DURATION_SEGMENT = String.raw`(?:\d+(?:\.\d+)?(?:ns|us|µs|μs|ms|s|m|h))`;
const GO_DURATION_PATTERN = new RegExp(`^${GO_DURATION_SEGMENT}+$`);

export interface CliproxyRoutingState {
  strategy: CliproxyRoutingStrategy;
  source: 'live' | 'config';
  target: 'local' | 'remote';
  reachable: boolean;
  message?: string;
}

export interface CliproxyRoutingApplyResult extends CliproxyRoutingState {
  applied: 'live' | 'live-and-config' | 'config-only';
}

export interface CliproxySessionAffinitySettings {
  enabled: boolean;
  ttl?: string;
}

export interface CliproxySessionAffinityState {
  enabled?: boolean;
  ttl?: string;
  source: 'config' | 'unsupported';
  target: 'local' | 'remote';
  reachable: boolean;
  manageable: boolean;
  message?: string;
}

export interface CliproxySessionAffinityApplyResult extends CliproxySessionAffinityState {
  applied: 'config-only' | 'unsupported';
}

export function normalizeCliproxyRoutingStrategy(value: unknown): CliproxyRoutingStrategy | null {
  if (typeof value !== 'string') {
    return null;
  }

  switch (value.trim().toLowerCase()) {
    case 'round-robin':
    case 'roundrobin':
    case 'rr':
      return 'round-robin';
    case 'fill-first':
    case 'fillfirst':
    case 'ff':
      return 'fill-first';
    default:
      return null;
  }
}

export function normalizeCliproxySessionAffinityEnabled(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }

  switch (value.trim().toLowerCase()) {
    case 'true':
    case '1':
    case 'yes':
    case 'on':
    case 'enable':
    case 'enabled':
      return true;
    case 'false':
    case '0':
    case 'no':
    case 'off':
    case 'disable':
    case 'disabled':
      return false;
    default:
      return null;
  }
}

export function normalizeCliproxySessionAffinityTtl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || !GO_DURATION_PATTERN.test(trimmed) || !hasPositiveDuration(trimmed)) {
    return null;
  }

  return trimmed;
}

export function getConfiguredCliproxyRoutingStrategy(): CliproxyRoutingStrategy {
  return (
    normalizeCliproxyRoutingStrategy(loadOrCreateUnifiedConfig().cliproxy?.routing?.strategy) ??
    DEFAULT_CLIPROXY_ROUTING_STRATEGY
  );
}

export function getConfiguredCliproxySessionAffinitySettings(): Required<CliproxySessionAffinitySettings> {
  const routing = loadOrCreateUnifiedConfig().cliproxy?.routing;
  return {
    enabled:
      normalizeCliproxySessionAffinityEnabled(routing?.session_affinity) ??
      DEFAULT_CLIPROXY_SESSION_AFFINITY_ENABLED,
    ttl:
      normalizeCliproxySessionAffinityTtl(routing?.session_affinity_ttl) ??
      DEFAULT_CLIPROXY_SESSION_AFFINITY_TTL,
  };
}

export async function fetchLiveCliproxyRoutingStrategy(): Promise<CliproxyRoutingStrategy> {
  const response = await fetchCliproxyRoutingResponse(getCliproxyRoutingTarget(), 'GET');
  if (!response.ok) {
    throw new Error(
      await getRoutingErrorMessage(response, `Failed to read routing strategy (${response.status})`)
    );
  }

  const data = (await response.json()) as { strategy?: string };
  const strategy = normalizeCliproxyRoutingStrategy(data?.strategy);
  if (!strategy) {
    throw new Error('CLIProxy returned an invalid routing strategy');
  }

  return strategy;
}

export async function readCliproxyRoutingState(): Promise<CliproxyRoutingState> {
  const target = getCliproxyRoutingTarget();

  if (target.isRemote) {
    return {
      strategy: await fetchLiveCliproxyRoutingStrategy(),
      source: 'live',
      target: 'remote',
      reachable: true,
    };
  }

  try {
    return {
      strategy: await fetchLiveCliproxyRoutingStrategy(),
      source: 'live',
      target: 'local',
      reachable: true,
    };
  } catch {
    return {
      strategy: getConfiguredCliproxyRoutingStrategy(),
      source: 'config',
      target: 'local',
      reachable: false,
      message: 'Local CLIProxy is not reachable. Showing the saved startup default.',
    };
  }
}

export async function readCliproxySessionAffinityState(): Promise<CliproxySessionAffinityState> {
  const target = getCliproxyRoutingTarget();

  if (target.isRemote) {
    const reachable = await isLiveCliproxyRoutingReachable();
    return {
      source: 'unsupported',
      target: 'remote',
      reachable,
      manageable: false,
      message: reachable
        ? 'Remote session-affinity management is not supported from CCS yet because upstream management APIs only expose routing.strategy.'
        : 'Remote session-affinity management is not supported from CCS yet, and the remote CLIProxy routing endpoint is not reachable.',
    };
  }

  const settings = getConfiguredCliproxySessionAffinitySettings();
  const reachable = await isLiveCliproxyRoutingReachable();

  return {
    enabled: settings.enabled,
    ttl: settings.ttl,
    source: 'config',
    target: 'local',
    reachable,
    manageable: true,
    message: reachable
      ? 'Showing the saved local session-affinity setting. Running local CLIProxy may hot-reload config changes, but CCS does not verify live selector state.'
      : 'Local CLIProxy is not reachable. Showing the saved local startup default.',
  };
}

export async function applyCliproxyRoutingStrategy(
  strategy: CliproxyRoutingStrategy
): Promise<CliproxyRoutingApplyResult> {
  const target = getCliproxyRoutingTarget();
  const configPath = getConfigPathForPort(target.port);
  const authDir = getAuthDir();

  if (target.isRemote) {
    await updateLiveCliproxyRoutingStrategy(strategy);
    return {
      strategy,
      source: 'live',
      target: 'remote',
      reachable: true,
      applied: 'live',
      message: 'Updated remote CLIProxy routing strategy.',
    };
  }

  mutateConfig((config) => {
    if (config.cliproxy) {
      config.cliproxy.routing = { ...config.cliproxy.routing, strategy };
    }
  });
  regenerateConfig(target.port, { configPath, authDir });

  try {
    await updateLiveCliproxyRoutingStrategy(strategy);
    return {
      strategy,
      source: 'live',
      target: 'local',
      reachable: true,
      applied: 'live-and-config',
      message: 'Updated the running proxy and saved the local startup default.',
    };
  } catch {
    return {
      strategy,
      source: 'config',
      target: 'local',
      reachable: false,
      applied: 'config-only',
      message: 'Saved the local startup default. It will apply the next time CLIProxy starts.',
    };
  }
}

export async function applyCliproxySessionAffinitySettings(
  settings: CliproxySessionAffinitySettings
): Promise<CliproxySessionAffinityApplyResult> {
  const target = getCliproxyRoutingTarget();
  if (target.isRemote) {
    const reachable = await isLiveCliproxyRoutingReachable();
    return {
      source: 'unsupported',
      target: 'remote',
      reachable,
      manageable: false,
      applied: 'unsupported',
      message: reachable
        ? 'Remote session-affinity management is not supported from CCS yet because upstream management APIs only expose routing.strategy.'
        : 'Remote session-affinity management is not supported from CCS yet, and the remote CLIProxy routing endpoint is not reachable.',
    };
  }

  const configPath = getConfigPathForPort(target.port);
  const authDir = getAuthDir();
  const current = getConfiguredCliproxySessionAffinitySettings();
  const ttl =
    normalizeCliproxySessionAffinityTtl(settings.ttl) ??
    current.ttl ??
    DEFAULT_CLIPROXY_SESSION_AFFINITY_TTL;

  mutateConfig((config) => {
    if (config.cliproxy) {
      config.cliproxy.routing = {
        ...config.cliproxy.routing,
        session_affinity: settings.enabled,
        session_affinity_ttl: ttl,
      };
    }
  });
  regenerateConfig(target.port, { configPath, authDir });

  const reachable = await isLiveCliproxyRoutingReachable();
  return {
    enabled: settings.enabled,
    ttl,
    source: 'config',
    target: 'local',
    reachable,
    manageable: true,
    applied: 'config-only',
    message: reachable
      ? 'Saved the local startup default. Running local CLIProxy may hot-reload the session-affinity setting, but CCS does not verify live selector state yet.'
      : 'Saved the local startup default. It will apply the next time local CLIProxy starts.',
  };
}

async function updateLiveCliproxyRoutingStrategy(strategy: CliproxyRoutingStrategy): Promise<void> {
  const response = await fetchCliproxyRoutingResponse(getCliproxyRoutingTarget(), 'PUT', {
    value: strategy,
  });
  if (!response.ok) {
    throw new Error(
      await getRoutingErrorMessage(
        response,
        `Failed to update routing strategy (${response.status})`
      )
    );
  }
}

function hasPositiveDuration(value: string): boolean {
  const segments = value.match(new RegExp(GO_DURATION_SEGMENT, 'g'));
  if (!segments) {
    return false;
  }

  return segments.some((segment) => {
    const numeric = parseFloat(segment);
    return Number.isFinite(numeric) && numeric > 0;
  });
}

async function isLiveCliproxyRoutingReachable(): Promise<boolean> {
  try {
    await fetchLiveCliproxyRoutingStrategy();
    return true;
  } catch {
    return false;
  }
}
