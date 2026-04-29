/**
 * Unit tests for tool-name-mapper module
 */

const assert = require('assert');

const { ToolNameMapper } = require('../../../../dist/cliproxy/ai-providers/tool-name-mapper');

describe('Tool Name Mapper', () => {
  describe('registerTools', () => {
    it('returns unchanged tools when all names are valid', () => {
      const mapper = new ToolNameMapper();
      const tools = [
        { name: 'valid_tool', description: 'A valid tool' },
        { name: 'another_tool', description: 'Another tool' },
      ];

      const result = mapper.registerTools(tools);

      assert.strictEqual(result[0].name, 'valid_tool');
      assert.strictEqual(result[1].name, 'another_tool');
      assert.strictEqual(mapper.hasChanges(), false);
    });

    it('sanitizes long tool names', () => {
      const mapper = new ToolNameMapper();
      const longName = 'a'.repeat(100);
      const tools = [{ name: longName, description: 'Long name tool' }];

      const result = mapper.registerTools(tools);

      assert.strictEqual(result[0].name.length, 64);
      assert.strictEqual(mapper.hasChanges(), true);
    });

    it('sanitizes duplicate segment names', () => {
      const mapper = new ToolNameMapper();
      const tools = [{ name: 'foo__bar__bar', description: 'Duplicate segments' }];

      const result = mapper.registerTools(tools);

      assert.strictEqual(result[0].name, 'foo__bar');
      assert.strictEqual(mapper.hasChanges(), true);
    });

    it('preserves other tool properties', () => {
      const mapper = new ToolNameMapper();
      const tools = [
        {
          name: 'foo__bar__bar',
          description: 'Test tool',
          input_schema: { type: 'object' },
          custom_field: 'preserved',
        },
      ];

      const result = mapper.registerTools(tools);

      assert.strictEqual(result[0].description, 'Test tool');
      assert.deepStrictEqual(result[0].input_schema, { type: 'object' });
      assert.strictEqual(result[0].custom_field, 'preserved');
    });

    it('handles empty tools array', () => {
      const mapper = new ToolNameMapper();
      const result = mapper.registerTools([]);

      assert.deepStrictEqual(result, []);
      assert.strictEqual(mapper.hasChanges(), false);
    });

    it('handles mixed valid and invalid names', () => {
      const mapper = new ToolNameMapper();
      const tools = [{ name: 'valid_tool' }, { name: 'foo__bar__bar' }, { name: 'another_valid' }];

      const result = mapper.registerTools(tools);

      assert.strictEqual(result[0].name, 'valid_tool');
      assert.strictEqual(result[1].name, 'foo__bar');
      assert.strictEqual(result[2].name, 'another_valid');
      assert.strictEqual(mapper.hasChanges(), true);
      assert.strictEqual(mapper.getChangeCount(), 1);
    });
  });

  describe('restoreToolUse', () => {
    it('restores sanitized names in tool_use blocks', () => {
      const mapper = new ToolNameMapper();
      mapper.registerTools([{ name: 'foo__bar__bar' }]);

      const content = [{ type: 'tool_use', id: 'call_1', name: 'foo__bar', input: {} }];

      const result = mapper.restoreToolUse(content);

      assert.strictEqual(result[0].name, 'foo__bar__bar');
    });

    it('leaves non-tool_use blocks unchanged', () => {
      const mapper = new ToolNameMapper();
      mapper.registerTools([{ name: 'foo__bar__bar' }]);

      const content = [
        { type: 'text', text: 'Hello world' },
        { type: 'tool_use', id: 'call_1', name: 'foo__bar', input: {} },
      ];

      const result = mapper.restoreToolUse(content);

      assert.strictEqual(result[0].type, 'text');
      assert.strictEqual(result[0].text, 'Hello world');
      assert.strictEqual(result[1].name, 'foo__bar__bar');
    });

    it('leaves unknown tool names unchanged', () => {
      const mapper = new ToolNameMapper();
      mapper.registerTools([{ name: 'foo__bar__bar' }]);

      const content = [{ type: 'tool_use', id: 'call_1', name: 'unknown_tool', input: {} }];

      const result = mapper.restoreToolUse(content);

      assert.strictEqual(result[0].name, 'unknown_tool');
    });

    it('handles empty content array', () => {
      const mapper = new ToolNameMapper();
      const result = mapper.restoreToolUse([]);

      assert.deepStrictEqual(result, []);
    });

    it('handles tool_use without name property', () => {
      const mapper = new ToolNameMapper();
      mapper.registerTools([{ name: 'foo__bar__bar' }]);

      const content = [{ type: 'tool_use', id: 'call_1', input: {} }];

      const result = mapper.restoreToolUse(content);

      // Should return unchanged
      assert.deepStrictEqual(result[0], content[0]);
    });
  });

  describe('restoreName', () => {
    it('restores a single sanitized name', () => {
      const mapper = new ToolNameMapper();
      mapper.registerTools([{ name: 'foo__bar__bar' }]);

      const result = mapper.restoreName('foo__bar');

      assert.strictEqual(result, 'foo__bar__bar');
    });

    it('returns input for unknown names', () => {
      const mapper = new ToolNameMapper();
      mapper.registerTools([{ name: 'foo__bar__bar' }]);

      const result = mapper.restoreName('unknown');

      assert.strictEqual(result, 'unknown');
    });
  });

  describe('hasChanges', () => {
    it('returns false when no sanitization occurred', () => {
      const mapper = new ToolNameMapper();
      mapper.registerTools([{ name: 'valid_tool' }]);

      assert.strictEqual(mapper.hasChanges(), false);
    });

    it('returns true when sanitization occurred', () => {
      const mapper = new ToolNameMapper();
      mapper.registerTools([{ name: 'foo__bar__bar' }]);

      assert.strictEqual(mapper.hasChanges(), true);
    });
  });

  describe('getChanges', () => {
    it('returns empty array when no changes', () => {
      const mapper = new ToolNameMapper();
      mapper.registerTools([{ name: 'valid_tool' }]);

      assert.deepStrictEqual(mapper.getChanges(), []);
    });

    it('returns list of all changes', () => {
      const mapper = new ToolNameMapper();
      mapper.registerTools([{ name: 'foo__bar__bar' }, { name: 'baz__qux__qux' }]);

      const changes = mapper.getChanges();

      assert.strictEqual(changes.length, 2);
      assert.strictEqual(changes[0].original, 'foo__bar__bar');
      assert.strictEqual(changes[0].sanitized, 'foo__bar');
      assert.strictEqual(changes[1].original, 'baz__qux__qux');
      assert.strictEqual(changes[1].sanitized, 'baz__qux');
    });

    it('returns a copy (not the internal array)', () => {
      const mapper = new ToolNameMapper();
      mapper.registerTools([{ name: 'foo__bar__bar' }]);

      const changes1 = mapper.getChanges();
      const changes2 = mapper.getChanges();

      assert.notStrictEqual(changes1, changes2);
      assert.deepStrictEqual(changes1, changes2);
    });
  });

  describe('getChangeCount', () => {
    it('returns 0 when no changes', () => {
      const mapper = new ToolNameMapper();
      assert.strictEqual(mapper.getChangeCount(), 0);
    });

    it('returns correct count after sanitization', () => {
      const mapper = new ToolNameMapper();
      mapper.registerTools([
        { name: 'foo__bar__bar' },
        { name: 'valid_tool' },
        { name: 'baz__qux__qux' },
      ]);

      assert.strictEqual(mapper.getChangeCount(), 2);
    });
  });

  describe('clear', () => {
    it('resets all state', () => {
      const mapper = new ToolNameMapper();
      mapper.registerTools([{ name: 'foo__bar__bar' }]);

      assert.strictEqual(mapper.hasChanges(), true);

      mapper.clear();

      assert.strictEqual(mapper.hasChanges(), false);
      assert.deepStrictEqual(mapper.getChanges(), []);
      assert.strictEqual(mapper.restoreName('foo__bar'), 'foo__bar');
    });
  });

  describe('collision handling', () => {
    it('disambiguates when sanitized name collides with unchanged name', () => {
      const mapper = new ToolNameMapper();
      // 'abc__def__def' sanitizes to 'abc__def' (changed)
      // 'abc__def' is unchanged but collides with the sanitized name
      const tools = [{ name: 'abc__def__def' }, { name: 'abc__def' }];

      const result = mapper.registerTools(tools);

      assert.strictEqual(result[0].name, 'abc__def');
      assert.strictEqual(result[1].name, 'abc__def_2');
      assert.strictEqual(mapper.hasCollisions(), true);
    });

    it('disambiguates different originals that sanitize to the same name', () => {
      const mapper = new ToolNameMapper();
      const tools = [{ name: 'abc__def__def' }, { name: 'abc__def' }];

      const result = mapper.registerTools(tools);

      // 'abc__def__def' → 'abc__def' (deduped)
      // 'abc__def' → 'abc__def_2' (disambiguated, unchanged but collides)
      assert.strictEqual(result[0].name, 'abc__def');
      assert.strictEqual(result[1].name, 'abc__def_2');
    });

    it('restores both colliding tools to correct originals', () => {
      const mapper = new ToolNameMapper();
      const tools = [{ name: 'a__b__b' }, { name: 'a__b' }];

      mapper.registerTools(tools);

      const content = [
        { type: 'tool_use', id: '1', name: 'a__b', input: {} },
        { type: 'tool_use', id: '2', name: 'a__b_2', input: {} },
      ];

      const restored = mapper.restoreToolUse(content);

      assert.strictEqual(restored[0].name, 'a__b__b');
      assert.strictEqual(restored[1].name, 'a__b');
    });

    it('records collision metadata for logging', () => {
      const mapper = new ToolNameMapper();
      const tools = [{ name: 'x__y__y' }, { name: 'x__y' }];

      mapper.registerTools(tools);

      assert.strictEqual(mapper.hasCollisions(), true);
      const collisions = mapper.getCollisions();
      assert.strictEqual(collisions.length, 1);
      assert.strictEqual(collisions[0].base, 'x__y');
      assert.ok(collisions[0].originals.includes('x__y__y'));
      assert.ok(collisions[0].originals.includes('x__y'));
    });
  });
});
