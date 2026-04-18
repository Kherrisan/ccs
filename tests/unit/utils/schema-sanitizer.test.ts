import { describe, expect, it } from 'bun:test';

import { normalizeSchemaForOpenAI } from '../../../src/utils/schema-sanitizer';

describe('normalizeSchemaForOpenAI', () => {
  it('strips incompatible keywords and enforces strict object schemas', () => {
    const result = normalizeSchemaForOpenAI({
      type: 'object',
      properties: {
        query: { type: 'string', pattern: '^[a-z]+$', minLength: 3 },
        limit: { type: 'integer', minimum: 1 },
      },
      required: ['query', 'missing'],
      additionalProperties: true,
      default: { query: 'docs' },
    });

    expect(result).toEqual({
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer' },
      },
      required: ['query'],
      additionalProperties: false,
    });
  });

  it('drops enum and const values that no longer match the schema type', () => {
    const result = normalizeSchemaForOpenAI({
      type: 'string',
      enum: ['ok', 1, null],
      const: 1,
    });

    expect(result).toEqual({
      type: 'string',
      enum: ['ok'],
    });
  });

  it('normalizes nested combinators and arrays recursively', () => {
    const result = normalizeSchemaForOpenAI({
      anyOf: [
        {
          type: 'object',
          properties: {
            image: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  url: { type: 'string', format: 'uri' },
                },
              },
            },
          },
        },
      ],
    });

    expect(result).toEqual({
      anyOf: [
        {
          type: 'object',
          properties: {
            image: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                },
                required: [],
                additionalProperties: false,
              },
            },
          },
          required: [],
          additionalProperties: false,
        },
      ],
    });
  });
});
