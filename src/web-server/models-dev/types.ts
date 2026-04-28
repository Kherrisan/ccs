export interface ModelsDevCost {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
  [key: string]: unknown;
}

export interface ModelsDevModel {
  id: string;
  name?: string;
  cost?: ModelsDevCost | null;
  limit?: Record<string, unknown>;
  modalities?: {
    input?: string[];
    output?: string[];
  };
  reasoning?: boolean | null;
  tool_call?: boolean | null;
  structured_output?: boolean | null;
  temperature?: boolean | null;
  [key: string]: unknown;
}

export interface ModelsDevProvider {
  id: string;
  name?: string;
  env?: string[];
  npm?: string;
  api?: string | null;
  doc?: string;
  models?: Record<string, ModelsDevModel>;
  [key: string]: unknown;
}

export type ModelsDevRegistry = Record<string, ModelsDevProvider>;

export interface ModelsDevCacheData {
  version: 1;
  fetchedAt: number;
  providers: ModelsDevRegistry;
}
