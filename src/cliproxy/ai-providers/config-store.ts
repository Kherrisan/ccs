import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { configExists, getCliproxyConfigPath, regenerateConfig } from '../config-generator';
import { getProxyTarget } from '../proxy-target-resolver';
import { createManagementClient } from '../management-api-client';
import { rewriteTopLevelYamlSection } from './config-yaml-sections';
import type {
  AiProviderApiKeyEntry,
  AiProviderFamilyId,
  LocalAiProviderConfig,
  OpenAICompatEntry,
} from './types';

type FamilyEntriesMap = {
  'gemini-api-key': AiProviderApiKeyEntry[];
  'codex-api-key': AiProviderApiKeyEntry[];
  'claude-api-key': AiProviderApiKeyEntry[];
  'vertex-api-key': AiProviderApiKeyEntry[];
  'openai-compatibility': OpenAICompatEntry[];
};

export type FamilyEntries<F extends AiProviderFamilyId> = FamilyEntriesMap[F];

function ensureLocalConfigPath(): string {
  if (!configExists()) {
    regenerateConfig();
  }
  return getCliproxyConfigPath();
}

function readLocalConfig(): LocalAiProviderConfig {
  const configPath = ensureLocalConfigPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    return (yaml.load(content) as LocalAiProviderConfig) || {};
  } catch {
    return {};
  }
}

function writeLocalFamilySection<F extends AiProviderFamilyId>(
  family: F,
  entries: FamilyEntries<F>
): void {
  const configPath = ensureLocalConfigPath();
  const content = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const sectionYaml =
    entries.length > 0
      ? yaml.dump(
          { [family]: entries },
          {
            indent: 2,
            lineWidth: -1,
            quotingType: "'",
            forceQuotes: false,
          }
        )
      : null;
  const nextContent = rewriteTopLevelYamlSection(content, family, sectionYaml);
  const tempPath = `${configPath}.tmp`;
  fs.writeFileSync(tempPath, nextContent, { mode: 0o600 });
  fs.renameSync(tempPath, configPath);
}

export function getAiProvidersSourceSummary() {
  const target = getProxyTarget();
  const managementAuth = target.isRemote
    ? target.managementKey
      ? 'configured'
      : target.authToken
        ? 'fallback'
        : 'missing'
    : 'configured';

  return {
    mode: target.isRemote ? 'remote' : 'local',
    label: target.isRemote ? 'Remote CLIProxy' : 'Local CLIProxy',
    target: `${target.protocol}://${target.host}:${target.port}`,
    managementAuth,
  } as const;
}

export async function readFamilyEntries<F extends AiProviderFamilyId>(
  family: F
): Promise<FamilyEntries<F>> {
  const target = getProxyTarget();

  if (!target.isRemote) {
    const config = readLocalConfig();
    return (config[family] || []) as FamilyEntries<F>;
  }

  const client = createManagementClient({
    host: target.host,
    port: target.port,
    protocol: target.protocol,
    management_key: target.managementKey,
    auth_token: target.authToken,
  });

  return client.getSection<FamilyEntries<F>[number]>(family) as Promise<FamilyEntries<F>>;
}

export async function writeFamilyEntries<F extends AiProviderFamilyId>(
  family: F,
  entries: FamilyEntries<F>
): Promise<void> {
  const target = getProxyTarget();

  if (!target.isRemote) {
    writeLocalFamilySection(family, entries);
    return;
  }

  const client = createManagementClient({
    host: target.host,
    port: target.port,
    protocol: target.protocol,
    management_key: target.managementKey,
    auth_token: target.authToken,
  });

  await client.putSection<FamilyEntries<F>[number]>(family, entries as FamilyEntries<F>[number][]);
}
