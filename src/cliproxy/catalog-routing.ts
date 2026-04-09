import {
  buildCliproxyRoutingHints,
  type CliproxyProviderRoutingHints,
} from '../shared/cliproxy-model-routing';
import { fetchCliproxyModels } from './stats-fetcher';
import { ensureManagedModelPrefixes } from './managed-model-prefixes';
import {
  getResolvedCatalogSnapshot,
  type CatalogSource,
  type ResolvedCatalogSnapshot,
} from './catalog-cache';
import type { ProviderCatalog } from './model-catalog';
import type { CLIProxyProvider } from './types';

export interface CatalogRoutingSnapshot {
  catalogs: Partial<Record<CLIProxyProvider, ProviderCatalog>>;
  source: CatalogSource;
  cacheAge: string | null;
  routing: Partial<Record<string, CliproxyProviderRoutingHints>>;
}

export async function getCatalogRoutingSnapshot(): Promise<CatalogRoutingSnapshot> {
  try {
    await ensureManagedModelPrefixes();
  } catch {
    // Keep catalog rendering non-fatal when prefix sync is unavailable.
  }

  const snapshot: ResolvedCatalogSnapshot = await getResolvedCatalogSnapshot();
  const modelsResponse = await fetchCliproxyModels();
  const routing = buildCliproxyRoutingHints(snapshot.catalogs, modelsResponse?.models ?? []);

  return {
    catalogs: snapshot.catalogs,
    source: snapshot.source,
    cacheAge: snapshot.cacheAge,
    routing,
  };
}
