/**
 * Variant Port Isolation Integration Tests
 *
 * Tests for PR #184: feat(cliproxy): add variant port isolation
 * Maps directly to the PR test plan:
 * - [x] Create multiple variants with `ccs cliproxy create`
 * - [x] Verify each variant gets unique port in config
 * - [x] Run multiple variants concurrently
 * - [x] Verify `ccs cliproxy list` shows port column
 * - [x] Remove variant and verify cleanup of port-specific files
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Set test isolation environment before importing
const testHome = path.join(
  os.tmpdir(),
  `ccs-test-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`
);
process.env.CCS_HOME = testHome;

const {
  getNextAvailablePort,
  VARIANT_PORT_BASE,
  VARIANT_PORT_MAX_OFFSET,
  listVariantsFromConfig,
  saveVariantLegacy,
  removeVariantFromLegacyConfig,
} = require('../../../../dist/cliproxy/services/variant-config-adapter');
const {
  getExistingProxy,
  registerSession,
  unregisterSession,
  getProxyStatus,
  deleteSessionLockForPort,
} = require('../../../../dist/cliproxy/session-tracker');
const {
  generateConfig,
  configExists,
  deleteConfigForPort,
  getConfigPathForPort,
  CLIPROXY_DEFAULT_PORT,
} = require('../../../../dist/cliproxy/config/config-generator');

describe('PR #184: Variant Port Isolation Integration', function () {
  let configPath;
  let cliproxyDir;
  let ccsDir;

  beforeEach(function () {
    // Create test directories
    ccsDir = path.join(testHome, '.ccs');
    cliproxyDir = path.join(ccsDir, 'cliproxy');
    fs.mkdirSync(cliproxyDir, { recursive: true });
    configPath = path.join(ccsDir, 'config.json');

    // Start with empty config
    fs.writeFileSync(configPath, JSON.stringify({ profiles: {} }));
  });

  afterEach(function () {
    // Clean up all test files
    try {
      if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
      const files = fs.readdirSync(cliproxyDir);
      for (const file of files) {
        fs.unlinkSync(path.join(cliproxyDir, file));
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  afterAll(function () {
    try {
      fs.rmSync(testHome, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    delete process.env.CCS_HOME;
  });

  // ==========================================================================
  // PR Test Plan: Create multiple variants with ccs cliproxy create
  // ==========================================================================
  describe('Test Plan: Create multiple variants', function () {
    it('creates 3 variants with unique ports via createVariant flow', function () {
      const variants = [];

      for (let i = 0; i < 3; i++) {
        const port = getNextAvailablePort();
        const settingsPath = path.join(ccsDir, `variant${i}.settings.json`);
        fs.writeFileSync(settingsPath, JSON.stringify({ env: { VARIANT_ID: i } }));
        saveVariantLegacy(`variant${i}`, 'gemini', settingsPath, undefined, port);
        generateConfig('gemini', port);
        variants.push({ name: `variant${i}`, port });
      }

      // Verify all variants created
      const storedVariants = listVariantsFromConfig();
      assert.strictEqual(Object.keys(storedVariants).length, 3);

      // Verify unique ports
      const ports = variants.map((v) => v.port);
      const uniquePorts = new Set(ports);
      assert.strictEqual(uniquePorts.size, 3, 'All variants should have unique ports');

      // Verify sequential port assignment
      assert.strictEqual(variants[0].port, VARIANT_PORT_BASE);
      assert.strictEqual(variants[1].port, VARIANT_PORT_BASE + 1);
      assert.strictEqual(variants[2].port, VARIANT_PORT_BASE + 2);
    });

    it('handles maximum variant creation (100 variants)', function () {
      // Create 100 variants
      for (let i = 0; i < 100; i++) {
        const port = getNextAvailablePort();
        const settingsPath = path.join(ccsDir, `variant${i}.settings.json`);
        fs.writeFileSync(settingsPath, JSON.stringify({ env: {} }));
        saveVariantLegacy(`variant${i}`, 'gemini', settingsPath, undefined, port);
      }

      // Verify 100 variants exist
      const storedVariants = listVariantsFromConfig();
      assert.strictEqual(Object.keys(storedVariants).length, 100);

      // Verify port exhaustion error
      assert.throws(
        () => getNextAvailablePort(),
        /Port limit reached.*100\/100/,
        'Should throw port limit error'
      );
    });
  });

  // ==========================================================================
  // PR Test Plan: Verify each variant gets unique port in config
  // ==========================================================================
  describe('Test Plan: Verify unique port in config', function () {
    it('each variant has port stored in config', function () {
      for (let i = 0; i < 5; i++) {
        const port = getNextAvailablePort();
        const settingsPath = path.join(ccsDir, `variant${i}.settings.json`);
        fs.writeFileSync(settingsPath, JSON.stringify({ env: {} }));
        saveVariantLegacy(`variant${i}`, 'gemini', settingsPath, undefined, port);
      }

      const variants = listVariantsFromConfig();
      for (let i = 0; i < 5; i++) {
        assert.strictEqual(
          variants[`variant${i}`].port,
          VARIANT_PORT_BASE + i,
          `Variant ${i} should have port ${VARIANT_PORT_BASE + i}`
        );
      }
    });

    it('port persists across config reload', function () {
      const port = getNextAvailablePort();
      const settingsPath = path.join(ccsDir, 'persistent.settings.json');
      fs.writeFileSync(settingsPath, JSON.stringify({ env: {} }));
      saveVariantLegacy('persistent', 'gemini', settingsPath, undefined, port);

      // Simulate reload by reading config directly
      const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      assert.strictEqual(rawConfig.cliproxy.persistent.port, port);

      // Verify via listVariantsFromConfig
      const variants = listVariantsFromConfig();
      assert.strictEqual(variants.persistent.port, port);
    });

    it('port-specific config.yaml has correct port value', function () {
      const port = 8320;
      generateConfig('gemini', port);

      const configContent = fs.readFileSync(getConfigPathForPort(port), 'utf-8');
      assert.ok(configContent.includes(`port: ${port}`), 'Config should contain correct port');
    });

    it('different ports have different config files', function () {
      const ports = [8318, 8319, 8320];

      for (const port of ports) {
        generateConfig('gemini', port);
      }

      // Verify each has separate file
      assert.ok(fs.existsSync(path.join(cliproxyDir, 'config-8318.yaml')));
      assert.ok(fs.existsSync(path.join(cliproxyDir, 'config-8319.yaml')));
      assert.ok(fs.existsSync(path.join(cliproxyDir, 'config-8320.yaml')));

      // Verify each has correct port in content
      for (const port of ports) {
        const content = fs.readFileSync(getConfigPathForPort(port), 'utf-8');
        assert.ok(content.includes(`port: ${port}`));
      }
    });
  });

  // ==========================================================================
  // PR Test Plan: Run multiple variants concurrently
  // ==========================================================================
  describe('Test Plan: Run multiple variants concurrently', function () {
    it('registers sessions on 3 different ports simultaneously', function () {
      const ports = [8318, 8319, 8320];
      const sessions = [];

      // Start all 3 variants "concurrently"
      for (const port of ports) {
        generateConfig('gemini', port);
        const sessionId = registerSession(port, process.pid);
        sessions.push({ port, sessionId });
      }

      // Verify all 3 are running
      for (const { port } of sessions) {
        const status = getProxyStatus(port);
        assert.strictEqual(status.running, true, `Port ${port} should be running`);
        assert.strictEqual(status.port, port);
        assert.strictEqual(status.sessionCount, 1);
      }

      // Verify separate session files exist
      for (const port of ports) {
        const sessionPath = path.join(cliproxyDir, `sessions-${port}.json`);
        assert.ok(fs.existsSync(sessionPath), `Session file for port ${port} should exist`);
      }

      // Clean up
      for (const { sessionId, port } of sessions) {
        unregisterSession(sessionId, port);
      }
    });

    it('concurrent sessions on same variant port accumulate', function () {
      const port = 8318;
      generateConfig('gemini', port);

      const session1 = registerSession(port, process.pid);
      const session2 = registerSession(port, process.pid);
      const session3 = registerSession(port, process.pid);

      const status = getProxyStatus(port);
      assert.strictEqual(status.sessionCount, 3);

      // Unregister one by one
      unregisterSession(session1, port);
      assert.strictEqual(getProxyStatus(port).sessionCount, 2);

      unregisterSession(session2, port);
      assert.strictEqual(getProxyStatus(port).sessionCount, 1);

      unregisterSession(session3, port);
      assert.strictEqual(getProxyStatus(port).running, false);
    });

    it('stopping one variant does not affect others', function () {
      const ports = [8318, 8319, 8320];

      for (const port of ports) {
        generateConfig('gemini', port);
        registerSession(port, process.pid);
      }

      // Stop middle variant
      deleteSessionLockForPort(8319);

      // Verify others still running
      assert.strictEqual(getProxyStatus(8318).running, true);
      assert.strictEqual(getProxyStatus(8319).running, false);
      assert.strictEqual(getProxyStatus(8320).running, true);

      // Clean up remaining
      deleteSessionLockForPort(8318);
      deleteSessionLockForPort(8320);
    });

    it('each variant has isolated session tracking', function () {
      // Create 2 variants
      const port1 = 8318;
      const port2 = 8319;

      generateConfig('gemini', port1);
      generateConfig('gemini', port2);

      // Register different session counts
      const p1s1 = registerSession(port1, process.pid);
      const p1s2 = registerSession(port1, process.pid);
      const p2s1 = registerSession(port2, process.pid);

      assert.strictEqual(getProxyStatus(port1).sessionCount, 2);
      assert.strictEqual(getProxyStatus(port2).sessionCount, 1);

      // Unregister from port1 - should not affect port2
      unregisterSession(p1s1, port1);
      assert.strictEqual(getProxyStatus(port1).sessionCount, 1);
      assert.strictEqual(getProxyStatus(port2).sessionCount, 1);

      // Clean up
      unregisterSession(p1s2, port1);
      unregisterSession(p2s1, port2);
    });
  });

  // ==========================================================================
  // PR Test Plan: Verify ccs cliproxy list shows port column
  // ==========================================================================
  describe('Test Plan: Verify list shows port column', function () {
    it('listVariantsFromConfig returns port for each variant', function () {
      for (let i = 0; i < 3; i++) {
        const port = getNextAvailablePort();
        const settingsPath = path.join(ccsDir, `variant${i}.settings.json`);
        fs.writeFileSync(settingsPath, JSON.stringify({ env: {} }));
        saveVariantLegacy(`variant${i}`, 'gemini', settingsPath, undefined, port);
      }

      const variants = listVariantsFromConfig();

      // Verify port field exists and is correct for each
      assert.strictEqual(variants.variant0.port, 8318);
      assert.strictEqual(variants.variant1.port, 8319);
      assert.strictEqual(variants.variant2.port, 8320);
    });

    it('legacy variants without port return undefined', function () {
      // Create legacy variant without port field
      const config = {
        profiles: {},
        cliproxy: {
          legacy_variant: {
            provider: 'gemini',
            settings: '/path/to/settings.json',
            // No port field
          },
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(config));

      const variants = listVariantsFromConfig();
      assert.strictEqual(variants.legacy_variant.port, undefined);
      assert.strictEqual(variants.legacy_variant.provider, 'gemini');
    });

    it('mixed legacy and modern variants show correct ports', function () {
      const config = {
        profiles: {},
        cliproxy: {
          legacy: {
            provider: 'gemini',
            settings: '/path/to/legacy.json',
            // No port
          },
          modern: {
            provider: 'codex',
            settings: '/path/to/modern.json',
            port: 8318,
          },
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(config));

      const variants = listVariantsFromConfig();
      assert.strictEqual(variants.legacy.port, undefined);
      assert.strictEqual(variants.modern.port, 8318);
    });
  });

  // ==========================================================================
  // PR Test Plan: Remove variant and verify cleanup of port-specific files
  // ==========================================================================
  describe('Test Plan: Remove variant and verify cleanup', function () {
    it('removes variant config entry', function () {
      const port = getNextAvailablePort();
      const settingsPath = path.join(ccsDir, 'to-remove.settings.json');
      fs.writeFileSync(settingsPath, JSON.stringify({ env: {} }));
      saveVariantLegacy('to-remove', 'gemini', settingsPath, undefined, port);

      // Verify exists
      let variants = listVariantsFromConfig();
      assert.ok('to-remove' in variants);

      // Remove
      const removed = removeVariantFromLegacyConfig('to-remove');
      assert.strictEqual(removed.port, port);

      // Verify gone
      variants = listVariantsFromConfig();
      assert.ok(!('to-remove' in variants));
    });

    it('deleteConfigForPort removes config-{port}.yaml', function () {
      const port = 8318;
      generateConfig('gemini', port);
      assert.ok(configExists(port));

      deleteConfigForPort(port);
      assert.strictEqual(configExists(port), false);
    });

    it('deleteSessionLockForPort removes sessions-{port}.json', function () {
      const port = 8318;
      registerSession(port, process.pid);

      const sessionPath = path.join(cliproxyDir, `sessions-${port}.json`);
      assert.ok(fs.existsSync(sessionPath));

      deleteSessionLockForPort(port);
      assert.strictEqual(fs.existsSync(sessionPath), false);
    });

    it('full variant removal cleans config, session, and config files', function () {
      const port = 8318;
      const settingsPath = path.join(ccsDir, 'full-cleanup.settings.json');

      // Create variant with all files
      fs.writeFileSync(settingsPath, JSON.stringify({ env: {} }));
      saveVariantLegacy('full-cleanup', 'gemini', settingsPath, undefined, port);
      generateConfig('gemini', port);
      registerSession(port, process.pid);

      // Verify all files exist
      assert.ok(listVariantsFromConfig()['full-cleanup']);
      assert.ok(configExists(port));
      assert.ok(fs.existsSync(path.join(cliproxyDir, `sessions-${port}.json`)));

      // Full cleanup (simulating removeVariant behavior)
      removeVariantFromLegacyConfig('full-cleanup');
      deleteConfigForPort(port);
      deleteSessionLockForPort(port);

      // Verify all cleaned
      assert.ok(!listVariantsFromConfig()['full-cleanup']);
      assert.strictEqual(configExists(port), false);
      assert.strictEqual(fs.existsSync(path.join(cliproxyDir, `sessions-${port}.json`)), false);
    });

    it('removing one variant does not affect others', function () {
      const ports = [8318, 8319, 8320];

      // Create 3 variants
      for (let i = 0; i < 3; i++) {
        const settingsPath = path.join(ccsDir, `variant${i}.settings.json`);
        fs.writeFileSync(settingsPath, JSON.stringify({ env: {} }));
        saveVariantLegacy(`variant${i}`, 'gemini', settingsPath, undefined, ports[i]);
        generateConfig('gemini', ports[i]);
        registerSession(ports[i], process.pid);
      }

      // Remove middle variant
      removeVariantFromLegacyConfig('variant1');
      deleteConfigForPort(8319);
      deleteSessionLockForPort(8319);

      // Verify others intact
      const variants = listVariantsFromConfig();
      assert.ok('variant0' in variants);
      assert.ok(!('variant1' in variants));
      assert.ok('variant2' in variants);

      assert.ok(configExists(8318));
      assert.strictEqual(configExists(8319), false);
      assert.ok(configExists(8320));

      assert.strictEqual(getProxyStatus(8318).running, true);
      assert.strictEqual(getProxyStatus(8319).running, false);
      assert.strictEqual(getProxyStatus(8320).running, true);

      // Clean up remaining
      deleteSessionLockForPort(8318);
      deleteSessionLockForPort(8320);
    });

    it('freed port can be reused after deletion', function () {
      // Create variant on first port
      const port1 = getNextAvailablePort();
      const settingsPath1 = path.join(ccsDir, 'first.settings.json');
      fs.writeFileSync(settingsPath1, JSON.stringify({ env: {} }));
      saveVariantLegacy('first', 'gemini', settingsPath1, undefined, port1);
      generateConfig('gemini', port1);

      // Next port should be port1 + 1
      const port2 = getNextAvailablePort();
      assert.strictEqual(port2, port1 + 1);

      // Remove first variant
      removeVariantFromLegacyConfig('first');
      deleteConfigForPort(port1);

      // port1 should now be available again
      const reusedPort = getNextAvailablePort();
      assert.strictEqual(reusedPort, port1, 'Freed port should be reusable');
    });
  });

  // ==========================================================================
  // Edge Cases for Port Isolation
  // ==========================================================================
  describe('Edge Cases', function () {
    it('default port (8317) uses sessions.json not sessions-8317.json', function () {
      registerSession(CLIPROXY_DEFAULT_PORT, process.pid);

      // Default port uses sessions.json
      assert.ok(fs.existsSync(path.join(cliproxyDir, 'sessions.json')));
      assert.strictEqual(
        fs.existsSync(path.join(cliproxyDir, `sessions-${CLIPROXY_DEFAULT_PORT}.json`)),
        false
      );

      deleteSessionLockForPort(CLIPROXY_DEFAULT_PORT);
    });

    it('default port (8317) uses config.yaml not config-8317.yaml', function () {
      generateConfig('gemini', CLIPROXY_DEFAULT_PORT);

      assert.ok(fs.existsSync(path.join(cliproxyDir, 'config.yaml')));
      assert.strictEqual(
        fs.existsSync(path.join(cliproxyDir, `config-${CLIPROXY_DEFAULT_PORT}.yaml`)),
        false
      );
    });

    it('port range is 8318-8417 (100 ports)', function () {
      assert.strictEqual(VARIANT_PORT_BASE, 8318);
      assert.strictEqual(VARIANT_PORT_MAX_OFFSET, 100);

      // First variant port
      assert.strictEqual(getNextAvailablePort(), 8318);

      // Create all 100
      for (let i = 0; i < 100; i++) {
        const port = getNextAvailablePort();
        const settingsPath = path.join(ccsDir, `v${i}.settings.json`);
        fs.writeFileSync(settingsPath, JSON.stringify({ env: {} }));
        saveVariantLegacy(`v${i}`, 'gemini', settingsPath, undefined, port);
      }

      // Last port should be 8417
      const lastVariant = listVariantsFromConfig()['v99'];
      assert.strictEqual(lastVariant.port, 8417);
    });

    it('handles stale session files from crashed processes', function () {
      const port = 8318;
      const sessionPath = path.join(cliproxyDir, `sessions-${port}.json`);

      // Write stale session with dead PID
      fs.writeFileSync(
        sessionPath,
        JSON.stringify({
          port,
          pid: 999999999, // Non-existent PID
          sessions: ['stale-session'],
          startedAt: new Date().toISOString(),
        })
      );

      // getExistingProxy should detect and clean up
      const lock = getExistingProxy(port);
      assert.strictEqual(lock, null);
      assert.strictEqual(fs.existsSync(sessionPath), false);
    });

    it('gracefully handles missing session file on unregister', function () {
      // Should not throw
      const result = unregisterSession('nonexistent-session', 8318);
      assert.strictEqual(result, true); // No file = should kill
    });

    it('gracefully handles missing config file on delete', function () {
      // Should not throw
      deleteConfigForPort(9999);
      assert.strictEqual(configExists(9999), false);
    });
  });
});
