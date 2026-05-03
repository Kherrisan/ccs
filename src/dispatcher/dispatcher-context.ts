/**
 * Shared context type for Phase E profile dispatch flows.
 *
 * ProfileDispatchContext extends ResolvedProfile with the dynamic imports
 * needed by all flows (InstanceManager, ProfileRegistry, AccountContext,
 * ProfileContinuity), and the browser-exposure fields already computed by
 * Phase C (profile-resolver.ts).
 */

import type { ResolvedProfile } from './profile-resolver';
import type { loadSettings } from '../utils/config-manager';
import type { getEffectiveClaudeBrowserAttachConfig } from '../utils/browser';
import type { resolveCliproxyBridgeMetadata } from '../api/services/cliproxy-profile-bridge';
import type { resolveTargetType } from '../targets/target-resolver';

// Re-export ResolvedProfile fields as ProfileDispatchContext —
// all browser-exposure fields are already present in ResolvedProfile.
export type ProfileDispatchContext = ResolvedProfile & {
  /** Dynamic-imported modules needed by account/settings flows */
  InstanceManager: Awaited<typeof import('../management/instance-manager')>['default'];
  ProfileRegistry: Awaited<typeof import('../auth/profile-registry')>['default'];
  resolveAccountContextPolicy: Awaited<
    typeof import('../auth/account-context')
  >['resolveAccountContextPolicy'];
  isAccountContextMetadata: Awaited<
    typeof import('../auth/account-context')
  >['isAccountContextMetadata'];
  resolveProfileContinuityInheritance: Awaited<
    typeof import('../auth/profile-continuity-inheritance')
  >['resolveProfileContinuityInheritance'];
};

// Re-export for convenience
export type { ResolvedProfile };
export type {
  loadSettings,
  getEffectiveClaudeBrowserAttachConfig,
  resolveCliproxyBridgeMetadata,
  resolveTargetType,
};
