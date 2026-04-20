import * as fs from 'fs';
import * as path from 'path';
import {
  getOpenAICompatProxyDir,
  getLegacyOpenAICompatProxyPidPath,
  getLegacyOpenAICompatProxySessionPath,
  getOpenAICompatProxyPidPath,
  getOpenAICompatProxySessionPath,
} from './proxy-daemon-paths';

export interface OpenAICompatProxySession {
  profileName: string;
  settingsPath: string;
  host: string;
  port: number;
  baseUrl: string;
  authToken: string;
  model?: string;
  insecure?: boolean;
}

function ensureProxyDir(): void {
  fs.mkdirSync(getOpenAICompatProxyDir(), { recursive: true });
}

function readPid(pidPath: string): number | null {
  try {
    const raw = fs.readFileSync(pidPath, 'utf8').trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

export function getOpenAICompatProxyPid(profileName: string): number | null {
  return readPid(getOpenAICompatProxyPidPath(profileName));
}

export function getLegacyOpenAICompatProxyPid(): number | null {
  return readPid(getLegacyOpenAICompatProxyPidPath());
}

export function writeOpenAICompatProxyPid(profileName: string, pid: number): void {
  ensureProxyDir();
  fs.writeFileSync(getOpenAICompatProxyPidPath(profileName), String(pid), 'utf8');
}

export function removeOpenAICompatProxyPid(profileName: string): void {
  try {
    fs.unlinkSync(getOpenAICompatProxyPidPath(profileName));
  } catch {
    // Best-effort cleanup.
  }
}

export function removeLegacyOpenAICompatProxyPid(): void {
  try {
    fs.unlinkSync(getLegacyOpenAICompatProxyPidPath());
  } catch {
    // Best-effort cleanup.
  }
}

function readSession(sessionPath: string): OpenAICompatProxySession | null {
  try {
    return JSON.parse(fs.readFileSync(sessionPath, 'utf8')) as OpenAICompatProxySession;
  } catch {
    return null;
  }
}

export function readOpenAICompatProxySession(profileName: string): OpenAICompatProxySession | null {
  return readSession(getOpenAICompatProxySessionPath(profileName));
}

export function readLegacyOpenAICompatProxySession(): OpenAICompatProxySession | null {
  return readSession(getLegacyOpenAICompatProxySessionPath());
}

export function writeOpenAICompatProxySession(session: OpenAICompatProxySession): void {
  ensureProxyDir();
  fs.writeFileSync(
    getOpenAICompatProxySessionPath(session.profileName),
    JSON.stringify(session, null, 2) + '\n',
    'utf8'
  );
}

export function removeOpenAICompatProxySession(profileName: string): void {
  try {
    fs.unlinkSync(getOpenAICompatProxySessionPath(profileName));
  } catch {
    // Best-effort cleanup.
  }
}

export function removeLegacyOpenAICompatProxySession(): void {
  try {
    fs.unlinkSync(getLegacyOpenAICompatProxySessionPath());
  } catch {
    // Best-effort cleanup.
  }
}

export function listOpenAICompatProxyProfileNames(): string[] {
  try {
    const entries = fs.readdirSync(getOpenAICompatProxyDir(), { withFileTypes: true });
    const profileKeys = new Set<string>();
    for (const entry of entries) {
      if (
        !entry.isFile() ||
        entry.name === 'session.json' ||
        !entry.name.endsWith('.session.json')
      ) {
        continue;
      }
      const profileKey = entry.name.slice(0, -'.session.json'.length);
      if (!profileKey) {
        continue;
      }
      profileKeys.add(profileKey);
    }
    return [...profileKeys].map((profileKey) => decodeURIComponent(profileKey));
  } catch {
    return [];
  }
}

export function resolveOpenAICompatProxyEntrypointCandidates(): string[] {
  const jsEntry = path.join(__dirname, 'proxy-daemon-entry.js');
  const tsEntry = path.join(__dirname, 'proxy-daemon-entry.ts');
  const isBunRuntime = process.execPath.toLowerCase().includes('bun');
  const runningFromDist = __filename.endsWith('.js');
  if (runningFromDist) {
    return [jsEntry];
  }
  return isBunRuntime ? [tsEntry, jsEntry] : [jsEntry];
}
