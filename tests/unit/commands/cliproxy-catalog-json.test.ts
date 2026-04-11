import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

let originalConsoleLog: typeof console.log;
let capturedOutput: string[];

beforeEach(() => {
  originalConsoleLog = console.log;
  capturedOutput = [];
  console.log = (...args: unknown[]) => {
    capturedOutput.push(args.map(String).join(' '));
  };
});

afterEach(() => {
  console.log = originalConsoleLog;
});

describe('cliproxy catalog --json output', () => {
  it('outputs valid JSON mapping provider names to model arrays', async () => {
    const { handleCatalogJson } = await import(
      `../../../src/commands/cliproxy/catalog-subcommand?catalog-json-format=${Date.now()}`
    );

    handleCatalogJson();

    expect(capturedOutput).toHaveLength(1);
    const parsed = JSON.parse(capturedOutput[0]) as Record<
      string,
      Array<{ id: string; name: string }>
    >;

    // Must be a non-empty object (static catalog always has providers)
    expect(typeof parsed).toBe('object');
    expect(Object.keys(parsed).length).toBeGreaterThan(0);

    // Every provider entry must be an array of { id, name } objects
    for (const [provider, models] of Object.entries(parsed)) {
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
      for (const model of models) {
        expect(typeof model.id).toBe('string');
        expect(typeof model.name).toBe('string');
        // Only id and name — no extra metadata leaks
        expect(Object.keys(model).sort()).toEqual(['id', 'name']);
      }
      // Provider key should be a non-empty string
      expect(provider.length).toBeGreaterThan(0);
    }
  });

  it('outputs minified JSON (single line, no whitespace formatting)', async () => {
    const { handleCatalogJson } = await import(
      `../../../src/commands/cliproxy/catalog-subcommand?catalog-json-minified=${Date.now()}`
    );

    handleCatalogJson();

    const output = capturedOutput[0];
    // Minified JSON has no newlines
    expect(output.includes('\n')).toBe(false);
    // Valid JSON roundtrip
    expect(JSON.stringify(JSON.parse(output))).toBe(output);
  });
});
