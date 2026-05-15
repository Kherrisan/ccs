export type SharedResourceMode = 'shared' | 'profile-local';

export interface SharedResourceMetadata {
  shared_resource_mode?: unknown;
  bare?: unknown;
}

export interface SharedResourcePolicy {
  mode: SharedResourceMode;
  inferred: boolean;
  profileLocal: boolean;
}

export interface SharedResourceMetadataUpdate {
  shared_resource_mode: SharedResourceMode;
  bare?: boolean | undefined;
}

export function isSharedResourceMode(value: unknown): value is SharedResourceMode {
  return value === 'shared' || value === 'profile-local';
}

export function resolveSharedResourcePolicy(
  metadata?: SharedResourceMetadata | null
): SharedResourcePolicy {
  const explicitMode = metadata?.shared_resource_mode;
  if (isSharedResourceMode(explicitMode)) {
    return {
      mode: explicitMode,
      inferred: false,
      profileLocal: explicitMode === 'profile-local',
    };
  }

  if (metadata?.bare === true) {
    return {
      mode: 'profile-local',
      inferred: true,
      profileLocal: true,
    };
  }

  return {
    mode: 'shared',
    inferred: true,
    profileLocal: false,
  };
}

export function isProfileLocalSharedResourceMode(
  metadata?: SharedResourceMetadata | null
): boolean {
  return resolveSharedResourcePolicy(metadata).profileLocal;
}

export function sharedResourceModeToMetadata(
  mode: SharedResourceMode
): SharedResourceMetadataUpdate {
  if (mode === 'profile-local') {
    return {
      shared_resource_mode: 'profile-local',
      bare: true,
    };
  }

  return {
    shared_resource_mode: 'shared',
    bare: undefined,
  };
}

export function normalizeSharedResourceMetadata<T extends SharedResourceMetadata>(metadata: T): T {
  const normalized = { ...metadata } as T & {
    shared_resource_mode?: SharedResourceMode;
    bare?: boolean;
  };

  if (normalized.shared_resource_mode === 'profile-local') {
    normalized.bare = true;
    return normalized;
  }

  if (normalized.shared_resource_mode === 'shared') {
    delete normalized.bare;
    return normalized;
  }

  delete normalized.shared_resource_mode;
  if (normalized.bare === true) {
    normalized.shared_resource_mode = 'profile-local';
    normalized.bare = true;
  } else {
    delete normalized.bare;
  }

  return normalized;
}
