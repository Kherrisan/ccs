export interface ProviderModelIdentity {
  modelName: string;
  provider?: string;
}

function getProviderKey(provider: string | undefined): string {
  return provider?.trim().toLowerCase() ?? '';
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
