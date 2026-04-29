/**
 * Unit tests for tool-name-sanitizer module
 */

const assert = require('assert');

const {
  isValidToolName,
  removeDuplicateSegments,
  smartTruncate,
  sanitizeToolName,
  GEMINI_MAX_TOOL_NAME_LENGTH,
} = require('../../../../dist/cliproxy/ai-providers/tool-name-sanitizer');

describe('Tool Name Sanitizer', () => {
  describe('GEMINI_MAX_TOOL_NAME_LENGTH', () => {
    it('should be 64', () => {
      assert.strictEqual(GEMINI_MAX_TOOL_NAME_LENGTH, 64);
    });
  });

  describe('isValidToolName', () => {
    it('returns true for valid short names', () => {
      assert.strictEqual(isValidToolName('my_tool'), true);
      assert.strictEqual(isValidToolName('a'), true);
      assert.strictEqual(isValidToolName('_underscore'), true);
      assert.strictEqual(isValidToolName('Tool123'), true);
    });

    it('returns true for names with valid special characters', () => {
      assert.strictEqual(isValidToolName('my.tool'), true);
      assert.strictEqual(isValidToolName('my:tool'), true);
      assert.strictEqual(isValidToolName('my-tool'), true);
      assert.strictEqual(isValidToolName('my_tool.v1:test-123'), true);
    });

    it('returns true for exactly 64 character names', () => {
      const name64 = 'a'.repeat(64);
      assert.strictEqual(isValidToolName(name64), true);
    });

    it('returns false for names exceeding 64 characters', () => {
      const name65 = 'a'.repeat(65);
      assert.strictEqual(isValidToolName(name65), false);
    });

    it('returns false for empty string', () => {
      assert.strictEqual(isValidToolName(''), false);
    });

    it('returns false for names starting with number', () => {
      assert.strictEqual(isValidToolName('123start'), false);
      assert.strictEqual(isValidToolName('0tool'), false);
    });

    it('returns false for names with invalid characters', () => {
      assert.strictEqual(isValidToolName('has space'), false);
      assert.strictEqual(isValidToolName('has@symbol'), false);
      assert.strictEqual(isValidToolName('has#hash'), false);
    });
  });

  describe('removeDuplicateSegments', () => {
    it('removes consecutive duplicate segments', () => {
      assert.strictEqual(removeDuplicateSegments('foo__bar__bar'), 'foo__bar');
      assert.strictEqual(removeDuplicateSegments('gitmcp__x__x'), 'gitmcp__x');
    });

    it('removes multiple consecutive duplicates', () => {
      assert.strictEqual(removeDuplicateSegments('a__b__b__b'), 'a__b');
    });

    it('handles non-consecutive duplicates (keeps them)', () => {
      // Only consecutive duplicates are removed
      assert.strictEqual(removeDuplicateSegments('a__b__a'), 'a__b__a');
    });

    it('returns unchanged when no duplicates', () => {
      assert.strictEqual(removeDuplicateSegments('foo__bar__baz'), 'foo__bar__baz');
      assert.strictEqual(removeDuplicateSegments('no_dupes'), 'no_dupes');
    });

    it('handles single segment', () => {
      assert.strictEqual(removeDuplicateSegments('single'), 'single');
    });

    it('handles real-world MCP tool name with duplicates', () => {
      const input = 'gitmcp__plus-pro-components__plus-pro-components';
      const expected = 'gitmcp__plus-pro-components';
      assert.strictEqual(removeDuplicateSegments(input), expected);
    });
  });

  describe('smartTruncate', () => {
    it('returns unchanged for short names', () => {
      assert.strictEqual(smartTruncate('short', 64), 'short');
      assert.strictEqual(smartTruncate('a'.repeat(64), 64), 'a'.repeat(64));
    });

    it('truncates long names with hash suffix', () => {
      const longName = 'a'.repeat(100);
      const result = smartTruncate(longName, 64);

      assert.strictEqual(result.length, 64);
      assert.ok(result.includes('_')); // Has underscore separator
    });

    it('produces deterministic output', () => {
      const name = 'a'.repeat(100);
      const result1 = smartTruncate(name, 64);
      const result2 = smartTruncate(name, 64);

      assert.strictEqual(result1, result2);
    });

    it('produces different hashes for different inputs', () => {
      const result1 = smartTruncate('a'.repeat(100), 64);
      const result2 = smartTruncate('b'.repeat(100), 64);

      assert.notStrictEqual(result1, result2);
    });

    it('respects custom maxLen', () => {
      const result = smartTruncate('a'.repeat(50), 30);
      assert.strictEqual(result.length, 30);
    });
  });

  describe('sanitizeToolName', () => {
    it('returns unchanged for valid names without duplicates', () => {
      const result = sanitizeToolName('valid_name');
      assert.deepStrictEqual(result, { sanitized: 'valid_name', changed: false });
    });

    it('returns unchanged for 64-char valid names without duplicates', () => {
      const name64 = 'a'.repeat(64);
      const result = sanitizeToolName(name64);
      assert.deepStrictEqual(result, { sanitized: name64, changed: false });
    });

    it('removes duplicate segments', () => {
      const result = sanitizeToolName('foo__bar__bar');
      assert.strictEqual(result.sanitized, 'foo__bar');
      assert.strictEqual(result.changed, true);
    });

    it('truncates names exceeding 64 chars', () => {
      const longName = 'a'.repeat(100);
      const result = sanitizeToolName(longName);

      assert.strictEqual(result.sanitized.length, 64);
      assert.strictEqual(result.changed, true);
    });

    it('handles combined dedupe + truncate', () => {
      // Create a name that needs both dedupe and truncate
      const segment = 'very_long_segment_name_here';
      const duplicated = `prefix__${segment}__${segment}__${segment}`;
      const result = sanitizeToolName(duplicated);

      assert.ok(result.sanitized.length <= 64);
      assert.strictEqual(result.changed, true);
    });

    it('sanitizes real-world problematic MCP tool name', () => {
      const problematic = 'gitmcp__plus-pro-components__plus-pro-components';
      const result = sanitizeToolName(problematic);

      assert.ok(result.sanitized.length <= 64);
      assert.strictEqual(result.changed, true);
      assert.strictEqual(result.sanitized, 'gitmcp__plus-pro-components');
    });

    it('forces valid characters when name contains spaces', () => {
      const result = sanitizeToolName('has space');

      assert.strictEqual(result.sanitized, 'has_space');
      assert.strictEqual(result.changed, true);
      assert.ok(isValidToolName(result.sanitized));
    });

    it('forces valid characters when name starts with digit', () => {
      const result = sanitizeToolName('123start');

      assert.ok(result.sanitized.startsWith('_'));
      assert.strictEqual(result.changed, true);
      assert.ok(isValidToolName(result.sanitized));
    });

    it('forces valid characters when name contains symbols', () => {
      const result = sanitizeToolName('tool@name#here');

      assert.ok(!result.sanitized.includes('@'));
      assert.ok(!result.sanitized.includes('#'));
      assert.strictEqual(result.changed, true);
      assert.ok(isValidToolName(result.sanitized));
    });

    it('produces valid name for digit-starting long name', () => {
      const name = '1' + 'a'.repeat(100);
      const result = sanitizeToolName(name);

      assert.ok(isValidToolName(result.sanitized), `Expected valid name, got: ${result.sanitized}`);
      assert.ok(result.sanitized.length <= 64);
    });

    it('forces valid prefix for dot-starting name', () => {
      const result = sanitizeToolName('.tool');

      assert.ok(result.sanitized.startsWith('_'), `Expected _ prefix, got: ${result.sanitized}`);
      assert.ok(isValidToolName(result.sanitized));
      assert.strictEqual(result.changed, true);
    });

    it('forces valid prefix for hyphen-starting name', () => {
      const result = sanitizeToolName('-tool');

      assert.ok(result.sanitized.startsWith('_'), `Expected _ prefix, got: ${result.sanitized}`);
      assert.ok(isValidToolName(result.sanitized));
      assert.strictEqual(result.changed, true);
    });

    it('forces valid prefix for colon-starting name', () => {
      const result = sanitizeToolName(':tool');

      assert.ok(result.sanitized.startsWith('_'), `Expected _ prefix, got: ${result.sanitized}`);
      assert.ok(isValidToolName(result.sanitized));
      assert.strictEqual(result.changed, true);
    });
  });
});
