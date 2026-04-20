import { spawn, type ChildProcess } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as lockfile from 'proper-lockfile';
import { verifyProcessOwnership } from '../cursor/daemon-process-ownership';
import type { OpenAICompatProfileConfig } from './profile-router';
import {
  OPENAI_COMPAT_PROXY_DEFAULT_PORT,
  OPENAI_COMPAT_PROXY_SERVICE_NAME,
  getOpenAICompatProxyDir,
} from './proxy-daemon-paths';
import {
  getOpenAICompatProxyPid,
  listOpenAICompatProxyProfileNames,
  readOpenAICompatProxySession,
  cleanupLegacyOpenAICompatProxyState,
  removeOpenAICompatProxyPid,
  removeOpenAICompatProxySession,
  resolveOpenAICompatProxyEntrypointCandidates,
  type OpenAICompatProxySession,
  writeOpenAICompatProxyPid,
  writeOpenAICompatProxySession,
} from './proxy-daemon-state';
import { resolveOpenAICompatProxyPreferredPort } from './proxy-port-resolver';

export interface OpenAICompatProxyStatus extends Partial<OpenAICompatProxySession> {
  running: boolean;
  pid?: number;
}

export interface StartOpenAICompatProxyResult {
  success: boolean;
  alreadyRunning?: boolean;
  authToken?: string;
  pid?: number;
  port: number;
  error?: string;
}

function generateProxyAuthToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

async function withOpenAICompatProxyLock<T>(operation: () => Promise<T>): Promise<T> {
  const proxyDir = getOpenAICompatProxyDir();
  await fs.promises.mkdir(proxyDir, { recursive: true });

  let release: (() => Promise<void>) | undefined;
  try {
    release = await lockfile.lock(proxyDir, {
      stale: 10000,
      retries: { retries: 20, minTimeout: 50, maxTimeout: 250 },
      realpath: false,
    });
  } catch (error) {
    throw new Error(
      `Failed to lock OpenAI-compatible proxy directory (${proxyDir}): ${(error as Error).message}`
    );
  }

  try {
    return await operation();
  } finally {
    if (release) {
      try {
        await release();
      } catch {
        // Best-effort release.
      }
    }
  }
}

async function isPortOccupied(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (occupied: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(occupied);
    };

    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(500, () => {
      finish(false);
    });
  });
}

async function findOpenAICompatProxyPort(): Promise<number> {
  for (
    let candidate = OPENAI_COMPAT_PROXY_DEFAULT_PORT;
    candidate <= OPENAI_COMPAT_PROXY_DEFAULT_PORT + 10;
    candidate += 1
  ) {
    if (!(await isPortOccupied(candidate))) {
      return candidate;
    }
  }

  return 0;
}

async function findOpenAICompatProxyPortNear(preferredPort: number): Promise<number> {
  if (!(await isPortOccupied(preferredPort))) {
    return preferredPort;
  }
  return findOpenAICompatProxyPort();
}

async function resolveDaemonEntrypoint(): Promise<string | null> {
  for (const candidate of resolveOpenAICompatProxyEntrypointCandidates()) {
    try {
      await fs.promises.access(candidate, fs.constants.R_OK);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

export async function isOpenAICompatProxyRunning(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/health', method: 'GET', timeout: 3000 },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            resolve(false);
            return;
          }
          try {
            const payload = JSON.parse(body) as { service?: string };
            resolve(payload.service === OPENAI_COMPAT_PROXY_SERVICE_NAME);
          } catch {
            resolve(false);
          }
        });
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function getOpenAICompatProxyStatusForProfile(
  profileName: string
): Promise<OpenAICompatProxyStatus> {
  const session = readOpenAICompatProxySession(profileName);
  const port = session?.port ?? OPENAI_COMPAT_PROXY_DEFAULT_PORT;
  const running = await isOpenAICompatProxyRunning(port);
  return {
    running,
    pid: running ? getOpenAICompatProxyPid(profileName) || undefined : undefined,
    ...session,
  };
}

export async function listOpenAICompatProxyStatuses(): Promise<OpenAICompatProxyStatus[]> {
  const profileNames = listOpenAICompatProxyProfileNames();
  const statuses = await Promise.all(
    profileNames.map((profileName) => getOpenAICompatProxyStatusForProfile(profileName))
  );
  return statuses.filter((status) => status.profileName);
}

export async function getOpenAICompatProxyStatus(
  profileName?: string
): Promise<OpenAICompatProxyStatus> {
  if (profileName) {
    return getOpenAICompatProxyStatusForProfile(profileName);
  }

  const statuses = await listOpenAICompatProxyStatuses();
  const running = statuses.filter((status) => status.running);
  if (running.length === 1) {
    return running[0];
  }
  if (running.length > 1) {
    return { running: true };
  }
  const latestKnown = statuses[0];
  return latestKnown ?? { running: false };
}

async function stopOpenAICompatProxyUnlocked(
  profileName: string
): Promise<{ success: boolean; error?: string }> {
  const pid = getOpenAICompatProxyPid(profileName);
  if (!pid) {
    removeOpenAICompatProxySession(profileName);
    return { success: true };
  }

  const ownership = verifyProcessOwnership(
    pid,
    (commandLine) =>
      commandLine.includes('--ccs-openai-proxy-daemon') &&
      commandLine.includes('proxy-daemon-entry')
  );

  if (ownership === 'not-owned') {
    removeOpenAICompatProxyPid(profileName);
    removeOpenAICompatProxySession(profileName);
    return { success: true };
  }

  if (ownership === 'unknown') {
    return {
      success: false,
      error: `Refusing to stop PID ${pid}: unable to verify daemon ownership`,
    };
  }

  if (ownership === 'not-running') {
    removeOpenAICompatProxyPid(profileName);
    removeOpenAICompatProxySession(profileName);
    return { success: true };
  }

  try {
    process.kill(pid, 'SIGTERM');
    let attempts = 0;
    while (attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        process.kill(pid, 0);
        attempts += 1;
      } catch {
        break;
      }
    }

    if (attempts >= 10) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already exited.
      }
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ESRCH') {
      return { success: false, error: `Failed to stop daemon: ${err.message}` };
    }
  }

  removeOpenAICompatProxyPid(profileName);
  removeOpenAICompatProxySession(profileName);
  return { success: true };
}

