import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';

const REPO_ROOT = path.resolve(import.meta.dir, '../../..');
const SESSION_TRACKER_URL = pathToFileURL(
  path.join(REPO_ROOT, 'src/cliproxy/session-tracker.ts')
).href;

function withScopedSessionTrackerHome<T>(run: (tempHome: string) => T): T {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-session-target-test-'));
  try {
    return run(tempHome);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

function runSessionTrackerScenario(
  tempHome: string,
  targets: string[]
): {
  running: boolean;
  target?: string;
  sessionCount?: number;
} {
  const script = `
    import {
      registerSession,
      unregisterSession,
      getProxyStatus,
    } from ${JSON.stringify(SESSION_TRACKER_URL)};

    const port = 28317;
    const sessionIds = [];
    for (const target of ${JSON.stringify(targets)}) {
      sessionIds.push(registerSession(port, process.pid, undefined, undefined, target));
    }

    const status = getProxyStatus(port);
    for (const sessionId of sessionIds) {
      unregisterSession(sessionId, port);
    }

    console.log(JSON.stringify({
      running: status.running,
      target: status.target ?? null,
      sessionCount: status.sessionCount ?? null,
    }));
  `;

  const scriptPath = path.join(tempHome, `session-target-child-${Date.now()}.mjs`);
  fs.writeFileSync(scriptPath, script, 'utf8');

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      CCS_HOME: tempHome,
      CCS_DIR: '',
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    throw new Error(
      `child session-tracker scenario failed: ${JSON.stringify({
        command: `${process.execPath} ${scriptPath}`,
        status: result.status,
        signal: result.signal,
        error: result.error?.message ?? null,
        stdout: result.stdout,
        stderr: result.stderr,
      })}`
    );
  }

  const lines = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return JSON.parse(lines.at(-1) || '{}') as {
    running: boolean;
    target?: string;
    sessionCount?: number;
  };
}

describe('session-tracker target metadata', () => {
  it('returns single target when all sessions share same target', () => {
    withScopedSessionTrackerHome((tempHome) => {
      const status = runSessionTrackerScenario(tempHome, ['droid', 'droid']);
      expect(status.running).toBe(true);
      expect(status.target).toBe('droid');
      expect(status.sessionCount).toBe(2);
    });
  });

  it('returns mixed when active sessions use different targets', () => {
    withScopedSessionTrackerHome((tempHome) => {
      const status = runSessionTrackerScenario(tempHome, ['claude', 'droid']);
      expect(status.running).toBe(true);
      expect(status.target).toBe('mixed');
      expect(status.sessionCount).toBe(2);
    });
  });
});
