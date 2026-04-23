const { describe, expect, test } = require('bun:test');
const path = require('node:path');
const bucket = require('../../../scripts/run-test-bucket.js');

describe('run-test-bucket', () => {
  test('all declared slow tests still exist on disk', () => {
    for (const relativePath of bucket.slowTests) {
      const absolutePath = path.resolve(__dirname, '../../../', relativePath);
      expect(Bun.file(absolutePath).exists()).resolves.toBe(true);
    }
  });

  test('forces npm tests into the slow bucket', () => {
    expect(bucket.shouldForceSlow('tests/npm/cli.test.js')).toBe(true);
  });

  test('keeps dist-independent javascript tests in the fast bucket', () => {
    expect(bucket.shouldForceSlow('tests/unit/flag-parsing-simple.test.js')).toBe(false);
  });

  test('keeps non-allowlisted javascript tests in the slow bucket', () => {
    expect(bucket.shouldForceSlow('tests/unit/commands/persist-command.test.js')).toBe(true);
  });

  test('still forces dist-dependent tests into the slow bucket', () => {
    expect(bucket.shouldForceSlow('tests/unit/config-dir-override.test.js')).toBe(true);
  });
});
