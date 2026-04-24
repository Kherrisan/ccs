import type { OpenAICompatProfileConfig } from './profile-router';

export function buildOpenAICompatProxyEnv(
  profile: OpenAICompatProfileConfig,
  port: number,
  authToken: string,
  claudeConfigDir?: string,
  host = '127.0.0.1'
): Record<string, string> {
  const localBaseUrl = `http://${host}:${port}`;
  return {
    ANTHROPIC_BASE_URL: localBaseUrl,
    ANTHROPIC_AUTH_TOKEN: authToken,
    DISABLE_TELEMETRY: '1',
    DISABLE_COST_WARNINGS: '1',
    API_TIMEOUT_MS: '600000',
    NO_PROXY: host === '127.0.0.1' ? '127.0.0.1,localhost' : `${host},127.0.0.1,localhost`,
    ...(profile.model ? { ANTHROPIC_MODEL: profile.model } : {}),
    ...(profile.opusModel ? { ANTHROPIC_DEFAULT_OPUS_MODEL: profile.opusModel } : {}),
    ...(profile.sonnetModel ? { ANTHROPIC_DEFAULT_SONNET_MODEL: profile.sonnetModel } : {}),
    ...(profile.haikuModel
      ? {
          ANTHROPIC_DEFAULT_HAIKU_MODEL: profile.haikuModel,
          ANTHROPIC_SMALL_FAST_MODEL: profile.haikuModel,
        }
      : {}),
    ...(claudeConfigDir ? { CLAUDE_CONFIG_DIR: claudeConfigDir } : {}),
  };
}
