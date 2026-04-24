type DroidCustomModelRootKey = 'customModels' | 'custom_models';
type DroidCustomModelLocationType = 'array' | 'object';

export type DroidByokProviderKind =
  | 'anthropic'
  | 'openai'
  | 'generic-chat-completion-api'
  | 'unknown';

const DROID_CUSTOM_MODEL_ROOT_KEYS: DroidCustomModelRootKey[] = ['customModels', 'custom_models'];
const DROID_ANTHROPIC_BUDGET_BY_EFFORT: Record<string, number> = {
  low: 4000,
  medium: 12000,
  high: 30000,
  max: 50000,
  xhigh: 64000,
};

export const DROID_REASONING_EFFORT_OPTIONS = ['low', 'medium', 'high', 'max', 'xhigh'] as const;

export interface DroidByokModelView {
  id: string;
  rootKey: DroidCustomModelRootKey;
  locationType: DroidCustomModelLocationType;
  locationKey: number | string;
  displayName: string;
  model: string;
  provider: string;
  providerKind: DroidByokProviderKind;
  effort: string | null;
  anthropicBudgetTokens: number | null;
}

interface DroidByokModelLookup {
  rootKey: DroidCustomModelRootKey;
  locationType: DroidCustomModelLocationType;
  locationKey: number | string;
}

interface ExtractedReasoning {
  effort: string | null;
  anthropicBudgetTokens: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeProviderKind(provider: string | null): DroidByokProviderKind {
  if (!provider) return 'unknown';
  const normalized = provider.toLowerCase();
  if (normalized === 'anthropic') return 'anthropic';
  if (normalized === 'openai') return 'openai';
  if (normalized === 'generic-chat-completion-api') return 'generic-chat-completion-api';
  return 'unknown';
}

function buildModelId(
  rootKey: DroidCustomModelRootKey,
  locationType: DroidCustomModelLocationType,
  locationKey: number | string
): string {
  return `${rootKey}:${locationType}:${encodeURIComponent(String(locationKey))}`;
}

function parseModelId(modelId: string): DroidByokModelLookup | null {
  const firstSeparator = modelId.indexOf(':');
  const secondSeparator = modelId.indexOf(':', firstSeparator + 1);
  if (firstSeparator <= 0 || secondSeparator <= firstSeparator + 1) return null;

  const rootKey = modelId.slice(0, firstSeparator);
  const locationType = modelId.slice(firstSeparator + 1, secondSeparator);
  const encodedLocation = modelId.slice(secondSeparator + 1);

  if (rootKey !== 'customModels' && rootKey !== 'custom_models') return null;
  if (locationType !== 'array' && locationType !== 'object') return null;

  const locationValue = decodeURIComponent(encodedLocation);
  if (locationType === 'array') {
    const parsedIndex = Number.parseInt(locationValue, 10);
    if (!Number.isInteger(parsedIndex) || parsedIndex < 0) return null;
    return {
      rootKey,
      locationType,
      locationKey: parsedIndex,
    };
  }

  return {
    rootKey,
    locationType,
    locationKey: locationValue,
  };
}

function inferEffortFromAnthropicBudget(budgetTokens: number | null): string | null {
  if (!budgetTokens || budgetTokens <= 0) return null;
  if (budgetTokens <= 4000) return 'low';
  if (budgetTokens <= 12000) return 'medium';
  if (budgetTokens <= 30000) return 'high';
  if (budgetTokens <= 50000) return 'max';
  return 'xhigh';
}

function resolveExtraArgsKey(modelEntry: Record<string, unknown>): 'extraArgs' | 'extra_args' {
  if (Object.prototype.hasOwnProperty.call(modelEntry, 'extraArgs')) {
    return 'extraArgs';
  }
  if (Object.prototype.hasOwnProperty.call(modelEntry, 'extra_args')) {
    return 'extra_args';
  }
  return 'extraArgs';
}

function cloneSettings(settings: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(settings)) as Record<string, unknown>;
}

