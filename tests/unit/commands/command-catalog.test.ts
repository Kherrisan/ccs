import { describe, expect, test } from 'bun:test';

import { ROOT_COMMAND_CATALOG, getAllRootCommandTokens } from '../../../src/commands/command-catalog';
import { ROOT_COMMAND_ROUTES } from '../../../src/commands/root-command-router';

describe('command catalog', () => {
  test('covers every routed root command and alias', () => {
    const catalogTokens = new Set(getAllRootCommandTokens());

    for (const route of ROOT_COMMAND_ROUTES) {
      expect(catalogTokens.has(route.name)).toBe(true);
      for (const alias of route.aliases || []) {
        expect(catalogTokens.has(alias)).toBe(true);
      }
    }
  });

  test('keeps hidden operational hooks out of the public help surface', () => {
    const hiddenCommands = ROOT_COMMAND_CATALOG.filter((entry) => entry.visibility === 'hidden').map(
      (entry) => entry.name
    );

    expect(hiddenCommands).toContain('--install');
    expect(hiddenCommands).toContain('--uninstall');
    expect(hiddenCommands).toContain('__complete');
  });
});
