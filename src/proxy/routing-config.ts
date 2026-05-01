import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { getActiveConfigPath, getConfigPath } from '../utils/config-manager';

export interface OpenAICompatProxyRoutingConfig {
  default?: string;
  background?: string;
  think?: string;
  longContext?: string;
  webSearch?: string;
  longContextThreshold?: number;
}

function readRawConfigObject(configPath: string): Record<string, unknown> | null {
  if (!fs.existsSync(configPath)) {
    return null;
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed =
    configPath.endsWith('.yaml') || configPath.endsWith('.yml') ? yaml.load(raw) : JSON.parse(raw);
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
}

function normalizeRoutingConfig(value: unknown): OpenAICompatProxyRoutingConfig {
  if (typeof value !== 'object' || value === null) {
    return {};
  }

  const config = value as Record<string, unknown>;
  return {
    default:
      typeof config.default === 'string' && config.default.trim()
        ? config.default.trim()
        : undefined,
    background:
      typeof config.background === 'string' && config.background.trim()
        ? config.background.trim()
        : undefined,
    think:
      typeof config.think === 'string' && config.think.trim() ? config.think.trim() : undefined,
    longContext:
      typeof config.longContext === 'string' && config.longContext.trim()
        ? config.longContext.trim()
        : undefined,
    webSearch:
      typeof config.webSearch === 'string' && config.webSearch.trim()
        ? config.webSearch.trim()
        : undefined,
    longContextThreshold:
      typeof config.longContextThreshold === 'number' &&
      Number.isFinite(config.longContextThreshold)
        ? config.longContextThreshold
        : undefined,
  };
}

export function loadOpenAICompatProxyRoutingConfig(): OpenAICompatProxyRoutingConfig {
  const activePath = getActiveConfigPath();
  const rawConfig = readRawConfigObject(activePath);
  if (rawConfig?.proxy && typeof rawConfig.proxy === 'object') {
    return normalizeRoutingConfig((rawConfig.proxy as Record<string, unknown>).routing);
  }

  const legacyPath = getConfigPath();
  if (legacyPath !== activePath) {
    const legacyConfig = readRawConfigObject(legacyPath);
    if (legacyConfig?.proxy && typeof legacyConfig.proxy === 'object') {
      return normalizeRoutingConfig((legacyConfig.proxy as Record<string, unknown>).routing);
    }
  }

  return {};
}