function listEntryRecords(settings: Record<string, unknown>): Array<{
  rootKey: DroidCustomModelRootKey;
  locationType: DroidCustomModelLocationType;
  locationKey: number | string;
  entry: Record<string, unknown>;
}> {
  const rows: Array<{
    rootKey: DroidCustomModelRootKey;
    locationType: DroidCustomModelLocationType;
    locationKey: number | string;
    entry: Record<string, unknown>;
  }> = [];

  for (const rootKey of DROID_CUSTOM_MODEL_ROOT_KEYS) {
    const container = settings[rootKey];
    if (Array.isArray(container)) {
      container.forEach((item, index) => {
        if (isRecord(item)) {
          rows.push({ rootKey, locationType: 'array', locationKey: index, entry: item });
        }
      });
      continue;
    }

    if (!isRecord(container)) continue;

    for (const [objectKey, item] of Object.entries(container)) {
      if (isRecord(item)) {
        rows.push({ rootKey, locationType: 'object', locationKey: objectKey, entry: item });
      }
    }
  }

  return rows;
}

function lookupEntryById(
  settings: Record<string, unknown>,
  modelId: string
): { entry: Record<string, unknown>; providerKind: DroidByokProviderKind } | null {
  const parsed = parseModelId(modelId);
  if (!parsed) return null;

  const container = settings[parsed.rootKey];

  if (parsed.locationType === 'array') {
    if (!Array.isArray(container)) return null;
    const item = container[parsed.locationKey as number];
    if (!isRecord(item)) return null;

    const provider = asNonEmptyString(item.provider);
    return { entry: item, providerKind: normalizeProviderKind(provider) };
  }

  if (!isRecord(container)) return null;
  const item = container[parsed.locationKey as string];
  if (!isRecord(item)) return null;

  const provider = asNonEmptyString(item.provider);
  return { entry: item, providerKind: normalizeProviderKind(provider) };
}

function extractReasoningDetails(
  providerKind: DroidByokProviderKind,
  modelEntry: Record<string, unknown>
): ExtractedReasoning {
  const extraArgsCandidate = modelEntry.extraArgs ?? modelEntry.extra_args;
  const extraArgs = isRecord(extraArgsCandidate) ? extraArgsCandidate : null;
  if (!extraArgs) {
    return { effort: null, anthropicBudgetTokens: null };
  }

  const flatReasoningEffort =
    asNonEmptyString(extraArgs.reasoning_effort) ?? asNonEmptyString(extraArgs.reasoningEffort);
  const reasoningConfig = isRecord(extraArgs.reasoning) ? extraArgs.reasoning : null;
  const nestedReasoningEffort = reasoningConfig ? asNonEmptyString(reasoningConfig.effort) : null;
  const thinkingConfig = isRecord(extraArgs.thinking) ? extraArgs.thinking : null;
  const thinkingType = thinkingConfig ? asNonEmptyString(thinkingConfig.type) : null;
  const anthropicBudgetTokens = thinkingConfig
    ? (asFiniteNumber(thinkingConfig.budget_tokens) ?? asFiniteNumber(thinkingConfig.budgetTokens))
    : null;

  if (providerKind === 'openai') {
    return {
      effort: nestedReasoningEffort ?? flatReasoningEffort,
      anthropicBudgetTokens: null,
    };
  }

  if (providerKind === 'anthropic') {
    if (thinkingType === 'enabled') {
      return {
        effort: inferEffortFromAnthropicBudget(anthropicBudgetTokens) ?? 'high',
        anthropicBudgetTokens,
      };
    }
    return {
      effort: nestedReasoningEffort ?? flatReasoningEffort,
      anthropicBudgetTokens,
    };
  }

  return {
    effort: flatReasoningEffort ?? nestedReasoningEffort,
    anthropicBudgetTokens: null,
  };
}

function sanitizeEffortInput(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'default' || normalized === 'unset') return null;
  if (normalized === 'off' || normalized === 'none' || normalized === 'disabled') return null;
  return normalized;
}

function ensureExtraArgs(entry: Record<string, unknown>): {
  extraArgsKey: 'extraArgs' | 'extra_args';
  extraArgs: Record<string, unknown>;
} {
  const extraArgsKey = resolveExtraArgsKey(entry);
  const currentExtraArgs = entry[extraArgsKey];
  const nextExtraArgs = isRecord(currentExtraArgs) ? { ...currentExtraArgs } : {};
  return { extraArgsKey, extraArgs: nextExtraArgs };
}

