import { normalizeModelsDevProviderId } from '../models-dev/pricing-resolver';

export interface ProviderModelIdentity {
  modelName: string;
  provider?: string;
}

export interface MergeableProviderModelBreakdown extends ProviderModelIdentity {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
}

export function normalizeUsageProvider(provider: string | undefined): string | undefined {
  return normalizeModelsDevProviderId(provider);
}

function getProviderKey(provider: string | undefined): string {
  return normalizeUsageProvider(provider) ?? '';
}

function getModelUsageLabel(item: ProviderModelIdentity, ambiguousModelNames: Set<string>): string {
  const provider = getProviderKey(item.provider);
  if (provider && ambiguousModelNames.has(item.modelName)) {
    return `${provider}/${item.modelName}`;
  }
  return item.modelName;
}

export function getProviderModelKey(item: ProviderModelIdentity): string {
  return `${getProviderKey(item.provider)}\u0000${item.modelName}`;
}

export function getModelsUsed(items: ProviderModelIdentity[]): string[] {
  const providersByModel = new Map<string, Set<string>>();
  for (const item of items) {
    const providers = providersByModel.get(item.modelName) ?? new Set<string>();
    providers.add(getProviderKey(item.provider));
    providersByModel.set(item.modelName, providers);
  }

  const ambiguousModelNames = new Set(
    Array.from(providersByModel.entries())
      .filter(([, providers]) => providers.size > 1)
      .map(([modelName]) => modelName)
  );

  return [...new Set(items.map((item) => getModelUsageLabel(item, ambiguousModelNames)))];
}

function addBreakdownTokens<T extends MergeableProviderModelBreakdown>(target: T, source: T): void {
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cacheCreationTokens += source.cacheCreationTokens;
  target.cacheReadTokens += source.cacheReadTokens;
  target.cost += source.cost;
}

export function coalesceLegacyProviderlessBreakdowns<T extends MergeableProviderModelBreakdown>(
  items: T[]
): T[] {
  const byModel = new Map<string, T[]>();
  for (const item of items) {
    const existing = byModel.get(item.modelName) ?? [];
    existing.push(item);
    byModel.set(item.modelName, existing);
  }

  const coalesced: T[] = [];
  for (const group of byModel.values()) {
    const providerBreakdowns = group.filter((item) => getProviderKey(item.provider));
    const legacyBreakdowns = group.filter((item) => !getProviderKey(item.provider));
    const providerKeys = new Set(providerBreakdowns.map((item) => getProviderKey(item.provider)));

    if (legacyBreakdowns.length > 0 && providerKeys.size === 1 && providerBreakdowns.length > 0) {
      const provider = Array.from(providerKeys)[0];
      const [firstProviderBreakdown, ...remainingProviderBreakdowns] = providerBreakdowns;
      const merged = { ...firstProviderBreakdown, provider } as T;

      for (const breakdown of [...remainingProviderBreakdowns, ...legacyBreakdowns]) {
        addBreakdownTokens(merged, breakdown);
      }

      coalesced.push(merged);
      continue;
    }

    coalesced.push(...group.map((item) => ({ ...item })));
  }

  return coalesced;
}
