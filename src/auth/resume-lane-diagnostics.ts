import * as fs from 'fs';
import * as path from 'path';
import { getDefaultClaudeConfigDir } from '../utils/claude-config-path';
import { getCcsDir } from '../utils/config-manager';
import InstanceManager from '../management/instance-manager';
import ProfileDetector from './profile-detector';
import { resolveConfiguredContinuitySourceAccount } from './profile-continuity-inheritance';
import type { ProfileType } from '../types/profile';

export type ResumeLaneKind =
  | 'native'
  | 'account-default'
  | 'account-inherited'
  | 'profile-default'
  | 'ambient';

export interface ResumeLaneSummary {
  kind: ResumeLaneKind;
  label: string;
  configDir: string;
  accountName?: string;
  profileName?: string;
  projectCount: number;
}

export interface ResumeFlagIntent {
  implicit: boolean;
  explicitSessionId?: string;
}

function countTopLevelProjectDirs(projectsDir: string): number {
  try {
    return fs
      .readdirSync(projectsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).length;
  } catch {
    return 0;
  }
}

function resolveNativeLaneSummary(
  kind: ResumeLaneKind = 'native',
  profileName?: string
): ResumeLaneSummary {
  const configDir = getDefaultClaudeConfigDir();
  const label =
    kind === 'profile-default' && profileName
      ? `profile "${profileName}" via native Claude lane`
      : 'native Claude lane';

  return {
    kind,
    label,
    configDir,
    profileName,
    projectCount: countTopLevelProjectDirs(path.join(configDir, 'projects')),
  };
}

function resolveAccountLaneSummary(
  kind: Extract<ResumeLaneKind, 'account-default' | 'account-inherited'>,
  accountName: string
): ResumeLaneSummary {
  const instanceMgr = new InstanceManager();
  const configDir = instanceMgr.getInstancePath(accountName);

  return {
    kind,
    label:
      kind === 'account-inherited'
        ? `plain ccs inherits from account "${accountName}"`
        : `plain ccs defaults to account "${accountName}"`,
    configDir,
    accountName,
    projectCount: countTopLevelProjectDirs(path.join(configDir, 'projects')),
  };
}

export async function resolveConfiguredPlainCcsResumeLane(): Promise<ResumeLaneSummary> {
  const detector = new ProfileDetector();
  const defaultProfile = detector.resolveDefaultProfileResult();

  if (defaultProfile.type === 'account') {
    return resolveAccountLaneSummary('account-default', defaultProfile.name);
  }

  const inheritedAccount = resolveConfiguredContinuitySourceAccount(
    defaultProfile.name,
    defaultProfile.type
  );
  if (inheritedAccount) {
    return resolveAccountLaneSummary('account-inherited', inheritedAccount);
  }

  if (defaultProfile.type !== 'default') {
    return resolveNativeLaneSummary('profile-default', defaultProfile.name);
  }

  return resolveNativeLaneSummary();
}

export async function resolveRuntimePlainCcsResumeLane(): Promise<ResumeLaneSummary> {
  if (process.env.CLAUDE_CONFIG_DIR) {
    const configDir = path.resolve(process.env.CLAUDE_CONFIG_DIR);
    return {
      kind: 'ambient',
      label: 'current shell CLAUDE_CONFIG_DIR',
      configDir,
      projectCount: countTopLevelProjectDirs(path.join(configDir, 'projects')),
    };
  }

  return resolveConfiguredPlainCcsResumeLane();
}

export function parseResumeFlagIntent(args: string[]): ResumeFlagIntent | null {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-r') {
      return { implicit: true };
    }

    if (arg === '--resume') {
      const next = args[index + 1];
      if (next && !next.startsWith('-')) {
        return { implicit: false, explicitSessionId: next };
      }
      return { implicit: true };
    }

    if (arg.startsWith('--resume=')) {
      const sessionId = arg.slice('--resume='.length).trim();
      return sessionId ? { implicit: false, explicitSessionId: sessionId } : { implicit: true };
    }
  }

  return null;
}

export function getAuthBackupRoot(): string {
  return path.join(getCcsDir(), 'backups', 'auth-continuity');
}

export function createTimestampStamp(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

export function getContinuityArtifactNames(profileType: ProfileType): string[] {
  const sharedItems = ['projects'];
  const deeperItems = ['session-env', 'file-history', 'shell-snapshots', 'todos'];

  if (profileType === 'default' || profileType === 'account') {
    return [...sharedItems, ...deeperItems];
  }

  return sharedItems;
}
