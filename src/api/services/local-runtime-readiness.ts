export type LocalRuntimeId = 'ollama' | 'llamacpp';
export type LocalRuntimeStatus = 'ready' | 'missing-model' | 'offline';

export interface LocalRuntimeReadiness {
  id: LocalRuntimeId;
  name: string;
  endpoint: string;
  status: LocalRuntimeStatus;
  commandHint: string;
  recommendedModel: string | null;
  recommendedModelInstalled: boolean;
  detectedModelCount: number;
}

interface LocalRuntimeDefinition {
  id: LocalRuntimeId;
  name: string;
  endpoint: string;
  modelsUrl: string;
  commandHint: string;
  pullCommandHint?: string;
  recommendedModel: string | null;
  parseModelIds: (payload: unknown) => string[];
}

const LOCAL_RUNTIME_DEFINITIONS: LocalRuntimeDefinition[] = [
  {
    id: 'ollama',
    name: 'Ollama',
    endpoint: 'http://127.0.0.1:11434',
    modelsUrl: 'http://127.0.0.1:11434/api/tags',
    commandHint: 'ollama serve',
    pullCommandHint: 'ollama pull',
    recommendedModel: 'gemma4:e4b',
    parseModelIds: (payload) => {
      const models = (payload as { models?: Array<{ name?: string }> })?.models;
      return Array.isArray(models)
        ? models
            .map((model) => (typeof model?.name === 'string' ? model.name.trim() : ''))
            .filter(Boolean)
        : [];
    },
  },
  {
    id: 'llamacpp',
    name: 'llama.cpp',
    endpoint: 'http://127.0.0.1:8080',
    modelsUrl: 'http://127.0.0.1:8080/v1/models',
    commandHint: './server --host 0.0.0.0 --port 8080 -m model.gguf',
    recommendedModel: null,
    parseModelIds: (payload) => {
      const models = (payload as { data?: Array<{ id?: string }> })?.data;
      return Array.isArray(models)
        ? models
            .map((model) => (typeof model?.id === 'string' ? model.id.trim() : ''))
            .filter(Boolean)
        : [];
    },
  },
];

async function fetchModelIds(definition: LocalRuntimeDefinition): Promise<string[]> {
  const response = await fetch(definition.modelsUrl, {
    signal: AbortSignal.timeout(1500),
  });

  if (!response.ok) {
    throw new Error(`${definition.id} readiness probe failed (${response.status})`);
  }

  return definition.parseModelIds(await response.json());
}

function toReadiness(
  definition: LocalRuntimeDefinition,
  modelIds: string[]
): LocalRuntimeReadiness {
  const recommendedModelInstalled = definition.recommendedModel
    ? modelIds.some((modelId) => modelId === definition.recommendedModel)
    : modelIds.length > 0;

  const status: LocalRuntimeStatus =
    modelIds.length === 0 || !recommendedModelInstalled ? 'missing-model' : 'ready';

  return {
    id: definition.id,
    name: definition.name,
    endpoint: definition.endpoint,
    status,
    commandHint:
      status === 'missing-model' && definition.recommendedModel && definition.pullCommandHint
        ? `${definition.pullCommandHint} ${definition.recommendedModel}`
        : definition.commandHint,
    recommendedModel: definition.recommendedModel,
    recommendedModelInstalled,
    detectedModelCount: modelIds.length,
  };
}

function toOffline(definition: LocalRuntimeDefinition): LocalRuntimeReadiness {
  return {
    id: definition.id,
    name: definition.name,
    endpoint: definition.endpoint,
    status: 'offline',
    commandHint: definition.commandHint,
    recommendedModel: definition.recommendedModel,
    recommendedModelInstalled: false,
    detectedModelCount: 0,
  };
}

export async function getLocalRuntimeReadiness(): Promise<LocalRuntimeReadiness[]> {
  return Promise.all(
    LOCAL_RUNTIME_DEFINITIONS.map(async (definition) => {
      try {
        return toReadiness(definition, await fetchModelIds(definition));
      } catch {
        return toOffline(definition);
      }
    })
  );
}