function commitExtraArgs(
  entry: Record<string, unknown>,
  extraArgsKey: 'extraArgs' | 'extra_args',
  extraArgs: Record<string, unknown>
): void {
  if (Object.keys(extraArgs).length === 0) {
    delete entry[extraArgsKey];
    return;
  }
  entry[extraArgsKey] = extraArgs;
}

export function extractDroidByokModels(settings: Record<string, unknown>): DroidByokModelView[] {
  return listEntryRecords(settings).map(({ rootKey, locationType, locationKey, entry }) => {
    const displayName =
      asNonEmptyString(entry.displayName) ??
      asNonEmptyString(entry.model_display_name) ??
      'Unnamed model'; // TODO i18n: missing key for unnamed model
    const model = asNonEmptyString(entry.model) ?? '';
    const provider = asNonEmptyString(entry.provider) ?? 'unknown';
    const providerKind = normalizeProviderKind(provider);
    const reasoning = extractReasoningDetails(providerKind, entry);

    return {
      id: buildModelId(rootKey, locationType, locationKey),
      rootKey,
      locationType,
      locationKey,
      displayName,
      model,
      provider,
      providerKind,
      effort: reasoning.effort,
      anthropicBudgetTokens: reasoning.anthropicBudgetTokens,
    };
  });
}

export function applyReasoningEffortToDroidByokModel(
  settings: Record<string, unknown>,
  modelId: string,
  effort: string | null
): Record<string, unknown> | null {
  const nextSettings = cloneSettings(settings);
  const target = lookupEntryById(nextSettings, modelId);
  if (!target) return null;

  const normalizedEffort = sanitizeEffortInput(effort);
  const { extraArgsKey, extraArgs } = ensureExtraArgs(target.entry);

  if (target.providerKind === 'openai') {
    delete extraArgs.reasoning_effort;
    delete extraArgs.reasoningEffort;

    if (!normalizedEffort) {
      delete extraArgs.reasoning;
    } else {
      const existingReasoning = isRecord(extraArgs.reasoning) ? extraArgs.reasoning : {};
      extraArgs.reasoning = {
        ...existingReasoning,
        effort: normalizedEffort,
      };
    }
  } else if (target.providerKind === 'anthropic') {
    delete extraArgs.reasoning_effort;
    delete extraArgs.reasoningEffort;
    delete extraArgs.reasoning;

    if (!normalizedEffort) {
      delete extraArgs.thinking;
    } else {
      const existingThinking = isRecord(extraArgs.thinking) ? { ...extraArgs.thinking } : {};
      const existingBudget =
        asFiniteNumber(existingThinking.budget_tokens) ??
        asFiniteNumber(existingThinking.budgetTokens);

      delete existingThinking.budgetTokens;
      extraArgs.thinking = {
        ...existingThinking,
        type: 'enabled',
        budget_tokens:
          existingBudget ?? DROID_ANTHROPIC_BUDGET_BY_EFFORT[normalizedEffort] ?? 30000,
      };
    }
  } else {
    delete extraArgs.reasoning;
    delete extraArgs.reasoningEffort;

    if (!normalizedEffort) {
      delete extraArgs.reasoning_effort;
    } else {
      extraArgs.reasoning_effort = normalizedEffort;
    }
  }

  commitExtraArgs(target.entry, extraArgsKey, extraArgs);
  return nextSettings;
}

export function applyAnthropicBudgetTokensToDroidByokModel(
  settings: Record<string, unknown>,
  modelId: string,
  budgetTokens: number | null
): Record<string, unknown> | null {
  const nextSettings = cloneSettings(settings);
  const target = lookupEntryById(nextSettings, modelId);
  if (!target || target.providerKind !== 'anthropic') return null;

  const { extraArgsKey, extraArgs } = ensureExtraArgs(target.entry);
  const thinking = isRecord(extraArgs.thinking) ? { ...extraArgs.thinking } : {};
  thinking.type = 'enabled';

  if (budgetTokens === null) {
    delete thinking.budget_tokens;
    delete thinking.budgetTokens;
  } else {
    const normalizedBudget = Math.max(1024, Math.floor(budgetTokens));
    thinking.budget_tokens = normalizedBudget;
    delete thinking.budgetTokens;
  }

  extraArgs.thinking = thinking;
  commitExtraArgs(target.entry, extraArgsKey, extraArgs);
  return nextSettings;
}
