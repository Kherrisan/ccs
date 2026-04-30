/**
 * Schema Sanitizer Unit Tests
 *
 * Tests for Gemini-compatible tool input_schema sanitization.
 * Verifies that only Gemini-supported fields are preserved.
 */

import { describe, expect, test } from 'bun:test';
import { sanitizeInputSchema, sanitizeToolSchemas } from '../schema-sanitizer';

describe('sanitizeInputSchema', () => {
  test('preserves Gemini-supported properties', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The name' },
        age: { type: 'number', minimum: 0, maximum: 150 },
      },
      required: ['name'],
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(0);
    expect(result.removedPaths).toEqual([]);
    expect(result.schema).toEqual(schema);
  });

  test('removes non-standard properties at top level', () => {
    const schema = {
      type: 'object',
      cornerRadius: 8,
      fillColor: '#ffffff',
      properties: {
        name: { type: 'string' },
      },
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(2);
    expect(result.removedPaths).toContain('cornerRadius');
    expect(result.removedPaths).toContain('fillColor');
    expect(result.schema).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    });
  });

  test('removes non-standard properties from nested properties', () => {
    const schema = {
      type: 'object',
      properties: {
        style: {
          type: 'object',
          fontFamily: 'Arial',
          fontSize: 12,
          properties: {
            color: { type: 'string' },
          },
        },
      },
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(2);
    expect(result.removedPaths).toContain('properties.style.fontFamily');
    expect(result.removedPaths).toContain('properties.style.fontSize');
    expect(result.schema).toEqual({
      type: 'object',
      properties: {
        style: {
          type: 'object',
          properties: {
            color: { type: 'string' },
          },
        },
      },
    });
  });

  test('removes non-standard properties from array items', () => {
    const schema = {
      type: 'array',
      items: {
        type: 'object',
        gap: 10,
        padding: 20,
        properties: {
          id: { type: 'string' },
        },
      },
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(2);
    expect(result.removedPaths).toContain('items.gap');
    expect(result.removedPaths).toContain('items.padding');
    expect(result.schema).toEqual({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
    });
  });

  test('preserves anyOf and sanitizes nested schemas', () => {
    const schema = {
      type: 'object',
      anyOf: [
        { type: 'string', customProp: 'remove' },
        { type: 'number', anotherCustom: 123 },
      ],
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(2);
    expect(result.schema).toEqual({
      type: 'object',
      anyOf: [{ type: 'string' }, { type: 'number' }],
    });
  });

  test('removes oneOf and allOf (not supported by Gemini)', () => {
    const schema = {
      type: 'object',
      oneOf: [{ type: 'string' }, { type: 'number' }],
      allOf: [{ required: ['name'] }],
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(2);
    expect(result.removedPaths).toContain('oneOf');
    expect(result.removedPaths).toContain('allOf');
    expect(result.schema).toEqual({ type: 'object' });
  });

  test('handles deeply nested structures', () => {
    const schema = {
      type: 'object',
      properties: {
        level1: {
          type: 'object',
          properties: {
            level2: {
              type: 'object',
              uiHint: 'remove-me',
              properties: {
                value: { type: 'string' },
              },
            },
          },
        },
      },
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(1);
    expect(result.removedPaths).toContain('properties.level1.properties.level2.uiHint');
  });

  test('strips "examples" field (issue #155)', () => {
    const schema = {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command to execute',
          examples: ['ls -la', 'git status'],
        },
        timeout: {
          type: 'number',
          description: 'Timeout in ms',
          examples: [5000, 10000],
        },
      },
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(2);
    expect(result.removedPaths).toContain('properties.command.examples');
    expect(result.removedPaths).toContain('properties.timeout.examples');
    expect(result.schema).toEqual({
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to execute' },
        timeout: { type: 'number', description: 'Timeout in ms' },
      },
    });
  });

  test('keeps "example" (singular) but strips "examples" (plural)', () => {
    const schema = {
      type: 'string',
      example: 'hello',
      examples: ['hello', 'world'],
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(1);
    expect(result.removedPaths).toContain('examples');
    expect(result.schema).toEqual({ type: 'string', example: 'hello' });
  });

  test('strips Gemini-unsupported JSON Schema metadata fields', () => {
    const schema = {
      $id: 'https://example.com/schema',
      $schema: 'https://json-schema.org/draft-07/schema#',
      title: 'Test Schema',
      description: 'A test schema',
      type: 'string',
      examples: ['example1', 'example2'],
      deprecated: false,
      readOnly: true,
      $comment: 'Internal comment',
    };

    const result = sanitizeInputSchema(schema);

    // $id, $schema, examples, deprecated, readOnly, $comment = 6 removed
    expect(result.removedCount).toBe(6);
    expect(result.removedPaths).toContain('$id');
    expect(result.removedPaths).toContain('$schema');
    expect(result.removedPaths).toContain('examples');
    expect(result.removedPaths).toContain('deprecated');
    expect(result.removedPaths).toContain('readOnly');
    expect(result.removedPaths).toContain('$comment');
    expect(result.schema).toEqual({
      title: 'Test Schema',
      description: 'A test schema',
      type: 'string',
    });
  });

  test('strips $defs, $ref, definitions (not supported by Gemini)', () => {
    const schema = {
      type: 'object',
      $defs: {
        address: {
          type: 'object',
          properties: { street: { type: 'string' } },
        },
      },
      properties: {
        home: { $ref: '#/$defs/address' },
      },
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(2);
    expect(result.removedPaths).toContain('$defs');
    expect(result.removedPaths).toContain('properties.home.$ref');
    expect(result.schema).toEqual({
      type: 'object',
      properties: {
        home: {},
      },
    });
  });

  test('strips additionalProperties (not supported by Gemini)', () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      additionalProperties: false,
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(1);
    expect(result.removedPaths).toContain('additionalProperties');
  });

  test('strips const, not, if/then/else (not supported by Gemini)', () => {
    const schema = {
      type: 'object',
      const: 'fixed',
      not: { type: 'number' },
      if: { properties: { type: { const: 'foo' } } },
      then: { required: ['foo'] },
      else: { required: ['bar'] },
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(5);
    expect(result.removedPaths).toContain('const');
    expect(result.removedPaths).toContain('not');
    expect(result.removedPaths).toContain('if');
    expect(result.removedPaths).toContain('then');
    expect(result.removedPaths).toContain('else');
    expect(result.schema).toEqual({ type: 'object' });
  });

  test('strips number/array/object validation fields unsupported by Gemini', () => {
    const schema = {
      type: 'object',
      properties: {
        score: {
          type: 'number',
          exclusiveMinimum: 0,
          exclusiveMaximum: 100,
          multipleOf: 5,
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          uniqueItems: true,
          contains: { type: 'string' },
          additionalItems: false,
        },
        meta: {
          type: 'object',
          writeOnly: true,
          definitions: { addr: { type: 'string' } },
        },
      },
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedPaths).toContain('properties.score.exclusiveMinimum');
    expect(result.removedPaths).toContain('properties.score.exclusiveMaximum');
    expect(result.removedPaths).toContain('properties.score.multipleOf');
    expect(result.removedPaths).toContain('properties.tags.uniqueItems');
    expect(result.removedPaths).toContain('properties.tags.contains');
    expect(result.removedPaths).toContain('properties.tags.additionalItems');
    expect(result.removedPaths).toContain('properties.meta.writeOnly');
    expect(result.removedPaths).toContain('properties.meta.definitions');
    expect(result.removedCount).toBe(8);
  });

  test('preserves example/default with complex values without recursion', () => {
    const schema = {
      type: 'object',
      example: ['value1', 'value2'],
      default: { nested: { deep: { unsupportedKey: true } } },
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(0);
    expect(result.schema.example).toEqual(['value1', 'value2']);
    expect(result.schema.default).toEqual({ nested: { deep: { unsupportedKey: true } } });
  });

  test('handles empty properties and anyOf edge cases', () => {
    const schema = {
      type: 'object',
      properties: {},
      anyOf: [],
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(0);
    expect(result.schema.properties).toEqual({});
    expect(result.schema.anyOf).toEqual([]);
  });

  test('preserves all Gemini-supported fields', () => {
    const schema = {
      type: 'object',
      format: 'date',
      title: 'Test',
      description: 'A test',
      nullable: true,
      example: { name: 'test' },
      default: {},
      enum: ['a', 'b'],
      properties: { name: { type: 'string' } },
      required: ['name'],
      minProperties: 1,
      maxProperties: 10,
      items: { type: 'string' },
      minItems: 0,
      maxItems: 100,
      minLength: 1,
      maxLength: 255,
      pattern: '^[a-z]+$',
      minimum: 0,
      maximum: 100,
      anyOf: [{ type: 'string' }],
      propertyOrdering: ['name'],
    };

    const result = sanitizeInputSchema(schema);

    expect(result.removedCount).toBe(0);
    expect(result.removedPaths).toEqual([]);
  });

  test('handles empty schema', () => {
    const result = sanitizeInputSchema({});

    expect(result.removedCount).toBe(0);
    expect(result.schema).toEqual({});
  });

  test('handles null input gracefully', () => {
    const result = sanitizeInputSchema(null as any);
    expect(result.schema).toBeNull();
    expect(result.removedCount).toBe(0);
  });

  test('handles undefined input gracefully', () => {
    const result = sanitizeInputSchema(undefined as any);
    expect(result.schema).toBeUndefined();
    expect(result.removedCount).toBe(0);
  });
});

describe('sanitizeToolSchemas', () => {
  test('sanitizes multiple tools and tracks per-tool changes', () => {
    const tools = [
      {
        name: 'clean_tool',
        input_schema: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
      },
      {
        name: 'figma_tool',
        input_schema: {
          type: 'object',
          cornerRadius: 8,
          fillColor: '#000',
          properties: { id: { type: 'string' } },
        },
      },
      {
        name: 'design_tool',
        input_schema: {
          type: 'object',
          fontWeight: 'bold',
          properties: { text: { type: 'string' } },
        },
      },
    ];

    const result = sanitizeToolSchemas(tools);

    expect(result.totalRemoved).toBe(3);
    expect(result.removedByTool).toHaveLength(2);
    expect(result.removedByTool[0].name).toBe('figma_tool');
    expect(result.removedByTool[0].removed).toContain('cornerRadius');
    expect(result.removedByTool[0].removed).toContain('fillColor');
    expect(result.removedByTool[1].name).toBe('design_tool');
    expect(result.removedByTool[1].removed).toContain('fontWeight');

    // Verify schemas are actually sanitized
    const figmaTool = result.tools.find((t) => t.name === 'figma_tool');
    expect(figmaTool?.input_schema).toEqual({
      type: 'object',
      properties: { id: { type: 'string' } },
    });
  });

  test('strips examples from Claude Code tool schemas (issue #155)', () => {
    const tools = [
      {
        name: 'Bash',
        input_schema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The command to execute',
              examples: ['ls -la', 'git status', 'npm install'],
            },
            timeout: {
              type: 'number',
              description: 'Timeout in ms',
              examples: [5000, 30000],
            },
          },
          required: ['command'],
        },
      },
      {
        name: 'Read',
        input_schema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'File path to read',
              examples: ['/src/index.ts', '/package.json'],
            },
          },
          required: ['file_path'],
        },
      },
    ];

    const result = sanitizeToolSchemas(tools);

    expect(result.totalRemoved).toBe(3);
    expect(result.removedByTool).toHaveLength(2);

    // Verify examples stripped from Bash tool
    const bashTool = result.tools.find((t) => t.name === 'Bash');
    expect(bashTool?.input_schema).toEqual({
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to execute' },
        timeout: { type: 'number', description: 'Timeout in ms' },
      },
      required: ['command'],
    });

    // Verify examples stripped from Read tool
    const readTool = result.tools.find((t) => t.name === 'Read');
    expect(readTool?.input_schema).toEqual({
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'File path to read' },
      },
      required: ['file_path'],
    });
  });

  test('handles tools without input_schema', () => {
    const tools = [{ name: 'simple_tool', description: 'No schema' }, { name: 'another_tool' }];

    const result = sanitizeToolSchemas(tools);

    expect(result.totalRemoved).toBe(0);
    expect(result.removedByTool).toHaveLength(0);
    expect(result.tools).toEqual(tools);
  });

  test('returns unmodified tools when all schemas are valid', () => {
    const tools = [
      {
        name: 'valid_tool',
        input_schema: {
          type: 'object',
          properties: { value: { type: 'number', minimum: 0 } },
          required: ['value'],
        },
      },
    ];

    const result = sanitizeToolSchemas(tools);

    expect(result.totalRemoved).toBe(0);
    expect(result.removedByTool).toHaveLength(0);
  });

  test('handles tools without input_schema (skips null tools)', () => {
    const tools = [
      { name: 'simple_tool', description: 'No schema' },
      { name: 'valid', input_schema: { type: 'object' } },
    ];
    const result = sanitizeToolSchemas(tools);
    expect(result.tools).toHaveLength(2);
    expect(result.tools[0].name).toBe('simple_tool');
    expect(result.tools[1].name).toBe('valid');
  });
});
