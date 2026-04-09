import { getManagedModelPrefix } from '../shared/cliproxy-model-routing';
import { buildManagementHeaders, buildProxyUrl, getProxyTarget } from './proxy-target-resolver';
import { mapExternalProviderName } from './provider-capabilities';
import type { CLIProxyProvider } from './types';

interface ManagementAuthFileRecord {
  account_type?: string;
  name: string;
  provider?: string;
  type?: string;
}

export interface ManagedPrefixSyncResult {
  checked: number;
  updated: number;
}

function normalizeProvider(record: ManagementAuthFileRecord): CLIProxyProvider | null {
  const providerName = record.provider?.trim() || record.type?.trim() || '';
  return providerName ? mapExternalProviderName(providerName) : null;
}

async function listAuthFiles(): Promise<ManagementAuthFileRecord[]> {
  const target = getProxyTarget();
  const response = await fetch(buildProxyUrl(target, '/v0/management/auth-files'), {
    headers: buildManagementHeaders(target),
  });

  if (!response.ok) {
    throw new Error(`auth file listing failed with status ${response.status}`);
  }

  const data = (await response.json()) as { files?: ManagementAuthFileRecord[] };
  return Array.isArray(data.files) ? data.files : [];
}

async function patchAuthFilePrefix(name: string, prefix: string): Promise<void> {
  const target = getProxyTarget();
  const response = await fetch(buildProxyUrl(target, '/v0/management/auth-files/fields'), {
    method: 'PATCH',
    headers: buildManagementHeaders(target, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ name, prefix }),
  });

  if (!response.ok) {
    throw new Error(`auth file prefix patch failed for ${name} with status ${response.status}`);
  }
}

async function readAuthFilePrefix(name: string): Promise<string | null> {
  const target = getProxyTarget();
  const url = buildProxyUrl(
    target,
    `/v0/management/auth-files/download?name=${encodeURIComponent(name)}`
  );
  const response = await fetch(url, {
    headers: buildManagementHeaders(target),
  });

  if (!response.ok) {
    throw new Error(`auth file download failed for ${name} with status ${response.status}`);
  }

  const content = await response.text();
  try {
    const parsed = JSON.parse(content) as { prefix?: unknown };
    return typeof parsed.prefix === 'string' ? parsed.prefix.trim() : null;
  } catch {
    return null;
  }
}

export async function ensureManagedModelPrefixes(
  providers?: CLIProxyProvider[]
): Promise<ManagedPrefixSyncResult> {
  const files = await listAuthFiles();
  const allowedProviders = new Set((providers ?? []).map((provider) => provider.trim()));
  let checked = 0;
  let updated = 0;

  for (const record of files) {
    if ((record.account_type || '').trim().toLowerCase() !== 'oauth') {
      continue;
    }

    const provider = normalizeProvider(record);
    if (!provider) {
      continue;
    }

    if (allowedProviders.size > 0 && !allowedProviders.has(provider)) {
      continue;
    }

    const prefix = getManagedModelPrefix(provider);
    if (!prefix) {
      continue;
    }

    try {
      checked += 1;
      const currentPrefix = await readAuthFilePrefix(record.name);
      if (currentPrefix === prefix) {
        continue;
      }
      await patchAuthFilePrefix(record.name, prefix);
      updated += 1;
    } catch {
      // Best-effort repair: skip files that cannot be read or patched.
    }
  }

  return { checked, updated };
}
