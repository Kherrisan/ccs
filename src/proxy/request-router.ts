import { loadConfigSafe, loadSettings } from '../utils/config-manager';
import { expandPath } from '../utils/helpers';
import type { ProxyOpenAIRequest } from './transformers/request-transformer';
import {
  loadOpenAICompatProxyRoutingConfig,
  type OpenAICompatProxyRoutingConfig,
} from './routing-config';
import { resolveOpenAICompatProfileConfig, type OpenAICompatProfileConfig } from './profile-router';

export type ProxyRoutingScenario = 'default' | 'background' | 'think' | 'longContext' | 'webSearch';

export interface ProxyRequestRoute {
  profile: OpenAICompatProfileConfig;
  model?: string;
  scenario?: ProxyRoutingScenario;
  estimatedTokens: number;
  source:
    | 'explicit-profile'
    | 'scenario'
    | 'profile-model-match'
    | 'profile-name'
    | 'request-model'
    | 'active-default';
}

function loadOpenAICompatProfiles(
  activeProfile: OpenAICompatProfileConfig
): OpenAICompatProfileConfig[] {
  const config = loadConfigSafe();
  const profiles = [activeProfile];

  for (const [profileName, settingsPath] of Object.entries(config.profiles)) {
    if (profileName === activeProfile.profileName) {
      continue;
    }

    try {
      const expandedPath = expandPath(settingsPath);
      const settings = loadSettings(expandedPath);
      const profile = resolveOpenAICompatProfileConfig(
        profileName,
        expandedPath,
        settings.env || {}
      );
      if (profile) {
        profiles.push(profile);
      }
    } catch {
      // Ignore invalid profiles while routing a live request.
    }
  }

  return profiles;
}

function resolveSelectorTarget(
  selector: string,
  activeProfile: OpenAICompatProfileConfig,
  profiles: OpenAICompatProfileConfig[]
): { profile: OpenAICompatProfileConfig; model?: string; explicitProfile: boolean } | null {
  const trimmed = selector.trim();
  if (!trimmed) {
    return null;
  }

  const colonIndex = trimmed.indexOf(':');
  if (colonIndex > 0) {
    const profileName = trimmed.slice(0, colonIndex).trim();
    const profile = profiles.find((candidate) => candidate.profileName === profileName);
    if (profile) {
      const model = trimmed.slice(colonIndex + 1).trim() || profile.model;
      return { profile, model, explicitProfile: true };
    }
  }

  const namedProfile = profiles.find((candidate) => candidate.profileName === trimmed);
  if (namedProfile) {
    return { profile: namedProfile, model: namedProfile.model, explicitProfile: false };
  }

  return {
    profile: activeProfile,
    model: trimmed,
    explicitProfile: false,
  };
}

function profileSupportsModel(profile: OpenAICompatProfileConfig, model: string): boolean {
  return [profile.model, profile.opusModel, profile.sonnetModel, profile.haikuModel].some(
    (candidate) => typeof candidate === 'string' && candidate === model
  );
}

function estimateTokens(request: ProxyOpenAIRequest): number {
  let characters = 0;
  for (const message of request.messages) {
    if (typeof message.content === 'string') {
      characters += message.content.length;
      continue;
    }
    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        characters += part.type === 'text' ? part.text.length : part.image_url.url.length;
      }
    }
    if (Array.isArray(message.tool_calls)) {
      for (const toolCall of message.tool_calls) {
        characters += toolCall.function.name.length + toolCall.function.arguments.length;
      }
    }
  }

  if (Array.isArray(request.tools)) {
    characters += JSON.stringify(request.tools).length;
  }

  return Math.max(1, Math.ceil(characters / 4));
}

function detectScenario(
  request: ProxyOpenAIRequest,
  requestedModel: string | undefined,
  routing: OpenAICompatProxyRoutingConfig
): { scenario?: ProxyRoutingScenario; selector?: string; estimatedTokens: number } {
  const estimatedTokens = estimateTokens(request);
  const hasWebSearchTool =
    request.tools?.some((tool) => tool.function.name === 'web_search') === true;
  const thinkingEnabled =
    request.reasoning?.enabled === true || typeof request.reasoning_effort === 'string';
  const modelId = requestedModel || '';
  const longContextThreshold = routing.longContextThreshold ?? 60_000;

  if (hasWebSearchTool && routing.webSearch) {
    return { scenario: 'webSearch', selector: routing.webSearch, estimatedTokens };
  }
  if (thinkingEnabled && routing.think) {
    return { scenario: 'think', selector: routing.think, estimatedTokens };
  }
  if (estimatedTokens > longContextThreshold && routing.longContext) {
    return { scenario: 'longContext', selector: routing.longContext, estimatedTokens };
  }
  if (modelId.toLowerCase().includes('haiku') && routing.background) {
    return { scenario: 'background', selector: routing.background, estimatedTokens };
  }
  if (!requestedModel && routing.default) {
    return { scenario: 'default', selector: routing.default, estimatedTokens };
  }

  return { estimatedTokens };
}

export function resolveProxyRequestRoute(
  activeProfile: OpenAICompatProfileConfig,
  request: ProxyOpenAIRequest
): ProxyRequestRoute {
  const profiles = loadOpenAICompatProfiles(activeProfile);
  const requestedModel = request.model?.trim() || undefined;
  const explicitTarget = requestedModel
    ? resolveSelectorTarget(requestedModel, activeProfile, profiles)
    : null;
  const routing = loadOpenAICompatProxyRoutingConfig();

  if (explicitTarget?.explicitProfile) {
    return {
      profile: explicitTarget.profile,
      model: explicitTarget.model,
      estimatedTokens: estimateTokens(request),
      source: 'explicit-profile',
    };
  }

  const scenario = detectScenario(request, requestedModel, routing);
  if (scenario.selector) {
    const scenarioTarget = resolveSelectorTarget(scenario.selector, activeProfile, profiles);
    if (scenarioTarget) {
      return {
        profile: scenarioTarget.profile,
        model: scenarioTarget.model,
        scenario: scenario.scenario,
        estimatedTokens: scenario.estimatedTokens,
        source: 'scenario',
      };
    }
  }

  if (explicitTarget && explicitTarget.profile.profileName !== activeProfile.profileName) {
    return {
      profile: explicitTarget.profile,
      model: explicitTarget.model,
      estimatedTokens: scenario.estimatedTokens,
      source: 'profile-name',
    };
  }

  if (requestedModel) {
    const matchedProfile = profiles.find((profile) =>
      profileSupportsModel(profile, requestedModel)
    );
    if (matchedProfile) {
      return {
        profile: matchedProfile,
        model: requestedModel,
        estimatedTokens: scenario.estimatedTokens,
        source: 'profile-model-match',
      };
    }

    return {
      profile: activeProfile,
      model: requestedModel,
      estimatedTokens: scenario.estimatedTokens,
      source: 'request-model',
    };
  }

  return {
    profile: activeProfile,
    model: activeProfile.model,
    estimatedTokens: scenario.estimatedTokens,
    source: 'active-default',
  };
}
