/**
 * Session Tracker Port-Specific Tests
 *
 * Tests for per-port session tracking in session-tracker.ts.
 * Verifies port-specific session files (sessions-{port}.json) and cleanup.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Set test isolation environment before importing
const testHome = path.join(
  os.tmpdir(),
  `ccs-test-session-port-${Date.now()}-${Math.random().toString(36).slice(2)}`
);
const originalCcsHome = process.env.CCS_HOME;
const originalCcsDir = process.env.CCS_DIR;
process.env.CCS_HOME = testHome;
delete process.env.CCS_DIR;

const {
  getExistingProxy,
  registerSession,
  unregisterSession,
  cleanupOrphanedSessions,
  stopProxy,
  getProxyStatus,
  getSessionLockPath,
  deleteSessionLockForPort,
} = require('../../../dist/cliproxy/session-tracker');
const { CLIPROXY_DEFAULT_PORT } = require('../../../dist/cliproxy/config-generator');
const { setGlobalConfigDir } = require('../../../dist/utils/config-manager');

describe('Session Tracker Port-Specific', function () {
  const variantPort1 = 8318;
  const variantPort2 = 8319;
  let cliproxyDir;

  beforeEach(function () {
    // Reassert test isolation because other files mutate CCS_DIR/CCS_HOME in the same Bun process.
    process.env.CCS_HOME = testHome;
    delete process.env.CCS_DIR;
    setGlobalConfigDir(undefined);

    // Create test directories
    cliproxyDir = path.join(testHome, '.ccs', 'cliproxy');
    fs.mkdirSync(cliproxyDir, { recursive: true });

    // Clean up any existing session files
    const files = fs.readdirSync(cliproxyDir);
    for (const file of files) {
      if (file.startsWith('sessions')) {
        fs.unlinkSync(path.join(cliproxyDir, file));
      }
    }
  });

  afterEach(function () {
    setGlobalConfigDir(undefined);

    // Clean up session files
    try {
      const files = fs.readdirSync(cliproxyDir);
      for (const file of files) {
        if (file.startsWith('sessions')) {
          fs.unlinkSync(path.join(cliproxyDir, file));
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  afterAll(function () {
    // Clean up test directory
    try {
      fs.rmSync(testHome, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
    else delete process.env.CCS_HOME;
    if (originalCcsDir !== undefined) process.env.CCS_DIR = originalCcsDir;
    else delete process.env.CCS_DIR;
    setGlobalConfigDir(undefined);
  });

  describe('Session Lock Path', function () {
    it('returns sessions.json for default port', function () {
      const lockPath = getSessionLockPath();
      assert.ok(lockPath.endsWith('sessions.json'));
      assert.ok(!lockPath.includes('sessions-'));
    });
  });

  describe('Port-Specific Session Files', function () {
    it('creates sessions-{port}.json for variant ports', function () {
      registerSession(variantPort1, process.pid);

      const lockPath = path.join(cliproxyDir, `sessions-${variantPort1}.json`);
      assert.ok(fs.existsSync(lockPath), `Should create sessions-${variantPort1}.json`);
    });

    it('creates sessions.json for default port', function () {
      registerSession(CLIPROXY_DEFAULT_PORT, process.pid);

      const lockPath = path.join(cliproxyDir, 'sessions.json');
      assert.ok(fs.existsSync(lockPath), 'Should create sessions.json for default port');
    });

    it('keeps separate session files for different ports', function () {
      // Register sessions on different ports
      registerSession(variantPort1, process.pid);
      registerSession(variantPort2, process.pid);
      registerSession(CLIPROXY_DEFAULT_PORT, process.pid);

      // All three should exist
      assert.ok(
        fs.existsSync(path.join(cliproxyDir, `sessions-${variantPort1}.json`)),
        'Should have port 8318 sessions'
      );
      assert.ok(
        fs.existsSync(path.join(cliproxyDir, `sessions-${variantPort2}.json`)),
        'Should have port 8319 sessions'
      );
      assert.ok(
        fs.existsSync(path.join(cliproxyDir, 'sessions.json')),
        'Should have default port sessions'
      );
    });
  });

  describe('registerSession with Port', function () {
    it('stores correct port in session lock file', function () {
      registerSession(variantPort1, process.pid);

      const lockPath = path.join(cliproxyDir, `sessions-${variantPort1}.json`);
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));

      assert.strictEqual(lock.port, variantPort1);
    });

    it('stores correct PID in session lock file', function () {
      registerSession(variantPort1, process.pid);

      const lockPath = path.join(cliproxyDir, `sessions-${variantPort1}.json`);
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));

      assert.strictEqual(lock.pid, process.pid);
    });

    it('appends to existing sessions array for same port', function () {
      const session1 = registerSession(variantPort1, process.pid);
      const session2 = registerSession(variantPort1, process.pid);

      const lockPath = path.join(cliproxyDir, `sessions-${variantPort1}.json`);
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));

      assert.strictEqual(lock.sessions.length, 2);
      assert.ok(lock.sessions.includes(session1));
      assert.ok(lock.sessions.includes(session2));
    });
  });

  describe('unregisterSession with Port', function () {
    it('removes session from port-specific file', function () {
      const session1 = registerSession(variantPort1, process.pid);
      const session2 = registerSession(variantPort1, process.pid);

      // Unregister first session with port
      unregisterSession(session1, variantPort1);

      const lockPath = path.join(cliproxyDir, `sessions-${variantPort1}.json`);
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));

      assert.strictEqual(lock.sessions.length, 1);
      assert.strictEqual(lock.sessions[0], session2);
    });

    it('deletes lock file when last session removed', function () {
      const session = registerSession(variantPort1, process.pid);

      const shouldKill = unregisterSession(session, variantPort1);

      assert.strictEqual(shouldKill, true);
      const lockPath = path.join(cliproxyDir, `sessions-${variantPort1}.json`);
      assert.strictEqual(fs.existsSync(lockPath), false);
    });

    it('returns true when last session', function () {
      const session = registerSession(variantPort1, process.pid);
      const shouldKill = unregisterSession(session, variantPort1);
      assert.strictEqual(shouldKill, true);
    });

    it('returns false when sessions remain', function () {
      const session1 = registerSession(variantPort1, process.pid);
      registerSession(variantPort1, process.pid);

      const shouldKill = unregisterSession(session1, variantPort1);
      assert.strictEqual(shouldKill, false);
    });

    it('searches default port for backward compat (fallback)', function () {
      // Register on default port
      const session = registerSession(CLIPROXY_DEFAULT_PORT, process.pid);

      // Unregister without port (should search default)
      const shouldKill = unregisterSession(session);

      assert.strictEqual(shouldKill, true);
      const lockPath = path.join(cliproxyDir, 'sessions.json');
      assert.strictEqual(fs.existsSync(lockPath), false);
    });
  });

  describe('getExistingProxy with Port', function () {
    it('returns lock for running proxy on specified port', function () {
      registerSession(variantPort1, process.pid);

      const lock = getExistingProxy(variantPort1);
      assert.notStrictEqual(lock, null);
      assert.strictEqual(lock.port, variantPort1);
      assert.strictEqual(lock.pid, process.pid);
    });

    it('returns null if lock file missing', function () {
      const lock = getExistingProxy(variantPort1);
      assert.strictEqual(lock, null);
    });

    it('returns null if port mismatch', function () {
      // Create lock with different port number in file
      const lockPath = path.join(cliproxyDir, `sessions-${variantPort1}.json`);
      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          port: 9999, // Wrong port
          pid: process.pid,
          sessions: ['session1'],
          startedAt: new Date().toISOString(),
        })
      );

      const lock = getExistingProxy(variantPort1);
      assert.strictEqual(lock, null);
    });

    it('cleans up stale lock if PID not running', function () {
      // Create lock with dead PID
      const lockPath = path.join(cliproxyDir, `sessions-${variantPort1}.json`);
      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          port: variantPort1,
          pid: 999999999, // Dead PID
          sessions: ['session1'],
          startedAt: new Date().toISOString(),
        })
      );

      const lock = getExistingProxy(variantPort1);
      assert.strictEqual(lock, null);
      assert.strictEqual(fs.existsSync(lockPath), false);
    });
  });

  describe('deleteSessionLockForPort', function () {
    it('removes sessions-{port}.json for specified port', function () {
      registerSession(variantPort1, process.pid);
      const lockPath = path.join(cliproxyDir, `sessions-${variantPort1}.json`);
      assert.ok(fs.existsSync(lockPath));

      deleteSessionLockForPort(variantPort1);
      assert.strictEqual(fs.existsSync(lockPath), false);
    });

    it('does nothing if file does not exist', function () {
      // Should not throw
      deleteSessionLockForPort(variantPort1);
    });

    it('does not affect other port sessions', function () {
      registerSession(variantPort1, process.pid);
      registerSession(variantPort2, process.pid);

      deleteSessionLockForPort(variantPort1);

      const lock1Path = path.join(cliproxyDir, `sessions-${variantPort1}.json`);
      const lock2Path = path.join(cliproxyDir, `sessions-${variantPort2}.json`);

      assert.strictEqual(fs.existsSync(lock1Path), false);
      assert.ok(fs.existsSync(lock2Path));
    });
  });

  describe('cleanupOrphanedSessions with Port', function () {
    it('deletes lock if PID not running', function () {
      const lockPath = path.join(cliproxyDir, `sessions-${variantPort1}.json`);
      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          port: variantPort1,
          pid: 999999999, // Dead PID
          sessions: ['session1'],
          startedAt: new Date().toISOString(),
        })
      );

      cleanupOrphanedSessions(variantPort1);
      assert.strictEqual(fs.existsSync(lockPath), false);
    });

    it('keeps lock if PID still running', function () {
      const lockPath = path.join(cliproxyDir, `sessions-${variantPort1}.json`);
      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          port: variantPort1,
          pid: process.pid, // Our process - running
          sessions: ['session1'],
          startedAt: new Date().toISOString(),
        })
      );

      cleanupOrphanedSessions(variantPort1);
      assert.ok(fs.existsSync(lockPath));
    });
  });

  describe('stopProxy with Port', function () {
    it('stops proxy on specified port', async function () {
      // Create lock with dead PID (we can't actually stop a real process in tests)
      const lockPath = path.join(cliproxyDir, `sessions-${variantPort1}.json`);
      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          port: variantPort1,
          pid: 999999999, // Dead PID
          sessions: ['session1'],
          startedAt: new Date().toISOString(),
        })
      );

      const result = await stopProxy(variantPort1);
      assert.strictEqual(result.stopped, false);
      assert.ok(result.error.includes('not running'));
    });

    it('cleans up session lock after stop', async function () {
      const lockPath = path.join(cliproxyDir, `sessions-${variantPort1}.json`);
      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          port: variantPort1,
          pid: 999999999, // Dead PID
          sessions: ['session1'],
          startedAt: new Date().toISOString(),
        })
      );

      await stopProxy(variantPort1);
      assert.strictEqual(fs.existsSync(lockPath), false);
    });

    it('handles already-stopped proxy gracefully', async function () {
      const result = await stopProxy(variantPort1);
      assert.strictEqual(result.stopped, false);
      assert.strictEqual(result.error, 'No active CLIProxy session found');
    });
  });

  describe('getProxyStatus with Port', function () {
    it('returns correct status for variant port', function () {
      registerSession(variantPort1, process.pid);

      const status = getProxyStatus(variantPort1);
      assert.strictEqual(status.running, true);
      assert.strictEqual(status.port, variantPort1);
      assert.strictEqual(status.pid, process.pid);
      assert.strictEqual(status.sessionCount, 1);
    });

    it('returns not running for empty variant port', function () {
      const status = getProxyStatus(variantPort1);
      assert.strictEqual(status.running, false);
    });
  });

  describe('Concurrent Variant Sessions', function () {
    it('manages multiple variant ports independently', function () {
      // Start sessions on different ports
      const session1 = registerSession(variantPort1, process.pid);
      const session2 = registerSession(variantPort2, process.pid);

      // Both should be tracked
      assert.strictEqual(getProxyStatus(variantPort1).running, true);
      assert.strictEqual(getProxyStatus(variantPort2).running, true);

      // Unregister one should not affect other
      unregisterSession(session1, variantPort1);

      assert.strictEqual(getProxyStatus(variantPort1).running, false);
      assert.strictEqual(getProxyStatus(variantPort2).running, true);

      // Clean up
      unregisterSession(session2, variantPort2);
    });

    it('allows same session workflow on different ports', function () {
      // Simulate concurrent variant usage
      const port1Session1 = registerSession(variantPort1, process.pid);
      const port1Session2 = registerSession(variantPort1, process.pid);
      const port2Session1 = registerSession(variantPort2, process.pid);

      assert.strictEqual(getProxyStatus(variantPort1).sessionCount, 2);
      assert.strictEqual(getProxyStatus(variantPort2).sessionCount, 1);

      // Unregister from port1
      const shouldKill1 = unregisterSession(port1Session1, variantPort1);
      assert.strictEqual(shouldKill1, false); // Still has session2

      const shouldKill2 = unregisterSession(port1Session2, variantPort1);
      assert.strictEqual(shouldKill2, true); // Last session on port1

      // Port2 should still be running
      assert.strictEqual(getProxyStatus(variantPort2).running, true);

      // Clean up
      unregisterSession(port2Session1, variantPort2);
    });
  });
});