export async function stopOpenAICompatProxy(
  profileName?: string
): Promise<{ success: boolean; error?: string }> {
  return withOpenAICompatProxyLock(async () => {
    cleanupLegacyOpenAICompatProxyState();
    if (profileName) {
      return stopOpenAICompatProxyUnlocked(profileName);
    }

    const statuses = await listOpenAICompatProxyStatuses();
    for (const status of statuses) {
      if (!status.profileName) {
        continue;
      }
      const stopped = await stopOpenAICompatProxyUnlocked(status.profileName);
      if (!stopped.success) {
        return stopped;
      }
    }
    return { success: true };
  });
}

export async function startOpenAICompatProxy(
  profile: OpenAICompatProfileConfig,
  options: { port?: number; host?: string; insecure?: boolean } = {}
): Promise<StartOpenAICompatProxyResult> {
  return withOpenAICompatProxyLock(async () => {
    cleanupLegacyOpenAICompatProxyState();
    const status = await getOpenAICompatProxyStatus(profile.profileName);
    const host = options.host?.trim() || status.host || '127.0.0.1';
    const preferredPort =
      typeof options.port === 'number'
        ? options.port
        : status.port || resolveOpenAICompatProxyPreferredPort(profile.profileName);
    const port =
      status.running && status.port && (status.host || '127.0.0.1') === host
        ? status.port
        : await findOpenAICompatProxyPortNear(preferredPort);
    if (port === 0) {
      return {
        success: false,
        port: preferredPort,
        error: `No free proxy port found in range ${OPENAI_COMPAT_PROXY_DEFAULT_PORT}-${OPENAI_COMPAT_PROXY_DEFAULT_PORT + 10}`,
      };
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return { success: false, port, error: `Invalid port: ${port}` };
    }
    if (status.running && status.port === port && (status.host || '127.0.0.1') === host) {
      return {
        success: true,
        alreadyRunning: true,
        pid: status.pid,
        port,
        authToken: status.authToken,
      };
    }
    if (status.running) {
      const stopped = await stopOpenAICompatProxyUnlocked(profile.profileName);
      if (!stopped.success) {
        return {
          success: false,
          port,
          error: stopped.error || 'Failed to restart the running proxy',
        };
      }
    }

    const daemonEntry = await resolveDaemonEntrypoint();
    if (!daemonEntry) {
      return {
        success: false,
        port,
        error: 'OpenAI proxy daemon entrypoint not found. Run `bun run build` and retry.',
      };
    }

    return new Promise((resolve) => {
      let resolved = false;
      let timeout: NodeJS.Timeout | null = null;
      const authToken = generateProxyAuthToken();

      const finish = (result: StartOpenAICompatProxyResult) => {
        if (resolved) return;
        resolved = true;
        if (timeout) clearTimeout(timeout);
        if (!result.success) {
          removeOpenAICompatProxyPid(profile.profileName);
          removeOpenAICompatProxySession(profile.profileName);
        }
        resolve(result);
      };

      const proc: ChildProcess = spawn(
        process.execPath,
        [
          daemonEntry,
          '--port',
          String(port),
          '--host',
          host,
          '--profile',
          profile.profileName,
          '--settings-path',
          profile.settingsPath,
          '--auth-token',
          authToken,
          ...(options.insecure ? ['--insecure'] : []),
          '--ccs-openai-proxy-daemon',
        ],
        { stdio: 'ignore', detached: true }
      );

      proc.unref();
      if (proc.pid) {
        writeOpenAICompatProxyPid(profile.profileName, proc.pid);
      }
      writeOpenAICompatProxySession({
        profileName: profile.profileName,
        settingsPath: profile.settingsPath,
        host,
        port,
        baseUrl: profile.baseUrl,
        authToken,
        model: profile.model,
        insecure: options.insecure,
      });

      let attempts = 0;
      const poll = async () => {
        attempts += 1;
        if (await isOpenAICompatProxyRunning(port)) {
          finish({ success: true, pid: proc.pid, port, authToken });
          return;
        }
        if (attempts >= 30) {
          finish({
            success: false,
            port,
            error: `Proxy daemon did not start within 30 seconds on port ${port}`,
          });
          return;
        }
        timeout = setTimeout(poll, 1000);
      };

      timeout = setTimeout(poll, 1000);
      proc.on('error', (error) => {
        finish({ success: false, port, error: error.message });
      });
      proc.on('exit', (code, signal) => {
        if (code === 0) {
          finish({
            success: false,
            port,
            error: 'Proxy daemon exited before becoming healthy',
          });
          return;
        }
        if (code !== null) {
          finish({
            success: false,
            port,
            error: `Proxy daemon exited with code ${code}`,
          });
          return;
        }
        finish({
          success: false,
          port,
          error: `Proxy daemon was killed by signal ${signal}`,
        });
      });
    });
  });
}
