import {
  inferDroidProviderFromBaseUrl,
  resolveDroidProvider,
  type DroidProvider,
} from '../targets/droid-provider';

export interface OpenAICompatProfileConfig {
  profileName: string;
  settingsPath: string;
  baseUrl: string;
  apiKey: string;
  provider: DroidProvider;
  insecure?: boolean;
  model?: string;
  opusModel?: string;
  sonnetModel?: string;
  haikuModel?: string;
}

export interface OpenAICompatProfileEnv {
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_AUTH_TOKEN?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  ANTHROPIC_DEFAULT_OPUS_MODEL?: string;
  ANTHROPIC_DEFAULT_SONNET_MODEL?: string;
  ANTHROPIC_DEFAULT_HAIKU_MODEL?: string;
  ANTHROPIC_SMALL_FAST_MODEL?: string;
  CCS_DROID_PROVIDER?: string;
  CCS_OPENAI_PROXY_INSECURE?: string;
}

export function isOpenAICompatProvider(provider: DroidProvider | null): provider is DroidProvider {
  return provider === 'openai' || provider === 'generic-chat-completion-api';
}

export function resolveOpenAICompatProfileConfig(
  profileName: string,
  settingsPath: string,
  env: OpenAICompatProfileEnv
): OpenAICompatProfileConfig | null {
  const baseUrl = env.ANTHROPIC_BASE_URL?.trim() || '';
  const apiKey = env.ANTHROPIC_AUTH_TOKEN?.trim() || env.ANTHROPIC_API_KEY?.trim() || '';
  if (!baseUrl || !apiKey) {
    return null;
  }

  const providerFromUrl = inferDroidProviderFromBaseUrl(baseUrl);
  const provider = isOpenAICompatProvider(providerFromUrl)
    ? providerFromUrl
    : resolveDroidProvider({
        provider: env.CCS_DROID_PROVIDER,
        baseUrl,
        model: env.ANTHROPIC_MODEL,
      });
  if (!isOpenAICompatProvider(provider)) {
    return null;
  }

  return {
    profileName,
    settingsPath,
    baseUrl,
    apiKey,
    provider,
    insecure:
      env.CCS_OPENAI_PROXY_INSECURE === '1' ||
      env.CCS_OPENAI_PROXY_INSECURE?.toLowerCase() === 'true',
    model: env.ANTHROPIC_MODEL?.trim() || undefined,
    opusModel: env.ANTHROPIC_DEFAULT_OPUS_MODEL?.trim() || undefined,
    sonnetModel: env.ANTHROPIC_DEFAULT_SONNET_MODEL?.trim() || undefined,
    haikuModel:
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL?.trim() ||
      env.ANTHROPIC_SMALL_FAST_MODEL?.trim() ||
      undefined,
  };
}
